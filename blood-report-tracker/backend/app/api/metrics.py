from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.metric import CanonicalMetric, MetricResult
from app.models.report import Report
from app.models.user import User

router = APIRouter(prefix="/metrics", tags=["metrics"])


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class MetricResultOut(BaseModel):
    id: int
    report_id: int
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


class PanelSummary(BaseModel):
    panel_name: str
    metric_count: int


class MetricSummaryItem(BaseModel):
    canonical_metric_id: Optional[int]
    canonical_name: Optional[str]
    panel_name: str
    raw_name: str
    latest_value: float
    latest_unit: Optional[str]
    latest_report_date: Optional[date]
    latest_report_id: int
    ref_range_low: Optional[float]
    ref_range_high: Optional[float]
    out_of_range: bool
    trend: str  # "up", "down", "stable", "insufficient_data"
    needs_review: bool


class MetricHistoryItem(BaseModel):
    metric_result_id: int
    value: float
    unit: Optional[str]
    report_date: Optional[date]
    report_id: int
    ref_range_low: Optional[float]
    ref_range_high: Optional[float]
    needs_review: bool


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[MetricResultOut])
async def list_metrics(
    panel_name: Optional[str] = Query(None),
    needs_review: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(MetricResult).where(MetricResult.user_id == current_user.id)

    if panel_name:
        query = query.where(MetricResult.panel_name == panel_name)
    if needs_review is not None:
        query = query.where(MetricResult.needs_review == needs_review)

    query = query.order_by(MetricResult.created_at.desc())
    result = await db.execute(query)
    metrics = result.scalars().all()
    return [MetricResultOut.model_validate(m) for m in metrics]


@router.get("/panels", response_model=List[PanelSummary])
async def list_panels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MetricResult.panel_name, func.count(MetricResult.id).label("metric_count"))
        .where(MetricResult.user_id == current_user.id)
        .group_by(MetricResult.panel_name)
        .order_by(MetricResult.panel_name)
    )
    rows = result.all()
    return [PanelSummary(panel_name=row.panel_name, metric_count=row.metric_count) for row in rows]


@router.get("/summary", response_model=List[MetricSummaryItem])
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the latest metric value per canonical metric for the dashboard,
    with trend calculation (based on last 2 readings) and out_of_range flag.
    """
    # Get all metric results for the user, joined with their reports for report_date
    result = await db.execute(
        select(MetricResult, Report.report_date)
        .join(Report, MetricResult.report_id == Report.id)
        .where(MetricResult.user_id == current_user.id)
        .order_by(MetricResult.canonical_metric_id, Report.report_date.desc(), MetricResult.created_at.desc())
    )
    rows = result.all()

    # Group by canonical_metric_id (or raw_name if no canonical match)
    groups: dict = {}
    for metric, report_date in rows:
        key = metric.canonical_metric_id if metric.canonical_metric_id else f"raw:{metric.raw_name}"
        if key not in groups:
            groups[key] = []
        groups[key].append((metric, report_date))

    # Fetch canonical metric names in one query
    canonical_ids = [k for k in groups if isinstance(k, int)]
    canonical_map: dict = {}
    if canonical_ids:
        cm_result = await db.execute(
            select(CanonicalMetric).where(CanonicalMetric.id.in_(canonical_ids))
        )
        for cm in cm_result.scalars().all():
            canonical_map[cm.id] = cm

    summary_items = []
    for key, entries in groups.items():
        latest_metric, latest_report_date = entries[0]

        # Determine trend
        if len(entries) < 2:
            trend = "insufficient_data"
        else:
            prev_metric, _ = entries[1]
            diff = latest_metric.value - prev_metric.value
            if abs(diff) < 1e-9:
                trend = "stable"
            elif diff > 0:
                trend = "up"
            else:
                trend = "down"

        # Out of range check
        out_of_range = False
        if latest_metric.ref_range_low is not None and latest_metric.value < latest_metric.ref_range_low:
            out_of_range = True
        if latest_metric.ref_range_high is not None and latest_metric.value > latest_metric.ref_range_high:
            out_of_range = True

        canonical_name: Optional[str] = None
        if isinstance(key, int) and key in canonical_map:
            canonical_name = canonical_map[key].canonical_name

        summary_items.append(
            MetricSummaryItem(
                canonical_metric_id=latest_metric.canonical_metric_id,
                canonical_name=canonical_name,
                panel_name=latest_metric.panel_name,
                raw_name=latest_metric.raw_name,
                latest_value=latest_metric.value,
                latest_unit=latest_metric.unit,
                latest_report_date=latest_report_date,
                latest_report_id=latest_metric.report_id,
                ref_range_low=latest_metric.ref_range_low,
                ref_range_high=latest_metric.ref_range_high,
                out_of_range=out_of_range,
                trend=trend,
                needs_review=latest_metric.needs_review,
            )
        )

    return summary_items


@router.get("/{canonical_name}/history", response_model=List[MetricHistoryItem])
async def get_metric_history(
    canonical_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns a time series of metric values for a given canonical metric name.
    """
    # Find canonical metric
    cm_result = await db.execute(
        select(CanonicalMetric).where(CanonicalMetric.canonical_name == canonical_name)
    )
    canonical_metric = cm_result.scalar_one_or_none()

    if canonical_metric is None:
        # Try to find by raw_name fallback
        result = await db.execute(
            select(MetricResult, Report.report_date)
            .join(Report, MetricResult.report_id == Report.id)
            .where(
                MetricResult.user_id == current_user.id,
                MetricResult.raw_name == canonical_name,
            )
            .order_by(Report.report_date.asc())
        )
    else:
        result = await db.execute(
            select(MetricResult, Report.report_date)
            .join(Report, MetricResult.report_id == Report.id)
            .where(
                MetricResult.user_id == current_user.id,
                MetricResult.canonical_metric_id == canonical_metric.id,
            )
            .order_by(Report.report_date.asc())
        )

    rows = result.all()
    return [
        MetricHistoryItem(
            metric_result_id=metric.id,
            value=metric.value,
            unit=metric.unit,
            report_date=report_date,
            report_id=metric.report_id,
            ref_range_low=metric.ref_range_low,
            ref_range_high=metric.ref_range_high,
            needs_review=metric.needs_review,
        )
        for metric, report_date in rows
    ]
