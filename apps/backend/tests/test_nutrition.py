"""Authenticated nutrition synchronization tests."""

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


def food_payload() -> dict[str, object]:
    return {
        "id": str(uuid.uuid4()),
        "name": "Chicken breast",
        "calories_per_serving": 165,
        "protein_g": 31,
        "carbs_g": 0,
        "fat_g": 3.6,
        "serving_label": "100 g",
        "created_at": "2026-08-15T08:00:00Z",
    }


def test_food_entry_and_delete_replay(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    food = food_payload()
    first = client.post("/api/v1/food-items", json=food, headers=headers)
    replay = client.post("/api/v1/food-items", json=food, headers=headers)
    assert first.status_code == replay.status_code == 201
    entry = {
        "id": str(uuid.uuid4()),
        "food_item_id": first.json()["id"],
        "logged_at": "2026-08-15T12:00:00Z",
        "logged_date": "2026-08-15",
        "quantity": 1.5,
        "meal_type": "lunch",
    }
    created = client.post("/api/v1/nutrition-entries", json=entry, headers=headers)
    assert created.status_code == 201
    assert client.post("/api/v1/nutrition-entries", json=entry, headers=headers).status_code == 201
    assert len(client.get("/api/v1/nutrition-entries?date=2026-08-15", headers=headers).json()) == 1
    entry_id = created.json()["id"]
    assert (
        client.delete(f"/api/v1/nutrition-entries/{entry_id}", headers=headers).status_code
        == 204
    )
    assert (
        client.delete(f"/api/v1/nutrition-entries/{entry_id}", headers=headers).status_code
        == 204
    )


def test_food_ownership_and_macro_target_upsert(client: TestClient, session: Session) -> None:
    owner = auth_headers(session)
    other = auth_headers(session)
    food_id = client.post("/api/v1/food-items", json=food_payload(), headers=owner).json()["id"]
    foreign_entry = {
        "id": str(uuid.uuid4()),
        "food_item_id": food_id,
        "logged_at": "2026-08-15T12:00:00Z",
        "logged_date": "2026-08-15",
        "quantity": 1,
        "meal_type": "lunch",
    }
    assert (
        client.post(
            "/api/v1/nutrition-entries", json=foreign_entry, headers=other
        ).status_code
        == 404
    )

    target = {
        "id": str(uuid.uuid4()),
        "calories": 2200,
        "protein_g": 180,
        "carbs_g": 220,
        "fat_g": 70,
        "effective_date": "2026-08-15",
        "created_at": "2026-08-15T07:00:00Z",
    }
    assert client.put("/api/v1/macro-targets", json=target, headers=owner).status_code == 200
    target["calories"] = 2300
    updated = client.put("/api/v1/macro-targets", json=target, headers=owner)
    assert updated.json()["calories"] == 2300
    assert client.get("/api/v1/macro-targets", headers=other).json() == []
