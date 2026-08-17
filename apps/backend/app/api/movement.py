"""Authenticated replay-safe movement aggregate endpoints."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, delete, select

from app.core.auth import get_current_user
from app.core.db import get_session
from app.models.movement import MovementActivity, MovementEvent, MovementPoint
from app.models.user import User
from app.schemas.movement import (
    MovementActivityRead,
    MovementActivitySummary,
    MovementActivityWrite,
    MovementEventWrite,
    MovementPointWrite,
)

router = APIRouter(tags=["movement"], dependencies=[Depends(get_current_user)])


def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _normalized(payload: MovementActivityWrite) -> MovementActivityWrite:
    return payload.model_copy(update={
        "started_at": _utc_naive(payload.started_at),
        "ended_at": _utc_naive(payload.ended_at),
        "created_at": _utc_naive(payload.created_at),
        "updated_at": _utc_naive(payload.updated_at),
        "points": [
            point.model_copy(update={"recorded_at": _utc_naive(point.recorded_at)})
            for point in payload.points
        ],
        "events": [
            event.model_copy(update={"occurred_at": _utc_naive(event.occurred_at)})
            for event in payload.events
        ],
    })


def _aggregate(session: Session, activity: MovementActivity) -> MovementActivityRead:
    points = session.exec(
        select(MovementPoint)
        .where(MovementPoint.activity_id == activity.id)
        .order_by(MovementPoint.sequence)
    ).all()
    events = session.exec(
        select(MovementEvent)
        .where(MovementEvent.activity_id == activity.id)
        .order_by(MovementEvent.sequence)
    ).all()
    return MovementActivityRead(
        **MovementActivitySummary.model_validate(activity).model_dump(),
        points=[MovementPointWrite.model_validate(point) for point in points],
        events=[MovementEventWrite.model_validate(event) for event in events],
    )


def _same(existing: MovementActivityRead, payload: MovementActivityWrite) -> bool:
    return existing.model_dump(exclude={"user_id"}) == payload.model_dump()


def _validate_sequences(payload: MovementActivityWrite) -> None:
    sequences = [point.sequence for point in payload.points]
    event_sequences = [event.sequence for event in payload.events]
    if len(sequences) != len(set(sequences)) or len(event_sequences) != len(set(event_sequences)):
        raise HTTPException(status_code=422, detail="Movement sequences must be unique")


def _insert_facts(session: Session, payload: MovementActivityWrite) -> None:
    for point in payload.points:
        session.add(MovementPoint(**point.model_dump(), activity_id=payload.id))
    for event in payload.events:
        session.add(MovementEvent(**event.model_dump(), activity_id=payload.id))


@router.post("/movements", response_model=MovementActivityRead, status_code=201)
def upload_movement(
    payload: MovementActivityWrite,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MovementActivityRead:
    payload = _normalized(payload)
    existing = session.get(MovementActivity, payload.id)
    if existing is not None:
        aggregate = _aggregate(session, existing)
        if existing.user_id == user.id and _same(aggregate, payload):
            return aggregate
        raise HTTPException(status_code=409, detail="Movement activity id already exists")

    _validate_sequences(payload)

    activity_data = payload.model_dump(exclude={"points", "events"})
    activity = MovementActivity(**activity_data, user_id=user.id)
    session.add(activity)
    _insert_facts(session, payload)
    session.commit()
    session.refresh(activity)
    return _aggregate(session, activity)


@router.put("/movements/{activity_id}", response_model=MovementActivityRead)
def replace_movement(
    activity_id: uuid.UUID,
    payload: MovementActivityWrite,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MovementActivityRead:
    payload = _normalized(payload)
    if payload.id != activity_id:
        raise HTTPException(status_code=422, detail="Movement activity id does not match path")
    _validate_sequences(payload)
    activity = session.get(MovementActivity, activity_id)
    if activity is None or activity.user_id != user.id:
        raise HTTPException(status_code=404, detail="Movement activity not found")
    existing = _aggregate(session, activity)
    if _same(existing, payload):
        return existing
    if payload.revision <= activity.revision:
        raise HTTPException(status_code=409, detail="Movement revision is not newer")

    activity_data = payload.model_dump(exclude={"points", "events", "id"})
    for key, value in activity_data.items():
        setattr(activity, key, value)
    session.exec(delete(MovementPoint).where(MovementPoint.activity_id == activity_id))
    session.exec(delete(MovementEvent).where(MovementEvent.activity_id == activity_id))
    session.flush()
    _insert_facts(session, payload)
    session.add(activity)
    session.commit()
    session.refresh(activity)
    return _aggregate(session, activity)


@router.get("/movements", response_model=list[MovementActivitySummary])
def list_movements(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[MovementActivity]:
    return list(session.exec(
        select(MovementActivity)
        .where(MovementActivity.user_id == user.id)
        .order_by(MovementActivity.started_at.desc())
    ).all())


@router.get("/movements/{activity_id}", response_model=MovementActivityRead)
def get_movement(
    activity_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MovementActivityRead:
    activity = session.get(MovementActivity, activity_id)
    if activity is None or activity.user_id != user.id:
        raise HTTPException(status_code=404, detail="Movement activity not found")
    return _aggregate(session, activity)


@router.delete("/movements/{activity_id}", status_code=204)
def delete_movement(
    activity_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    activity = session.get(MovementActivity, activity_id)
    if activity is None or activity.user_id != user.id:
        return Response(status_code=204)
    session.delete(activity)
    session.commit()
    return Response(status_code=204)
