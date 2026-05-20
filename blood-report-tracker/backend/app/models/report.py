import enum
from datetime import date, datetime, timezone
from typing import List, Optional

from sqlalchemy import Date, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ReportStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    complete = "complete"
    needs_review = "needs_review"
    failed = "failed"


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    lab_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    report_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, name="reportstatus"),
        default=ReportStatus.pending,
        server_default=ReportStatus.pending.value,
        nullable=False,
    )
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="reports")  # noqa: F821
    metric_results: Mapped[List["MetricResult"]] = relationship(  # noqa: F821
        "MetricResult", back_populates="report", cascade="all, delete-orphan"
    )
