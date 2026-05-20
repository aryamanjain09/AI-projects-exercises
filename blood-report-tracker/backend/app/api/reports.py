import io
import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.metric import MetricResult
from app.models.report import Report, ReportStatus
from app.models.user import User
from app.services.storage import delete_pdf, upload_pdf

router = APIRouter(prefix="/reports", tags=["reports"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class ReportListItem(BaseModel):
    id: int
    filename: str
    lab_name: Optional[str]
    report_date: Optional[date]
    status: ReportStatus
    created_at: datetime
    metric_count: int

    model_config = {"from_attributes": True}


class MetricResultOut(BaseModel):
    id: int
    report_id: int
    user_id: int
    canonical_metric_id: Optional[int]
    raw_name: str
    panel_name: str
    value: float
    unit: Optional[str]
    ref_range_low: Optional[float]
    ref_range_high: Optional[float]
    ref_range_text: Optional[str]
    confidence: float
    needs_review: bool
    user_confirmed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportDetail(BaseModel):
    id: int
    user_id: int
    filename: str
    storage_key: str
    lab_name: Optional[str]
    report_date: Optional[date]
    status: ReportStatus
    raw_text: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    metric_results: List[MetricResultOut]

    model_config = {"from_attributes": True}


class ReportStatusOut(BaseModel):
    id: int
    status: ReportStatus
    error_message: Optional[str]

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    report_id: int
    status: ReportStatus


class MetricPatchItem(BaseModel):
    metric_id: int
    value: Optional[float] = None
    unit: Optional[str] = None
    ref_range_low: Optional[float] = None
    ref_range_high: Optional[float] = None
    user_confirmed: Optional[bool] = None


class MetricPatchRequest(BaseModel):
    metrics: List[MetricPatchItem]


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_report(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate content type
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only PDF files are accepted",
            )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds 20 MB limit",
        )

    # Generate a unique storage key
    unique_id = uuid.uuid4().hex
    safe_filename = (file.filename or "report.pdf").replace(" ", "_")
    storage_key = f"users/{current_user.id}/{unique_id}/{safe_filename}"

    # Upload to MinIO
    await upload_pdf(file_bytes, storage_key)

    # Create DB record
    report = Report(
        user_id=current_user.id,
        filename=file.filename or "report.pdf",
        storage_key=storage_key,
        status=ReportStatus.pending,
    )
    db.add(report)
    await db.flush()
    await db.refresh(report)

    # Enqueue ARQ job
    try:
        import redis.asyncio as aioredis
        from arq import create_pool
        from arq.connections import RedisSettings

        redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
        pool = await create_pool(redis_settings)
        await pool.enqueue_job("parse_report_task", report.id)
        await pool.aclose()
    except Exception as exc:
        # Don't fail the upload if the queue is unavailable — the worker can be
        # triggered manually or via a retry mechanism.
        import logging
        logging.getLogger(__name__).warning("Failed to enqueue parse_report_task: %s", exc)

    return UploadResponse(report_id=report.id, status=report.status)


@router.get("/", response_model=List[ReportListItem])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Fetch reports with metric count via subquery
    metric_count_subq = (
        select(MetricResult.report_id, func.count(MetricResult.id).label("cnt"))
        .group_by(MetricResult.report_id)
        .subquery()
    )

    result = await db.execute(
        select(Report, func.coalesce(metric_count_subq.c.cnt, 0).label("metric_count"))
        .outerjoin(metric_count_subq, Report.id == metric_count_subq.c.report_id)
        .where(Report.user_id == current_user.id)
        .order_by(Report.created_at.desc())
    )
    rows = result.all()

    items = []
    for report, metric_count in rows:
        item = ReportListItem(
            id=report.id,
            filename=report.filename,
            lab_name=report.lab_name,
            report_date=report.report_date,
            status=report.status,
            created_at=report.created_at,
            metric_count=metric_count,
        )
        items.append(item)
    return items


@router.get("/{report_id}", response_model=ReportDetail)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.metric_results))
        .where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return ReportDetail.model_validate(report)


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Delete from MinIO
    try:
        await delete_pdf(report.storage_key)
    except Exception:
        pass  # Don't block DB deletion on storage errors

    await db.delete(report)


@router.get("/{report_id}/status", response_model=ReportStatusOut)
async def get_report_status(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return ReportStatusOut.model_validate(report)


@router.get("/{report_id}/raw-text")
async def get_raw_text(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return {"report_id": report.id, "raw_text": report.raw_text}


@router.patch("/{report_id}/metrics", response_model=ReportStatusOut)
async def patch_report_metrics(
    report_id: int,
    body: MetricPatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify report ownership
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Apply patches
    for patch in body.metrics:
        metric_result = await db.execute(
            select(MetricResult).where(
                MetricResult.id == patch.metric_id,
                MetricResult.report_id == report_id,
                MetricResult.user_id == current_user.id,
            )
        )
        metric = metric_result.scalar_one_or_none()
        if not metric:
            continue

        if patch.value is not None:
            metric.value = patch.value
        if patch.unit is not None:
            metric.unit = patch.unit
        if patch.ref_range_low is not None:
            metric.ref_range_low = patch.ref_range_low
        if patch.ref_range_high is not None:
            metric.ref_range_high = patch.ref_range_high
        if patch.user_confirmed is not None:
            metric.user_confirmed = patch.user_confirmed
            if patch.user_confirmed:
                metric.needs_review = False

    await db.flush()

    # Check if any metrics still need review
    pending_result = await db.execute(
        select(func.count(MetricResult.id)).where(
            MetricResult.report_id == report_id,
            MetricResult.needs_review == True,  # noqa: E712
            MetricResult.user_confirmed == False,  # noqa: E712
        )
    )
    pending_count = pending_result.scalar_one()

    if pending_count == 0 and report.status == ReportStatus.needs_review:
        report.status = ReportStatus.complete

    await db.flush()
    await db.refresh(report)
    return ReportStatusOut.model_validate(report)
