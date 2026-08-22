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


def test_workout_and_set_replay_preserve_client_ids(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    workout_id = str(uuid.uuid4())
    payload = {"id": workout_id, "started_at": "2026-08-15T07:00:00Z"}
    first = client.post("/api/v1/workouts", json=payload, headers=headers)
    replay = client.post("/api/v1/workouts", json=payload, headers=headers)
    assert first.status_code == replay.status_code == 201
    assert first.json()["id"] == replay.json()["id"] == workout_id

    exercise_id = client.post(
        "/api/v1/exercises", json={"name": "Press"}, headers=headers
    ).json()["id"]
    set_id = str(uuid.uuid4())
    set_payload = [{"id": set_id, "exercise_id": exercise_id, "set_number": 1,
                    "reps": 5, "weight": 40.0}]
    url = f"/api/v1/workouts/{workout_id}/sets"
    first_sets = client.post(url, json=set_payload, headers=headers)
    replayed_sets = client.post(url, json=set_payload, headers=headers)
    assert first_sets.status_code == replayed_sets.status_code == 201
    assert first_sets.json()[0]["id"] == replayed_sets.json()[0]["id"] == set_id
    detail = client.get(f"/api/v1/workouts/{workout_id}", headers=headers)
    assert len(detail.json()["sets"]) == 1


def test_workout_id_conflicts_are_rejected(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    workout_id = str(uuid.uuid4())
    assert client.post(
        "/api/v1/workouts", json={"id": workout_id, "notes": "first"}, headers=headers
    ).status_code == 201
    assert client.post(
        "/api/v1/workouts", json={"id": workout_id, "notes": "different"}, headers=headers
    ).status_code == 409


def test_mobile_seed_exercise_id_is_resolved(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    workout_id = client.post("/api/v1/workouts", json={}, headers=headers).json()["id"]
    response = client.post(f"/api/v1/workouts/{workout_id}/sets", headers=headers, json=[{
        "id": str(uuid.uuid4()), "exercise_id": "seed-back-squat", "set_number": 1,
        "reps": 5, "weight": 80,
    }])
    assert response.status_code == 201
    exercises = client.get("/api/v1/exercises", headers=headers).json()
    assert any(item["name"] == "Back Squat" for item in exercises)


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


def seeded_set(client: TestClient, session: Session) -> tuple[dict[str, str], str, str]:
    """A user with one workout holding one set — the starting point for a correction."""
    headers = auth_headers(session)
    workout_id = client.post("/api/v1/workouts", json={}, headers=headers).json()["id"]
    set_id = str(uuid.uuid4())
    created = client.post(f"/api/v1/workouts/{workout_id}/sets", headers=headers, json=[{
        "id": set_id, "exercise_id": "seed-back-squat", "set_number": 1,
        "reps": 5, "weight": 100.0, "weight_unit": "kg", "rest_seconds": 90,
    }])
    assert created.status_code == 201
    return headers, workout_id, set_id


def test_set_correction_updates_only_the_mutable_fields(
    client: TestClient, session: Session
) -> None:
    """The route `add_sets` could not provide.

    A replayed edit hits `add_sets` with a known id whose fields differ, which is a 409
    — terminal in the mobile outbox, so the correction was dropped and the server kept
    the pre-edit values. PATCH is the route that carries it.
    """
    headers, workout_id, set_id = seeded_set(client, session)

    updated = client.patch(
        f"/api/v1/workouts/{workout_id}/sets/{set_id}",
        json={"reps": 6, "weight": 102.5, "rpe": 8.5},
        headers=headers,
    )

    assert updated.status_code == 200
    body = updated.json()
    assert body["reps"] == 6
    assert body["weight"] == 102.5
    assert body["rpe"] == 8.5
    # Untouched fields survive: an edit is not a replacement.
    assert body["set_number"] == 1
    assert body["rest_seconds"] == 90
    assert body["weight_unit"] == "kg"


def test_set_correction_can_clear_rpe(client: TestClient, session: Session) -> None:
    """An explicit null differs from an omitted key, which is why `exclude_unset` is used."""
    headers, workout_id, set_id = seeded_set(client, session)
    client.patch(
        f"/api/v1/workouts/{workout_id}/sets/{set_id}", json={"rpe": 9.0}, headers=headers
    )

    cleared = client.patch(
        f"/api/v1/workouts/{workout_id}/sets/{set_id}", json={"rpe": None}, headers=headers
    )

    assert cleared.status_code == 200
    assert cleared.json()["rpe"] is None
    assert cleared.json()["reps"] == 5


def test_set_correction_is_idempotent_on_replay(client: TestClient, session: Session) -> None:
    headers, workout_id, set_id = seeded_set(client, session)
    url = f"/api/v1/workouts/{workout_id}/sets/{set_id}"
    payload = {"reps": 6, "weight": 102.5}

    first = client.patch(url, json=payload, headers=headers)
    replay = client.patch(url, json=payload, headers=headers)

    assert first.status_code == replay.status_code == 200
    assert first.json() == replay.json()


def test_set_deletion_is_idempotent_and_replay_safe(
    client: TestClient, session: Session
) -> None:
    """204 on an absent set, like `delete_movement`.

    The outbox treats 404 as terminal, so a re-delivered delete must not fail: the set
    being gone is the outcome the intent wanted.
    """
    headers, workout_id, set_id = seeded_set(client, session)
    url = f"/api/v1/workouts/{workout_id}/sets/{set_id}"

    assert client.delete(url, headers=headers).status_code == 204
    assert client.delete(url, headers=headers).status_code == 204
    assert client.get(f"/api/v1/workouts/{workout_id}", headers=headers).json()["sets"] == []


def test_set_corrections_are_isolated_between_users(
    client: TestClient, session: Session
) -> None:
    headers, workout_id, set_id = seeded_set(client, session)
    intruder = auth_headers(session)
    url = f"/api/v1/workouts/{workout_id}/sets/{set_id}"

    assert client.patch(url, json={"reps": 99}, headers=intruder).status_code == 404
    # The idempotent delete cannot leak existence, so it answers 204 — but must not delete.
    assert client.delete(url, headers=intruder).status_code == 204
    detail = client.get(f"/api/v1/workouts/{workout_id}", headers=headers).json()
    assert [s["reps"] for s in detail["sets"]] == [5]


def test_set_correction_under_the_wrong_workout_is_rejected(
    client: TestClient, session: Session
) -> None:
    """A real set id under a workout that does not hold it is a 404, not a silent edit."""
    headers, _workout_id, set_id = seeded_set(client, session)
    other_workout = client.post("/api/v1/workouts", json={}, headers=headers).json()["id"]

    response = client.patch(
        f"/api/v1/workouts/{other_workout}/sets/{set_id}",
        json={"reps": 3},
        headers=headers,
    )

    assert response.status_code == 404


def test_set_correction_on_missing_set_returns_404(
    client: TestClient, session: Session
) -> None:
    headers = auth_headers(session)
    workout_id = client.post("/api/v1/workouts", json={}, headers=headers).json()["id"]

    response = client.patch(
        f"/api/v1/workouts/{workout_id}/sets/{uuid.uuid4()}",
        json={"reps": 5},
        headers=headers,
    )

    assert response.status_code == 404
