from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_schema_is_generated(client: TestClient) -> None:
    """FastAPI's auto-generated docs are the API reference, per `03-api-design.md`."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/api/v1/workouts" in response.json()["paths"]
    assert "/api/v1/weight-entries" in response.json()["paths"]
