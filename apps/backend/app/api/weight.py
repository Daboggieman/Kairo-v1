"""Authenticated body-weight endpoints for local-first sync."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlmodel import Session, select

from app.core.auth import get_current_user
from app.core.db import get_session
from app.models.user import User
from app.models.weight import BodyWeightEntry
from app.schemas.weight import BodyWeightEntryCreate, BodyWeightEntryRead

router = APIRouter(
    tags=["weight"],
    dependencies=[Depends(get_current_user)],
)


def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _same_entry(existing: BodyWeightEntry, payload: BodyWeightEntryCreate) -> bool:
    return (
        existing.recorded_at == _utc_naive(payload.recorded_at)
        and existing.weight == payload.weight
        and existing.weight_unit == payload.weight_unit
        and existing.note == payload.note
    )


@router.post("/weight-entries", response_model=BodyWeightEntryRead, status_code=201)
def create_weight_entry(
    payload: BodyWeightEntryCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BodyWeightEntry:
    existing = session.get(BodyWeightEntry, payload.id)
    if existing is not None:
        if existing.user_id == user.id and _same_entry(existing, payload):
            return existing
        raise HTTPException(status_code=409, detail="Weight entry id already exists")

    data = payload.model_dump()
    data["recorded_at"] = _utc_naive(payload.recorded_at)
    entry = BodyWeightEntry(**data, user_id=user.id)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.get("/weight-entries", response_model=list[BodyWeightEntryRead])
def list_weight_entries(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[BodyWeightEntry]:
    statement = select(BodyWeightEntry).where(BodyWeightEntry.user_id == user.id)
    if from_ is not None:
        statement = statement.where(BodyWeightEntry.recorded_at >= from_)
    if to is not None:
        statement = statement.where(BodyWeightEntry.recorded_at <= to)
    return list(session.exec(statement.order_by(BodyWeightEntry.recorded_at)).all())


@router.delete("/weight-entries/{entry_id}", status_code=204)
def delete_weight_entry(
    entry_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    entry = session.get(BodyWeightEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        # DELETE is replayed from an offline outbox. Already absent and not-owned are both
        # indistinguishable no-ops, which keeps deletion idempotent without leaking ownership.
        return Response(status_code=204)
    session.delete(entry)
    session.commit()
    return Response(status_code=204)
