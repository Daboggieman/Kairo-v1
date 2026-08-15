"""Kairo API entry point."""

from fastapi import FastAPI

from app.api import auth, weight, workouts
from app.core.config import settings

app = FastAPI(title="Kairo API", version="0.1.0", debug=settings.debug)

app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(workouts.router, prefix=settings.api_v1_prefix)
app.include_router(weight.router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
