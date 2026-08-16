"""Authenticated replay-safe task and completion endpoints."""

import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.core.auth import get_current_user
from app.core.db import get_session
from app.models.task import Task, TaskCompletion
from app.models.user import User
from app.schemas.task import (
    TaskArchiveUpdate,
    TaskCompletionCreate,
    TaskCompletionRead,
    TaskCreate,
    TaskRead,
)

router = APIRouter(tags=["tasks"], dependencies=[Depends(get_current_user)])


def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _same_task(existing: Task, payload: TaskCreate) -> bool:
    return (
        existing.title == payload.title
        and existing.recurrence_rule == payload.recurrence_rule
        and existing.created_at == _utc_naive(payload.created_at)
        and existing.archived == payload.archived
    )


@router.post("/tasks", response_model=TaskRead, status_code=201)
def create_task(
    payload: TaskCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Task:
    existing = session.get(Task, payload.id)
    if existing is not None:
        if existing.user_id == user.id and _same_task(existing, payload):
            return existing
        raise HTTPException(status_code=409, detail="Task id already exists")
    data = payload.model_dump()
    data["created_at"] = _utc_naive(payload.created_at)
    task = Task(**data, user_id=user.id)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.get("/tasks", response_model=list[TaskRead])
def list_tasks(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[Task]:
    return list(
        session.exec(
            select(Task).where(Task.user_id == user.id).order_by(Task.created_at)
        ).all()
    )


@router.patch("/tasks/{task_id}", response_model=TaskRead)
def update_task_archive(
    task_id: uuid.UUID,
    payload: TaskArchiveUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    task.archived = payload.archived
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(
    task_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    task = session.get(Task, task_id)
    if task is None or task.user_id != user.id:
        return Response(status_code=204)
    completions = session.exec(
        select(TaskCompletion).where(TaskCompletion.task_id == task_id)
    ).all()
    for completion in completions:
        session.delete(completion)
    session.delete(task)
    session.commit()
    return Response(status_code=204)


@router.post("/task-completions", response_model=TaskCompletionRead, status_code=201)
def create_completion(
    payload: TaskCompletionCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> TaskCompletion:
    task = session.get(Task, payload.task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    same_day = session.exec(
        select(TaskCompletion).where(
            TaskCompletion.task_id == payload.task_id,
            TaskCompletion.completed_date == payload.completed_date,
        )
    ).first()
    if same_day is not None:
        return same_day
    existing = session.get(TaskCompletion, payload.id)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Task completion id already exists")
    data = payload.model_dump()
    data["completed_at"] = _utc_naive(payload.completed_at)
    completion = TaskCompletion(**data)
    session.add(completion)
    session.commit()
    session.refresh(completion)
    return completion


@router.get("/task-completions", response_model=list[TaskCompletionRead])
def list_completions(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[TaskCompletion]:
    return list(
        session.exec(
            select(TaskCompletion)
            .join(Task, Task.id == TaskCompletion.task_id)
            .where(Task.user_id == user.id)
            .order_by(TaskCompletion.completed_date)
        ).all()
    )


@router.delete("/tasks/{task_id}/completions/{completed_date}", status_code=204)
def clear_completion(
    task_id: uuid.UUID,
    completed_date: date,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    completion = session.exec(
        select(TaskCompletion)
        .join(Task, Task.id == TaskCompletion.task_id)
        .where(
            TaskCompletion.task_id == task_id,
            TaskCompletion.completed_date == completed_date,
            Task.user_id == user.id,
        )
    ).first()
    if completion is not None:
        session.delete(completion)
        session.commit()
    return Response(status_code=204)
