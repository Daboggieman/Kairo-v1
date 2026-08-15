"""Request and response schemas for body-weight sync."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field
from sqlmodel import SQLModel


class BodyWeightEntryCreate(SQLModel):
    id: uuid.UUID
    recorded_at: datetime
    weight: float = Field(gt=0)
    weight_unit: Literal["kg", "lb"] = "kg"
    note: str | None = None


class BodyWeightEntryRead(BodyWeightEntryCreate):
    user_id: uuid.UUID
