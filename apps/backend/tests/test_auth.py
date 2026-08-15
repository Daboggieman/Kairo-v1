"""Authentication endpoint tests."""

from fastapi.testclient import TestClient

from app.core.config import settings


def test_device_key_exchanges_and_refreshes_tokens(client: TestClient) -> None:
    response = client.post("/api/v1/auth/token", json={"device_key": settings.device_key})
    assert response.status_code == 200
    tokens = response.json()
    assert tokens["token_type"] == "bearer"
    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200


def test_invalid_device_key_and_wrong_token_type_are_rejected(client: TestClient) -> None:
    assert client.post("/api/v1/auth/token", json={"device_key": "incorrect"}).status_code == 401
    tokens = client.post(
        "/api/v1/auth/token", json={"device_key": settings.device_key}
    ).json()
    wrong_type = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]}
    )
    assert wrong_type.status_code == 401
