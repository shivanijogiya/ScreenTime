import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)       # phone|tablet|laptop
    priority: Mapped[int] = mapped_column(Integer, default=1)       # 1–10
    last_heartbeat: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="devices")  # noqa: F821
    budgets: Mapped[list["Budget"]] = relationship(  # noqa: F821
        "Budget", back_populates="device", cascade="all, delete-orphan"
    )
    usage_events: Mapped[list["UsageEvent"]] = relationship(  # noqa: F821
        "UsageEvent", back_populates="device", cascade="all, delete-orphan"
    )