"""Motivation endpoint tests."""

import base64
import io

from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session

from tests.test_workouts import auth_headers


def test_daily_quote_is_stable_and_rotates(client: TestClient, session: Session) -> None:
    headers = auth_headers(session)
    first = client.get("/api/v1/quotes/today?day=2026-08-15", headers=headers)
    replay = client.get("/api/v1/quotes/today?day=2026-08-15", headers=headers)
    next_day = client.get("/api/v1/quotes/today?day=2026-08-16", headers=headers)
    assert first.status_code == 200
    assert first.json() == replay.json()
    assert first.json()["id"] != next_day.json()["id"]


def test_wallpaper_generation_returns_valid_nonblank_png(
    client: TestClient, session: Session
) -> None:
    response = client.post("/api/v1/wallpapers/generate", headers=auth_headers(session), json={
        "text": "Keep moving forward.", "author": "Kairo",
        "background": "#111827", "foreground": "#F9FAFB",
    })
    assert response.status_code == 200
    body = response.json()
    image = Image.open(io.BytesIO(base64.b64decode(body["image_base64"])))
    assert image.size == (1080, 1920)
    assert len(image.getcolors(maxcolors=1_000_000) or []) > 1
