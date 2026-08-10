"""Workouts router tests.

These exercise the endpoint shapes from `03-api-design.md`. The mobile app is
local-first this phase and does not call them yet, so this suite is what keeps the
router honest until sync lands in Phase 2.
"""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.user import User


def make_user(session: Session) -> uuid.UUID:
    user = User(email="test@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user.id


def test_create_and_list_exercise(client: TestClient) -> None:
    created = client.post("/api/v1/exercises", json={"name": "Zercher Squat"})
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Zercher Squat"
    assert body["is_custom"] is True

    listed = client.get("/api/v1/exercises")
    assert listed.status_code == 200
    assert [e["name"] for e in listed.json()] == ["Zercher Squat"]


def test_workout_session_lifecycle(client: TestClient, session: Session) -> None:
    user_id = make_user(session)

    workout = client.post("/api/v1/workouts", json={"user_id": str(user_id)})
    assert workout.status_code == 201
    workout_id = workout.json()["id"]
    assert workout.json()["ended_at"] is None

    exercise_id = client.post("/api/v1/exercises", json={"name": "Deadlift"}).json()["id"]

    # Bulk set upload — the offline-sync shape called out in 03-api-design.md.
    sets = client.post(
        f"/api/v1/workouts/{workout_id}/sets",
        json=[
            {"exercise_id": exercise_id, "set_number": 1, "reps": 5, "weight": 100.0},
            {"exercise_id": exercise_id, "set_number": 2, "reps": 5, "weight": 105.0},
        ],
    )
    assert sets.status_code == 201
    assert len(sets.json()) == 2

    ended = client.patch(
        f"/api/v1/workouts/{workout_id}",
        json={"ended_at": "2026-08-10T12:00:00Z", "notes": "felt strong"},
    )
    assert ended.status_code == 200
    assert ended.json()["notes"] == "felt strong"

    detail = client.get(f"/api/v1/workouts/{workout_id}")
    assert detail.status_code == 200
    assert len(detail.json()["sets"]) == 2
    assert detail.json()["sets"][0]["set_number"] == 1


def test_get_missing_workout_returns_404(client: TestClient) -> None:
    response = client.get(f"/api/v1/workouts/{uuid.uuid4()}")
    assert response.status_code == 404


def test_add_sets_to_missing_workout_returns_404(client: TestClient) -> None:
    exercise_id = client.post("/api/v1/exercises", json={"name": "Row"}).json()["id"]
    response = client.post(
        f"/api/v1/workouts/{uuid.uuid4()}/sets",
        json=[{"exercise_id": exercise_id, "set_number": 1, "reps": 8, "weight": 60.0}],
    )
    assert response.status_code == 404
