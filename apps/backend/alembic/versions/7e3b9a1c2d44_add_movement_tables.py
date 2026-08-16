"""add movement replay tables

Revision ID: 7e3b9a1c2d44
Revises: 4d91e2f7c3ab
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision: str = "7e3b9a1c2d44"
down_revision: str | None = "4d91e2f7c3ab"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "movement_activities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("activity_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=False),
        sa.Column("elapsed_seconds", sa.Integer(), nullable=False),
        sa.Column("moving_seconds", sa.Integer(), nullable=False),
        sa.Column("paused_seconds", sa.Integer(), nullable=False),
        sa.Column("distance_meters", sa.Float(), nullable=False),
        sa.Column("elevation_gain_meters", sa.Float(), nullable=False),
        sa.Column("average_speed_mps", sa.Float(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("activity_type IN ('run', 'walk', 'ride')", name="ck_movement_type"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_movement_user_started", "movement_activities", ["user_id", "started_at"])
    op.create_table(
        "movement_points",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("activity_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("altitude_meters", sa.Float(), nullable=True),
        sa.Column("horizontal_accuracy_meters", sa.Float(), nullable=True),
        sa.Column("provider_speed_mps", sa.Float(), nullable=True),
        sa.Column("processing_state", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("rejection_reason", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("is_paused", sa.Boolean(), nullable=False),
        sa.Column("excluded_by_edit", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["activity_id"], ["movement_activities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_id", "sequence", name="uq_movement_point_sequence"),
    )
    op.create_table(
        "movement_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("activity_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("payload_json", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.ForeignKeyConstraint(["activity_id"], ["movement_activities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_id", "sequence", name="uq_movement_event_sequence"),
    )


def downgrade() -> None:
    op.drop_table("movement_events")
    op.drop_table("movement_points")
    op.drop_index("ix_movement_user_started", table_name="movement_activities")
    op.drop_table("movement_activities")
