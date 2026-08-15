"""add body weight entries

Revision ID: 1a6f2c9d4e70
Revises: c7080c2dd1c6
Create Date: 2026-08-15

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision: str = "1a6f2c9d4e70"
down_revision: str | None = "c7080c2dd1c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "body_weight_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("weight_unit", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("note", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.CheckConstraint("weight > 0", name="ck_body_weight_entries_weight_positive"),
        sa.CheckConstraint(
            "weight_unit IN ('kg', 'lb')", name="ck_body_weight_entries_weight_unit"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("body_weight_entries", schema=None) as batch_op:
        batch_op.create_index(
            "ix_body_weight_entries_user_recorded", ["user_id", "recorded_at"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("body_weight_entries", schema=None) as batch_op:
        batch_op.drop_index("ix_body_weight_entries_user_recorded")
    op.drop_table("body_weight_entries")
