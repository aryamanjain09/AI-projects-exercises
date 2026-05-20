from datetime import datetime, timezone
from typing import List

from sqlalchemy import String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    # Relationships
    reports: Mapped[List["Report"]] = relationship(  # noqa: F821
        "Report", back_populates="user", cascade="all, delete-orphan"
    )
    metric_results: Mapped[List["MetricResult"]] = relationship(  # noqa: F821
        "MetricResult", back_populates="user"
    )
