"""Body-weight model shared by API persistence and sync."""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class BodyWeightEntry(SQLModel, table=True):
    __tablename__ = "body_weight_entries"
    __table_args__ = (
        sa.CheckConstraint("weight > 0", name="ck_body_weight_entries_weight_positive"),
        sa.CheckConstraint(
            "weight_unit IN ('kg', 'lb')", name="ck_body_weight_entries_weight_unit"
        ),
        sa.Index("ix_body_weight_entries_user_recorded", "user_id", "recorded_at"),
    )

    id: uuid.UUID = Field(primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    recorded_at: datetime
    weight: float
    weight_unit: str = Field(default="kg")
    note: str | None = None
