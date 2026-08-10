"""User model.

Modelled now even though Kairo is single-user today: `02-data-model.md` calls this out
as what makes the eventual jump to multi-device/multi-user a schema no-op.
"""

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    timezone: str = Field(default="UTC")
    # sa.JSON renders as JSONB-compatible JSON on Postgres and TEXT on SQLite.
    preferences: dict = Field(default_factory=dict, sa_column=sa.Column(sa.JSON, nullable=False))
