"""Authenticated replay-safe nutrition endpoints."""

import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlmodel import Session, select

from app.core.auth import get_current_user
from app.core.db import get_session
from app.models.nutrition import FoodItem, MacroTarget, NutritionEntry
from app.models.user import User
from app.schemas.nutrition import (
    FoodItemCreate,
    FoodItemRead,
    MacroTargetRead,
    MacroTargetUpsert,
    NutritionEntryCreate,
    NutritionEntryRead,
)

router = APIRouter(tags=["nutrition"], dependencies=[Depends(get_current_user)])


def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


@router.post("/food-items", response_model=FoodItemRead, status_code=201)
def create_food(
    payload: FoodItemCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> FoodItem:
    existing = session.get(FoodItem, payload.id)
    if existing is not None:
        expected = payload.model_dump()
        expected["created_at"] = _utc_naive(payload.created_at)
        actual = existing.model_dump(exclude={"user_id"})
        if existing.user_id == user.id and actual == expected:
            return existing
        raise HTTPException(status_code=409, detail="Food item id already exists")
    data = payload.model_dump()
    data["created_at"] = _utc_naive(payload.created_at)
    food = FoodItem(**data, user_id=user.id)
    session.add(food)
    session.commit()
    session.refresh(food)
    return food


@router.get("/food-items", response_model=list[FoodItemRead])
def list_foods(
    search: str = Query(default=""),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[FoodItem]:
    statement = select(FoodItem).where(FoodItem.user_id == user.id)
    if search.strip():
        statement = statement.where(FoodItem.name.ilike(f"%{search.strip()}%"))
    return list(session.exec(statement.order_by(FoodItem.name)).all())


@router.post("/nutrition-entries", response_model=NutritionEntryRead, status_code=201)
def create_entry(
    payload: NutritionEntryCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> NutritionEntry:
    food = session.get(FoodItem, payload.food_item_id)
    if food is None or food.user_id != user.id:
        raise HTTPException(status_code=404, detail="Food item not found")
    existing = session.get(NutritionEntry, payload.id)
    if existing is not None:
        expected = payload.model_dump()
        expected["logged_at"] = _utc_naive(payload.logged_at)
        actual = existing.model_dump(exclude={"user_id"})
        if existing.user_id == user.id and actual == expected:
            return existing
        raise HTTPException(status_code=409, detail="Nutrition entry id already exists")
    data = payload.model_dump()
    data["logged_at"] = _utc_naive(payload.logged_at)
    entry = NutritionEntry(**data, user_id=user.id)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.get("/nutrition-entries", response_model=list[NutritionEntryRead])
def list_entries(
    logged_date: date | None = Query(default=None, alias="date"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[NutritionEntry]:
    statement = select(NutritionEntry).where(NutritionEntry.user_id == user.id)
    if logged_date is not None:
        statement = statement.where(NutritionEntry.logged_date == logged_date)
    return list(session.exec(statement.order_by(NutritionEntry.logged_at)).all())


@router.delete("/nutrition-entries/{entry_id}", status_code=204)
def delete_entry(
    entry_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    entry = session.get(NutritionEntry, entry_id)
    if entry is not None and entry.user_id == user.id:
        session.delete(entry)
        session.commit()
    return Response(status_code=204)


@router.put("/macro-targets", response_model=MacroTargetRead)
def upsert_target(
    payload: MacroTargetUpsert,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MacroTarget:
    target = session.exec(
        select(MacroTarget).where(
            MacroTarget.user_id == user.id,
            MacroTarget.effective_date == payload.effective_date,
        )
    ).first()
    if target is None:
        collision = session.get(MacroTarget, payload.id)
        if collision is not None:
            raise HTTPException(status_code=409, detail="Macro target id already exists")
        data = payload.model_dump()
        data["created_at"] = _utc_naive(payload.created_at)
        target = MacroTarget(**data, user_id=user.id)
    else:
        target.calories = payload.calories
        target.protein_g = payload.protein_g
        target.carbs_g = payload.carbs_g
        target.fat_g = payload.fat_g
    session.add(target)
    session.commit()
    session.refresh(target)
    return target


@router.get("/macro-targets", response_model=list[MacroTargetRead])
def list_targets(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[MacroTarget]:
    return list(
        session.exec(
            select(MacroTarget)
            .where(MacroTarget.user_id == user.id)
            .order_by(MacroTarget.effective_date)
        ).all()
    )
