"""Server-owned movement activities and their immutable replay facts."""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class MovementActivity(SQLModel, table=True):
    __tablename__ = "movement_activities"
    __table_args__ = (
        sa.CheckConstraint("activity_type IN ('run', 'walk', 'ride')", name="ck_movement_type"),
        sa.Index("ix_movement_user_started", "user_id", "started_at"),
    )

    id: uuid.UUID = Field(primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    activity_type: str
    name: str | None = None
    started_at: datetime
    ended_at: datetime
    elapsed_seconds: int
    moving_seconds: int
    paused_seconds: int
    distance_meters: float
    elevation_gain_meters: float = 0
    average_speed_mps: float | None = None
    revision: int = 1
    created_at: datetime
    updated_at: datetime


class MovementPoint(SQLModel, table=True):
    __tablename__ = "movement_points"
    __table_args__ = (
        sa.UniqueConstraint("activity_id", "sequence", name="uq_movement_point_sequence"),
    )

    id: uuid.UUID = Field(primary_key=True)
    activity_id: uuid.UUID = Field(foreign_key="movement_activities.id", ondelete="CASCADE")
    sequence: int
    recorded_at: datetime
    latitude: float
    longitude: float
    altitude_meters: float | None = None
    horizontal_accuracy_meters: float | None = None
    provider_speed_mps: float | None = None
    processing_state: str
    rejection_reason: str | None = None
    is_paused: bool = False
    excluded_by_edit: bool = False


class MovementEvent(SQLModel, table=True):
    __tablename__ = "movement_events"
    __table_args__ = (
        sa.UniqueConstraint("activity_id", "sequence", name="uq_movement_event_sequence"),
    )

    id: uuid.UUID = Field(primary_key=True)
    activity_id: uuid.UUID = Field(foreign_key="movement_activities.id", ondelete="CASCADE")
    sequence: int
    event_type: str
    occurred_at: datetime
    payload_json: str | None = None
