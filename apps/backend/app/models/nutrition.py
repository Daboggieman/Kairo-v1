"""Personal foods, consumed entries, and effective-dated macro targets."""

import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class FoodItem(SQLModel, table=True):
    __tablename__ = "food_items"
    __table_args__ = (
        sa.CheckConstraint("calories_per_serving >= 0", name="ck_food_calories"),
        sa.CheckConstraint("protein_g >= 0", name="ck_food_protein"),
        sa.CheckConstraint("carbs_g >= 0", name="ck_food_carbs"),
        sa.CheckConstraint("fat_g >= 0", name="ck_food_fat"),
        sa.Index("ix_food_items_user_name", "user_id", "name"),
    )

    id: uuid.UUID = Field(primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    name: str
    calories_per_serving: float
    protein_g: float
    carbs_g: float
    fat_g: float
    serving_label: str
    created_at: datetime


class NutritionEntry(SQLModel, table=True):
    __tablename__ = "nutrition_entries"
    __table_args__ = (
        sa.CheckConstraint("quantity > 0", name="ck_nutrition_entry_quantity"),
        sa.CheckConstraint(
            "meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')",
            name="ck_nutrition_entry_meal",
        ),
        sa.Index("ix_nutrition_entries_user_date", "user_id", "logged_date"),
    )

    id: uuid.UUID = Field(primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    food_item_id: uuid.UUID = Field(foreign_key="food_items.id")
    logged_at: datetime
    logged_date: date
    quantity: float
    meal_type: str


class MacroTarget(SQLModel, table=True):
    __tablename__ = "macro_targets"
    __table_args__ = (
        sa.UniqueConstraint("user_id", "effective_date", name="uq_macro_target_effective"),
        sa.Index("ix_macro_targets_user_effective", "user_id", "effective_date"),
    )

    id: uuid.UUID = Field(primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    effective_date: date
    created_at: datetime
