"""Authenticated workout endpoint tests."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.auth import create_token
from app.models.user import User


def make_user(session: Session) -> uuid.UUID:
    user = User(email=f"{uuid.uuid4()}@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user.id


def auth_headers(session: Session) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_token(make_user(session), 'access')}"}


def test_workout_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/exercises").status_code == 401


def test_create_and_list_exercise(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    created = client.post("/api/v1/exercises", json={"name": "Zercher Squat"}, headers=headers)
    assert created.status_code == 201
    assert created.json()["is_custom"] is True
    listed = client.get("/api/v1/exercises", headers=headers)
    assert [e["name"] for e in listed.json()] == ["Zercher Squat"]


def test_workout_session_lifecycle(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    workout = client.post("/api/v1/workouts", json={}, headers=headers)
    assert workout.status_code == 201
    workout_id = workout.json()["id"]
    assert workout.json()["ended_at"] is None
    exercise_id = client.post(
        "/api/v1/exercises", json={"name": "Deadlift"}, headers=headers
    ).json()["id"]
    sets = client.post(
        f"/api/v1/workouts/{workout_id}/sets",
        json=[
            {"exercise_id": exercise_id, "set_number": 1, "reps": 5, "weight": 100.0},
            {"exercise_id": exercise_id, "set_number": 2, "reps": 5, "weight": 105.0},
        ],
        headers=headers,
    )
    assert sets.status_code == 201
    ended = client.patch(
        f"/api/v1/workouts/{workout_id}",
        json={"ended_at": "2026-08-10T12:00:00Z", "notes": "felt strong"},
        headers=headers,
    )
    assert ended.status_code == 200
    detail = client.get(f"/api/v1/workouts/{workout_id}", headers=headers)
    assert len(detail.json()["sets"]) == 2


def test_missing_and_foreign_workouts_are_hidden(client: TestClient, session: Session) -> None:
    first = auth_headers(session)
    second = auth_headers(session)
    created = client.post("/api/v1/workouts", json={}, headers=first)
    workout_id = created.json()["id"]
    assert client.get(f"/api/v1/workouts/{uuid.uuid4()}", headers=first).status_code == 404
    assert client.get(f"/api/v1/workouts/{workout_id}", headers=second).status_code == 404
    assert client.get("/api/v1/workouts", headers=second).json() == []


def test_add_sets_to_missing_workout_returns_404(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    exercise_id = client.post(
        "/api/v1/exercises", json={"name": "Row"}, headers=headers
    ).json()["id"]
    response = client.post(
        f"/api/v1/workouts/{uuid.uuid4()}/sets",
        json=[{"exercise_id": exercise_id, "set_number": 1, "reps": 8, "weight": 60.0}],
        headers=headers,
    )
    assert response.status_code == 404
