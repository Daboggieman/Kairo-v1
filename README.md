# Kairo

A personal, all-in-one self-improvement app: training, nutrition, daily discipline,
motivation, movement, scripture, and music in one place. Named for Greek *kairos* —
"the right moment."

Planning docs live in [`docs/`](docs/); start with [`docs/README.md`](docs/README.md).

## Status

**Phase 0 (setup) + the first Phase 1 module (workout logging).** See
[`docs/06-roadmap.md`](docs/06-roadmap.md) for the full phased plan.

| Module | State |
|---|---|
| Workout logging | Built — local-first, on-device SQLite |
| Weight & progress charts | Not started |
| Daily tasks + streaks | Not started |
| Macro / nutrition tracking | Not started |
| Everything else (P1–P3) | Not started |

The mobile app is **fully local-first**: it runs with no backend and no network. The
FastAPI backend is scaffolded and boots on its own, but the app does not call it yet —
sync arrives in Phase 2.

## Layout

```
kairo/
├── docs/            # planning package
├── apps/
│   ├── mobile/      # Expo React Native app (TypeScript)
│   └── backend/     # FastAPI service (Python 3.12)
├── infra/           # docker-compose for local Postgres + Redis
└── .github/         # CI
```

There is intentionally no root `package.json`. `apps/mobile` is a self-contained npm
package — Expo's Metro bundler and npm workspace hoisting interact poorly, and the
backend is Python, so there is nothing to hoist across.

## Mobile app

```bash
cd apps/mobile
npm install
npx expo start          # then scan the QR code with Expo Go
```

Checks:

```bash
npx tsc --noEmit
npm test
```

## Backend

```bash
cd apps/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

uvicorn app.main:app --reload    # http://localhost:8000/docs
```

Checks:

```bash
ruff check .
pytest
```

Postgres for local development (requires a running Docker daemon):

```bash
docker compose -f infra/docker-compose.yml up -d postgres
cd apps/backend && alembic upgrade head
```
