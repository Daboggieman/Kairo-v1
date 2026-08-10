"""Workouts router — mirrors the Workouts section of `03-api-design.md`.

TODO(phase-2): these endpoints are currently UNAUTHENTICATED and are not called by the
mobile app, which is local-first this phase. Before exposing this service publicly, add
the JWT dependency from `03-api-design.md` (`POST /auth/token`) and derive `user_id`
from the token instead of accepting it in the request body.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.core.db import get_session
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
)

router = APIRouter(tags=["workouts"])


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
    payload: WorkoutSessionCreate, session: Session = Depends(get_session)
) -> WorkoutSession:
    data = payload.model_dump(exclude_none=True)
    workout = WorkoutSession(**data)
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return workout


@router.get("/workouts", response_model=list[WorkoutSessionRead])
def list_workouts(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[WorkoutSession]:
    statement = select(WorkoutSession)
    if from_ is not None:
        statement = statement.where(WorkoutSession.started_at >= from_)
    if to is not None:
        statement = statement.where(WorkoutSession.started_at <= to)
    return list(session.exec(statement.order_by(WorkoutSession.started_at.desc())).all())


@router.get("/workouts/{workout_id}", response_model=WorkoutSessionDetail)
def get_workout(
    workout_id: uuid.UUID, session: Session = Depends(get_session)
) -> WorkoutSessionDetail:
    workout = session.get(WorkoutSession, workout_id)
    if workout is None:
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
) -> WorkoutSession:
    workout = session.get(WorkoutSession, workout_id)
    if workout is None:
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
) -> list[WorkoutSet]:
    """Accepts an array so a session logged entirely offline syncs in one call.

    `03-api-design.md` flags bulk endpoints as the right shape once the app is
    offline-first, which it is.
    """
    workout = session.get(WorkoutSession, workout_id)
    if workout is None:
        raise HTTPException(status_code=404, detail="Workout session not found")
    created = [WorkoutSet(session_id=workout_id, **item.model_dump()) for item in payload]
    session.add_all(created)
    session.commit()
    for item in created:
        session.refresh(item)
    return created
