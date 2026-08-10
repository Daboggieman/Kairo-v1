"""Workout models — mirrors the Workout logging section of `02-data-model.md`."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.user import utcnow


class Exercise(SQLModel, table=True):
    """Reference table, seeded with common lifts; the user can add custom entries."""

    __tablename__ = "exercises"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True)
    muscle_group: str | None = None
    equipment: str | None = None
    is_custom: bool = Field(default=False)


class WorkoutSession(SQLModel, table=True):
    __tablename__ = "workout_sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    started_at: datetime = Field(default_factory=utcnow)
    ended_at: datetime | None = None
    notes: str | None = None


class WorkoutSet(SQLModel, table=True):
    __tablename__ = "workout_sets"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="workout_sessions.id", index=True)
    exercise_id: uuid.UUID = Field(foreign_key="exercises.id", index=True)
    set_number: int
    reps: int
    weight: float
    weight_unit: str = Field(default="kg")
    rpe: float | None = None
    rest_seconds: int | None = None
