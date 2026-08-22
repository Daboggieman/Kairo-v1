"""Authenticated workout endpoints used by the Phase 2 sync path."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlmodel import Session, select

from app.core.auth import get_current_user
from app.core.db import get_session
from app.models.user import User
from app.models.workout import Exercise, WorkoutSession, WorkoutSet
from app.schemas.workout import (
    ExerciseCreate,
    ExerciseRead,
    WorkoutSessionCreate,
    WorkoutSessionDetail,
    WorkoutSessionRead,
    WorkoutSessionUpdate,
    WorkoutSetCreate,
    WorkoutSetRead,
    WorkoutSetUpdate,
)

router = APIRouter(tags=["workouts"], dependencies=[Depends(get_current_user)])


def replay_value_matches(stored: object, incoming: object) -> bool:
    if isinstance(stored, datetime) and isinstance(incoming, datetime):
        def as_utc_naive(value: datetime) -> datetime:
            if value.tzinfo is None:
                return value
            return value.astimezone(UTC).replace(tzinfo=None)
        return as_utc_naive(stored) == as_utc_naive(incoming)
    return stored == incoming


def resolve_exercise(session: Session, client_id: str) -> Exercise:
    try:
        exercise_id = uuid.UUID(client_id)
    except ValueError:
        exercise_id = uuid.uuid5(uuid.NAMESPACE_URL, f"kairo-exercise-{client_id}")
    exercise = session.get(Exercise, exercise_id)
    if exercise is not None:
        return exercise
    name = client_id.removeprefix("seed-").replace("-", " ").title()
    exercise = Exercise(
        id=exercise_id,
        name=name or "Exercise",
        is_custom=not client_id.startswith("seed-"),
    )
    session.add(exercise)
    session.flush()
    return exercise


@router.get("/exercises", response_model=list[ExerciseRead])
def list_exercises(session: Session = Depends(get_session)) -> list[Exercise]:
    return list(session.exec(select(Exercise).order_by(Exercise.name)).all())


@router.post("/exercises", response_model=ExerciseRead, status_code=201)
def create_exercise(
    payload: ExerciseCreate, session: Session = Depends(get_session)
) -> Exercise:
    exercise = Exercise(**payload.model_dump(), is_custom=True)
    session.add(exercise)
    session.commit()
    session.refresh(exercise)
    return exercise


@router.post("/workouts", response_model=WorkoutSessionRead, status_code=201)
def create_workout(
    payload: WorkoutSessionCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkoutSession:
    data = payload.model_dump(exclude_none=True)
    existing = session.get(WorkoutSession, payload.id)
    if existing is not None:
        expected = {**data, "user_id": user.id}
        matches = all(
            replay_value_matches(getattr(existing, key), value)
            for key, value in expected.items()
        )
        if existing.user_id == user.id and matches:
            return existing
        raise HTTPException(status_code=409, detail="Workout session id already exists")
    workout = WorkoutSession(**data, user_id=user.id)
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return workout


@router.get("/workouts", response_model=list[WorkoutSessionRead])
def list_workouts(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[WorkoutSession]:
    statement = select(WorkoutSession).where(WorkoutSession.user_id == user.id)
    if from_ is not None:
        statement = statement.where(WorkoutSession.started_at >= from_)
    if to is not None:
        statement = statement.where(WorkoutSession.started_at <= to)
    return list(session.exec(statement.order_by(WorkoutSession.started_at.desc())).all())


@router.get("/workouts/{workout_id}", response_model=WorkoutSessionDetail)
def get_workout(
    workout_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkoutSessionDetail:
    workout = session.get(WorkoutSession, workout_id)
    if workout is None or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workout session not found")
    sets = session.exec(
        select(WorkoutSet)
        .where(WorkoutSet.session_id == workout_id)
        .order_by(WorkoutSet.set_number)
    ).all()
    return WorkoutSessionDetail(
        **workout.model_dump(),
        sets=[WorkoutSetRead(**s.model_dump()) for s in sets],
    )


@router.patch("/workouts/{workout_id}", response_model=WorkoutSessionRead)
def update_workout(
    workout_id: uuid.UUID,
    payload: WorkoutSessionUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkoutSession:
    workout = session.get(WorkoutSession, workout_id)
    if workout is None or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workout session not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(workout, key, value)
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return workout


@router.post("/workouts/{workout_id}/sets", response_model=list[WorkoutSetRead], status_code=201)
def add_sets(
    workout_id: uuid.UUID,
    payload: list[WorkoutSetCreate],
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[WorkoutSet]:
    """Accepts an array so a session logged entirely offline syncs in one call.

    `03-api-design.md` flags bulk endpoints as the right shape once the app is
    offline-first, which it is.
    """
    workout = session.get(WorkoutSession, workout_id)
    if workout is None or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workout session not found")
    created: list[WorkoutSet] = []
    for item in payload:
        data = item.model_dump()
        exercise = resolve_exercise(session, data.pop("exercise_id"))
        data["exercise_id"] = exercise.id
        existing = session.get(WorkoutSet, item.id)
        if existing is not None:
            expected = {**data, "session_id": workout_id}
            if all(getattr(existing, key) == value for key, value in expected.items()):
                created.append(existing)
                continue
            raise HTTPException(status_code=409, detail="Workout set id already exists")
        created.append(WorkoutSet(session_id=workout_id, **data))
    session.add_all(created)
    session.commit()
    for item in created:
        session.refresh(item)
    return created


def owned_set(
    session: Session, workout_id: uuid.UUID, set_id: uuid.UUID, user: User
) -> WorkoutSet | None:
    """The set, but only if it sits in this workout and this workout is the caller's.

    Both halves matter. Checking the session's owner is what isolates one user's sets
    from another's, and checking `session_id` stops a correct set id under the wrong
    workout from being edited through a URL that misdescribes it.
    """
    workout_set = session.get(WorkoutSet, set_id)
    if workout_set is None or workout_set.session_id != workout_id:
        return None
    workout = session.get(WorkoutSession, workout_id)
    if workout is None or workout.user_id != user.id:
        return None
    return workout_set


@router.patch("/workouts/{workout_id}/sets/{set_id}", response_model=WorkoutSetRead)
def update_set(
    workout_id: uuid.UUID,
    set_id: uuid.UUID,
    payload: WorkoutSetUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkoutSet:
    """A correction to a set that has already been synced.

    `add_sets` cannot carry this. It raises 409 when an id already exists with any
    differing field, which is exactly what an edit is, and the mobile outbox treats
    409 as terminal — so an edit replayed through the create route marked its row
    failed and never retried, leaving the server on the pre-edit values.

    Replaying the same PATCH twice sets the same values, so no id bookkeeping is
    needed to make it safe.
    """
    workout_set = owned_set(session, workout_id, set_id, user)
    if workout_set is None:
        raise HTTPException(status_code=404, detail="Workout set not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(workout_set, key, value)
    session.add(workout_set)
    session.commit()
    session.refresh(workout_set)
    return workout_set


@router.delete("/workouts/{workout_id}/sets/{set_id}", status_code=204)
def delete_set(
    workout_id: uuid.UUID,
    set_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    """Idempotent, like `delete_movement`: an absent set is a 204, not a 404.

    The outbox treats 404 as terminal, so a re-delivered delete must not fail. The
    second attempt is the same intent arriving twice — the set being gone is the
    outcome it wanted, not an error.
    """
    workout_set = owned_set(session, workout_id, set_id, user)
    if workout_set is None:
        return Response(status_code=204)
    session.delete(workout_set)
    session.commit()
    return Response(status_code=204)
