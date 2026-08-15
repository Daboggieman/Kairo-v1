"""Request/response schemas for the workouts API."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel


class ExerciseCreate(SQLModel):
    name: str
    muscle_group: str | None = None
    equipment: str | None = None


class ExerciseRead(SQLModel):
    id: uuid.UUID
    name: str
    muscle_group: str | None
    equipment: str | None
    is_custom: bool


class WorkoutSessionCreate(SQLModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    started_at: datetime | None = None
    notes: str | None = None


class WorkoutSessionUpdate(SQLModel):
    ended_at: datetime | None = None
    notes: str | None = None


class WorkoutSetCreate(SQLModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    exercise_id: str
    set_number: int
    reps: int
    weight: float
    weight_unit: str = "kg"
    rpe: float | None = None
    rest_seconds: int | None = None


class WorkoutSetRead(SQLModel):
    id: uuid.UUID
    session_id: uuid.UUID
    exercise_id: uuid.UUID
    set_number: int
    reps: int
    weight: float
    weight_unit: str
    rpe: float | None
    rest_seconds: int | None


class WorkoutSessionRead(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    notes: str | None


class WorkoutSessionDetail(WorkoutSessionRead):
    sets: list[WorkoutSetRead] = []
