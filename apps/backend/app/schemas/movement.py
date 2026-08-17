"""Aggregate wire contract for replay-safe movement uploads."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field
from sqlmodel import SQLModel


class MovementPointWrite(SQLModel):
    id: uuid.UUID
    sequence: int = Field(ge=0)
    recorded_at: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude_meters: float | None = None
    horizontal_accuracy_meters: float | None = Field(default=None, ge=0)
    provider_speed_mps: float | None = None
    processing_state: Literal["accepted", "rejected"]
    rejection_reason: str | None = None
    is_paused: bool = False
    excluded_by_edit: bool = False


class MovementEventWrite(SQLModel):
    id: uuid.UUID
    sequence: int = Field(ge=0)
    event_type: str
    occurred_at: datetime
    payload_json: str | None = None


class MovementActivityWrite(SQLModel):
    id: uuid.UUID
    activity_type: Literal["run", "walk", "ride"]
    name: str | None = None
    started_at: datetime
    ended_at: datetime
    elapsed_seconds: int = Field(ge=0)
    moving_seconds: int = Field(ge=0)
    paused_seconds: int = Field(ge=0)
    distance_meters: float = Field(ge=0)
    elevation_gain_meters: float = Field(default=0, ge=0)
    average_speed_mps: float | None = Field(default=None, ge=0)
    revision: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime
    points: list[MovementPointWrite]
    events: list[MovementEventWrite]


class MovementActivitySummary(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    activity_type: str
    name: str | None
    started_at: datetime
    ended_at: datetime
    elapsed_seconds: int
    moving_seconds: int
    paused_seconds: int
    distance_meters: float
    elevation_gain_meters: float
    average_speed_mps: float | None
    revision: int
    created_at: datetime
    updated_at: datetime


class MovementActivityRead(MovementActivitySummary):
    points: list[MovementPointWrite]
    events: list[MovementEventWrite]
