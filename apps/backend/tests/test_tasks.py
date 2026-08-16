"""Authenticated task and completion synchronization tests."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.auth import create_token
from app.models.task import TaskCompletion
from app.models.user import User


def auth_headers(session: Session) -> dict[str, str]:
    user = User(email=f"{uuid.uuid4()}@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"Authorization": f"Bearer {create_token(user.id, 'access')}"}


def task_payload(task_id: uuid.UUID | None = None) -> dict[str, object]:
    return {
        "id": str(task_id or uuid.uuid4()),
        "title": "Read for twenty minutes",
        "recurrence_rule": "weekdays",
        "created_at": "2026-08-15T07:00:00Z",
        "archived": False,
    }


def completion_payload(task_id: str, completion_id: uuid.UUID | None = None) -> dict[str, str]:
    return {
        "id": str(completion_id or uuid.uuid4()),
        "task_id": task_id,
        "completed_date": "2026-08-15",
        "completed_at": "2026-08-15T08:00:00Z",
    }


def test_task_lifecycle_and_idempotent_replay(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    payload = task_payload()
    first = client.post("/api/v1/tasks", json=payload, headers=headers)
    replay = client.post("/api/v1/tasks", json=payload, headers=headers)
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()

    task_id = first.json()["id"]
    archived = client.patch(
        f"/api/v1/tasks/{task_id}", json={"archived": True}, headers=headers
    )
    assert archived.status_code == 200
    assert archived.json()["archived"] is True
    assert len(client.get("/api/v1/tasks", headers=headers).json()) == 1


def test_completion_is_idempotent_by_task_and_day(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    task_id = client.post("/api/v1/tasks", json=task_payload(), headers=headers).json()["id"]
    first = client.post(
        "/api/v1/task-completions", json=completion_payload(task_id), headers=headers
    )
    second = client.post(
        "/api/v1/task-completions", json=completion_payload(task_id), headers=headers
    )
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert len(client.get("/api/v1/task-completions", headers=headers).json()) == 1

    cleared = client.delete(
        f"/api/v1/tasks/{task_id}/completions/2026-08-15", headers=headers
    )
    replayed_clear = client.delete(
        f"/api/v1/tasks/{task_id}/completions/2026-08-15", headers=headers
    )
    assert cleared.status_code == replayed_clear.status_code == 204


def test_tasks_and_completions_are_user_scoped(client: TestClient, session: Session) -> None:
    owner = auth_headers(session)
    other = auth_headers(session)
    task_id = client.post("/api/v1/tasks", json=task_payload(), headers=owner).json()["id"]
    assert client.get("/api/v1/tasks", headers=other).json() == []
    assert client.patch(
        f"/api/v1/tasks/{task_id}", json={"archived": True}, headers=other
    ).status_code == 404
    assert client.post(
        "/api/v1/task-completions", json=completion_payload(task_id), headers=other
    ).status_code == 404
    assert client.delete(f"/api/v1/tasks/{task_id}", headers=other).status_code == 204
    assert len(client.get("/api/v1/tasks", headers=owner).json()) == 1


def test_task_delete_removes_completion_history(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    task_id = client.post("/api/v1/tasks", json=task_payload(), headers=headers).json()["id"]
    client.post("/api/v1/task-completions", json=completion_payload(task_id), headers=headers)
    assert client.delete(f"/api/v1/tasks/{task_id}", headers=headers).status_code == 204
    assert session.exec(select(TaskCompletion)).all() == []
