"""Wire shapes for task and completion synchronization."""

import uuid
from datetime import date, datetime

from pydantic import Field
from sqlmodel import SQLModel


class TaskCreate(SQLModel):
    id: uuid.UUID
    title: str = Field(min_length=1, max_length=80)
    recurrence_rule: str = Field(min_length=1, max_length=100)
    created_at: datetime
    archived: bool = False


class TaskRead(TaskCreate):
    user_id: uuid.UUID


class TaskArchiveUpdate(SQLModel):
    archived: bool


class TaskCompletionCreate(SQLModel):
    id: uuid.UUID
    task_id: uuid.UUID
    completed_date: date
    completed_at: datetime


class TaskCompletionRead(TaskCompletionCreate):
    pass
