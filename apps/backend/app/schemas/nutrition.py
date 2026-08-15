"""Nutrition synchronization wire shapes."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field
from sqlmodel import SQLModel


class FoodItemCreate(SQLModel):
    id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    calories_per_serving: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    serving_label: str = Field(min_length=1, max_length=80)
    created_at: datetime


class FoodItemRead(FoodItemCreate):
    user_id: uuid.UUID


class NutritionEntryCreate(SQLModel):
    id: uuid.UUID
    food_item_id: uuid.UUID
    logged_at: datetime
    logged_date: date
    quantity: float = Field(gt=0)
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]


class NutritionEntryRead(NutritionEntryCreate):
    user_id: uuid.UUID


class MacroTargetUpsert(SQLModel):
    id: uuid.UUID
    calories: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    effective_date: date
    created_at: datetime


class MacroTargetRead(MacroTargetUpsert):
    user_id: uuid.UUID
