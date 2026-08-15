"""Authenticated body-weight endpoint tests."""

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


def weight_payload(entry_id: uuid.UUID | None = None) -> dict[str, object]:
    return {
        "id": str(entry_id or uuid.uuid4()),
        "recorded_at": "2026-08-15T07:30:00Z",
        "weight": 75.5,
        "weight_unit": "kg",
        "note": "morning",
    }


def test_weight_entry_is_idempotent_and_listed(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    payload = weight_payload()
    first = client.post("/api/v1/weight-entries", json=payload, headers=headers)
    replay = client.post("/api/v1/weight-entries", json=payload, headers=headers)
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()

    listed = client.get("/api/v1/weight-entries", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["weight"] == 75.5


def test_weight_entry_rejects_conflicting_replay(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    entry_id = uuid.uuid4()
    assert client.post(
        "/api/v1/weight-entries", json=weight_payload(entry_id), headers=headers
    ).status_code == 201
    conflict = weight_payload(entry_id)
    conflict["weight"] = 76.0
    assert (
        client.post("/api/v1/weight-entries", json=conflict, headers=headers).status_code == 409
    )


def test_weight_entries_are_isolated_and_deletable(client: TestClient, session: Session) -> None:
    owner = auth_headers(session)
    other = auth_headers(session)
    payload = weight_payload()
    created = client.post("/api/v1/weight-entries", json=payload, headers=owner)
    entry_id = created.json()["id"]
    assert client.get("/api/v1/weight-entries", headers=other).json() == []
    assert client.delete(f"/api/v1/weight-entries/{entry_id}", headers=other).status_code == 204
    assert client.delete(f"/api/v1/weight-entries/{entry_id}", headers=owner).status_code == 204


def test_weight_entry_validates_unit_and_positive_value(
    client: TestClient, session: Session
) -> None:
    headers = auth_headers(session)
    invalid = weight_payload()
    invalid["weight"] = 0
    assert client.post("/api/v1/weight-entries", json=invalid, headers=headers).status_code == 422
    invalid = weight_payload()
    invalid["weight_unit"] = "stones"
    assert client.post("/api/v1/weight-entries", json=invalid, headers=headers).status_code == 422
