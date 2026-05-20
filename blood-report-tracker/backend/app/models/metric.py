from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import Boolean, Float, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CanonicalMetric(Base):
    __tablename__ = "canonical_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    canonical_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    panel_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    aliases: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    default_unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    typical_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    typical_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Relationships
    metric_results: Mapped[List["MetricResult"]] = relationship(
        "MetricResult", back_populates="canonical_metric"
    )


class MetricResult(Base):
    __tablename__ = "metric_results"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonical_metric_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("canonical_metrics.id", ondelete="SET NULL"), nullable=True
    )
    raw_name: Mapped[str] = mapped_column(String(512), nullable=False)
    panel_name: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ref_range_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ref_range_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ref_range_text: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, server_default="1.0")
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    user_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    # Relationships
    report: Mapped["Report"] = relationship("Report", back_populates="metric_results")  # noqa: F821
    user: Mapped["User"] = relationship("User", back_populates="metric_results")  # noqa: F821
    canonical_metric: Mapped[Optional["CanonicalMetric"]] = relationship(
        "CanonicalMetric", back_populates="metric_results"
    )
