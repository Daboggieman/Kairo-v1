# Kairo backend image.
#
# Development-oriented: the compose service bind-mounts the source over /app and runs
# uvicorn with --reload. A production image would drop the reload flag, run as a non-root
# user, and install without the editable flag.
#
# NOTE: unbuilt — the machine this was written on has no Docker daemon.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependency metadata first so a source-only change doesn't invalidate the install layer.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --upgrade pip && pip install -e .

COPY alembic.ini ./
COPY alembic ./alembic

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
