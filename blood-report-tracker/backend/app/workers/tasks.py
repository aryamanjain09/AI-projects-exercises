import logging
from datetime import date, datetime, timezone
from typing import Any, Dict

from arq.connections import RedisSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.metric import CanonicalMetric, MetricResult
from app.models.report import Report, ReportStatus
from app.services import pdf_parser, storage
from app.services.normalizer import normalize_metric_name

logger = logging.getLogger(__name__)


async def parse_report_task(ctx: Dict[str, Any], report_id: int) -> None:
    """
    ARQ background task that:
    1. Fetches the Report record
    2. Sets status = processing
    3. Downloads PDF from MinIO
    4. Parses PDF with pdfplumber + Claude
    5. Normalizes metrics and inserts MetricResult rows
    6. Updates report status (complete or needs_review)
    7. On any error: sets status = failed with error message
    """
    async with AsyncSessionLocal() as db:
        try:
            await _process_report(db, report_id)
        except Exception as exc:
            logger.exception("Unhandled error in parse_report_task for report %d", report_id)
            await _mark_failed(db, report_id, str(exc))


async def _process_report(db: AsyncSession, report_id: int) -> None:
    # 1. Fetch report
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if report is None:
        logger.error("Report %d not found, cannot process.", report_id)
        return

    # 2. Mark as processing
    report.status = ReportStatus.processing
    await db.flush()
    logger.info("Processing report %d (user=%d, file=%s)", report_id, report.user_id, report.filename)

    # 3. Download PDF
    try:
        pdf_bytes = await storage.download_pdf(report.storage_key)
    except Exception as exc:
        raise RuntimeError(f"Failed to download PDF from storage: {exc}") from exc

    # 4. Parse PDF
    try:
        parse_result = await pdf_parser.parse_pdf(pdf_bytes)
    except ValueError as exc:
        # Image-based PDF or unparseable
        raise RuntimeError(str(exc)) from exc

    # 5. Store raw_text and report metadata
    report.raw_text = parse_result.raw_text

    if parse_result.lab_name:
        report.lab_name = parse_result.lab_name

    if parse_result.report_date:
        try:
            report.report_date = date.fromisoformat(parse_result.report_date)
        except (ValueError, TypeError):
            logger.warning("Could not parse report_date '%s'", parse_result.report_date)

    # 6. Insert metric results
    any_needs_review = False

    for panel in parse_result.panels:
        for metric_data in panel.metrics:
            # Normalize metric name
            canonical: CanonicalMetric | None = await normalize_metric_name(
                metric_data.raw_name, db
            )

            needs_review = metric_data.confidence < settings.CONFIDENCE_THRESHOLD

            if needs_review:
                any_needs_review = True

            metric_result = MetricResult(
                report_id=report.id,
                user_id=report.user_id,
                canonical_metric_id=canonical.id if canonical else None,
                raw_name=metric_data.raw_name,
                panel_name=panel.panel_name,
                value=metric_data.value,
                unit=metric_data.unit,
                ref_range_low=metric_data.ref_range_low,
                ref_range_high=metric_data.ref_range_high,
                ref_range_text=metric_data.ref_range_text,
                confidence=metric_data.confidence,
                needs_review=needs_review,
                user_confirmed=False,
                created_at=datetime.now(timezone.utc),
            )
            db.add(metric_result)

    # 7. Update report status
    report.status = ReportStatus.needs_review if any_needs_review else ReportStatus.complete
    await db.flush()
    logger.info(
        "Report %d processed: status=%s, panels=%d",
        report_id,
        report.status.value,
        len(parse_result.panels),
    )
    await db.commit()


async def _mark_failed(db: AsyncSession, report_id: int, error_message: str) -> None:
    try:
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        if report:
            report.status = ReportStatus.failed
            report.error_message = error_message[:2000]  # truncate to column limit
            await db.commit()
    except Exception as inner_exc:
        logger.error("Failed to mark report %d as failed: %s", report_id, inner_exc)


# ─── ARQ Worker Settings ──────────────────────────────────────────────────────

class WorkerSettings:
    functions = [parse_report_task]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
    job_timeout = 300  # 5 minutes per job
    keep_result = 3600  # keep job results for 1 hour
    retry_jobs = True
    max_tries = 3
