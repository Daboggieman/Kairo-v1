# Kairo

A personal, all-in-one self-improvement app: training, nutrition, daily discipline,
motivation, movement, scripture, and music in one place. Named for Greek *kairos* —
"the right moment."

Planning docs live in [`docs/`](docs/); start with [`docs/README.md`](docs/README.md).

## Status

**Phase 1 is complete and Phase 2 is in progress.** The mobile app is a coherent offline
daily driver; the backend now has device authentication plus the first sync-ready dataset.
See [`docs/06-roadmap.md`](docs/06-roadmap.md) for the full phased plan.

| Module | State |
|---|---|
| Workout logging | Built and device-tested |
| Weight & progress charts | Built and device-tested |
| Daily tasks + streaks | Built and device-tested |
| Macro / nutrition tracking | Built and device-tested |
| Home dashboard | Built — aggregates all four Phase 1 modules |
| Backend auth | Built — device key exchange, access/refresh JWTs |
| Backend weight sync API | Built — authenticated, idempotent, user-scoped |
| Backend tasks sync API | Built — replay-safe task/completion facts |
| Mobile sync client/outbox | Built — weight and task replay |
| Later roadmap modules | Not started |

The mobile app remains **offline-first** and runs with no backend or network. When
`EXPO_PUBLIC_KAIRO_API_URL` and `EXPO_PUBLIC_KAIRO_DEVICE_KEY` are configured, weight and task
mutations are recorded transactionally and replayed on launch, foreground, and retry intervals.
Nutrition and workout uploads remain local until their sync endpoints are implemented.

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
npm run typecheck
npm run lint
npm test                 # 345 tests across 15 suites
npx expo-doctor
```

## Backend

```bash
cd apps/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Replace DEVICE_KEY and JWT_SECRET in .env before exposing the API.

uvicorn app.main:app --reload    # http://localhost:8000/docs
```

Checks:

```bash
ruff check .
pytest -q                # 17 tests
alembic upgrade head     # latest: task migration 3f82b1d94a61
```

Implemented API surface: device-key token exchange and refresh, authenticated workouts,
and authenticated body-weight create/list/delete endpoints. Weight uploads preserve the
mobile UUID, tolerate identical replay, and reject conflicting reuse with `409`.
The mobile outbox drains weight and task operations in order with refresh, exponential backoff,
and terminal handling for non-retryable client errors.

Postgres for local development (requires a running Docker daemon):

```bash
docker compose -f infra/docker-compose.yml up -d postgres
cd apps/backend && alembic upgrade head
```
