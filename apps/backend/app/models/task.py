"""Task and completion facts; streaks remain derived from completion dates."""

import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class Task(SQLModel, table=True):
    __tablename__ = "tasks"
    __table_args__ = (sa.Index("ix_tasks_user_archived", "user_id", "archived"),)

    id: uuid.UUID = Field(primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    title: str
    recurrence_rule: str = Field(default="daily")
    created_at: datetime
    archived: bool = Field(default=False)


class TaskCompletion(SQLModel, table=True):
    __tablename__ = "task_completions"
    __table_args__ = (
        sa.UniqueConstraint("task_id", "completed_date", name="uq_task_completion_date"),
        sa.Index("ix_task_completions_task_date", "task_id", "completed_date"),
    )

    id: uuid.UUID = Field(primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="tasks.id", ondelete="CASCADE")
    completed_date: date
    completed_at: datetime
