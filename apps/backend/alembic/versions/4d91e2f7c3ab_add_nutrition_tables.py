"""add nutrition tables

Revision ID: 4d91e2f7c3ab
Revises: 3f82b1d94a61
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision: str = "4d91e2f7c3ab"
down_revision: str | None = "3f82b1d94a61"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "food_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("calories_per_serving", sa.Float(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=False),
        sa.Column("carbs_g", sa.Float(), nullable=False),
        sa.Column("fat_g", sa.Float(), nullable=False),
        sa.Column("serving_label", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("calories_per_serving >= 0", name="ck_food_calories"),
        sa.CheckConstraint("protein_g >= 0", name="ck_food_protein"),
        sa.CheckConstraint("carbs_g >= 0", name="ck_food_carbs"),
        sa.CheckConstraint("fat_g >= 0", name="ck_food_fat"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_food_items_user_name", "food_items", ["user_id", "name"])
    op.create_table(
        "nutrition_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("food_item_id", sa.Uuid(), nullable=False),
        sa.Column("logged_at", sa.DateTime(), nullable=False),
        sa.Column("logged_date", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("meal_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_nutrition_entry_quantity"),
        sa.CheckConstraint(
            "meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')",
            name="ck_nutrition_entry_meal",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["food_item_id"], ["food_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_nutrition_entries_user_date", "nutrition_entries", ["user_id", "logged_date"])
    op.create_table(
        "macro_targets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("calories", sa.Float(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=False),
        sa.Column("carbs_g", sa.Float(), nullable=False),
        sa.Column("fat_g", sa.Float(), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "effective_date", name="uq_macro_target_effective"),
    )
    op.create_index(
        "ix_macro_targets_user_effective", "macro_targets", ["user_id", "effective_date"]
    )


def downgrade() -> None:
    op.drop_index("ix_macro_targets_user_effective", table_name="macro_targets")
    op.drop_table("macro_targets")
    op.drop_index("ix_nutrition_entries_user_date", table_name="nutrition_entries")
    op.drop_table("nutrition_entries")
    op.drop_index("ix_food_items_user_name", table_name="food_items")
    op.drop_table("food_items")
