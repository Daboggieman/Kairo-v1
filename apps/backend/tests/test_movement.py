"""Authenticated movement aggregate replay tests."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.auth import create_token
from app.models.user import User


def auth_headers(session: Session) -> dict[str, str]:
    user = User(email=f"{uuid.uuid4()}@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"Authorization": f"Bearer {create_token(user.id, 'access')}"}


def movement_payload(activity_id: uuid.UUID | None = None) -> dict[str, object]:
    activity = str(activity_id or uuid.uuid4())
    return {
        "id": activity,
        "activity_type": "run",
        "name": "Morning run",
        "started_at": "2026-08-16T08:00:00Z",
        "ended_at": "2026-08-16T08:20:00Z",
        "elapsed_seconds": 1200,
        "moving_seconds": 1100,
        "paused_seconds": 100,
        "distance_meters": 3200.5,
        "elevation_gain_meters": 25.0,
        "average_speed_mps": 2.91,
        "revision": 1,
        "created_at": "2026-08-16T08:00:00Z",
        "updated_at": "2026-08-16T08:20:00Z",
        "points": [{
            "id": str(uuid.uuid4()), "sequence": 0,
            "recorded_at": "2026-08-16T08:00:00Z", "latitude": 33.57,
            "longitude": -7.59, "processing_state": "accepted",
            "is_paused": False, "excluded_by_edit": False,
        }],
        "events": [{
            "id": str(uuid.uuid4()), "sequence": 0, "event_type": "started",
            "occurred_at": "2026-08-16T08:00:00Z", "payload_json": None,
        }],
    }


def test_movement_upload_is_idempotent_and_readable(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    payload = movement_payload()
    first = client.post("/api/v1/movements", json=payload, headers=headers)
    replay = client.post("/api/v1/movements", json=payload, headers=headers)
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()
    listed = client.get("/api/v1/movements", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    detail = client.get(f"/api/v1/movements/{payload['id']}", headers=headers)
    assert detail.status_code == 200
    assert len(detail.json()["points"]) == 1


def test_movement_conflict_and_ownership_isolation(client: TestClient, session: Session) -> None:
    owner = auth_headers(session)
    other = auth_headers(session)
    activity_id = uuid.uuid4()
    payload = movement_payload(activity_id)
    assert client.post("/api/v1/movements", json=payload, headers=owner).status_code == 201
    conflict = {**payload, "distance_meters": 4000}
    assert client.post("/api/v1/movements", json=conflict, headers=owner).status_code == 409
    assert client.get("/api/v1/movements", headers=other).json() == []
    assert client.get(f"/api/v1/movements/{activity_id}", headers=other).status_code == 404
    assert client.delete(f"/api/v1/movements/{activity_id}", headers=other).status_code == 204
    assert client.delete(f"/api/v1/movements/{activity_id}", headers=owner).status_code == 204


def test_movement_edit_replaces_aggregate_at_a_new_revision(
    client: TestClient, session: Session
) -> None:
    headers = auth_headers(session)
    payload = movement_payload()
    assert client.post("/api/v1/movements", json=payload, headers=headers).status_code == 201
    edited = {**payload, "revision": 2, "distance_meters": 3000.0,
              "updated_at": "2026-08-16T08:21:00Z"}
    updated = client.put(f"/api/v1/movements/{payload['id']}", json=edited, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    assert updated.json()["distance_meters"] == 3000.0
    replay = client.put(
        f"/api/v1/movements/{payload['id']}", json=edited, headers=headers
    )
    assert replay.status_code == 200


def test_movement_rejects_duplicate_sequences(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    payload = movement_payload()
    payload["points"] = [payload["points"][0], {**payload["points"][0], "id": str(uuid.uuid4())}]
    response = client.post("/api/v1/movements", json=payload, headers=headers)
    assert response.status_code == 422
