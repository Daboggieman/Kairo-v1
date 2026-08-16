"""add tasks and completions

Revision ID: 3f82b1d94a61
Revises: 1a6f2c9d4e70
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision: str = "3f82b1d94a61"
down_revision: str | None = "1a6f2c9d4e70"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("recurrence_rule", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_user_archived", "tasks", ["user_id", "archived"])
    op.create_table(
        "task_completions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("completed_date", sa.Date(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "completed_date", name="uq_task_completion_date"),
    )
    op.create_index(
        "ix_task_completions_task_date", "task_completions", ["task_id", "completed_date"]
    )


def downgrade() -> None:
    op.drop_index("ix_task_completions_task_date", table_name="task_completions")
    op.drop_table("task_completions")
    op.drop_index("ix_tasks_user_archived", table_name="tasks")
    op.drop_table("tasks")
