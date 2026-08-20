# Kairo

A personal, all-in-one self-improvement app: training, nutrition, daily discipline,
motivation, movement, scripture, and music in one place. Named for Greek *kairos* —
"the right moment."

Planning docs live in [`docs/`](docs/) — start with [`docs/README.md`](docs/README.md). Session handover
docs live in [`HANDOVER_DOCS/`](HANDOVER_DOCS/) — start with
[`HANDOVER_DOCS/README.md`](HANDOVER_DOCS/README.md). `docs/` is what the app is *meant* to be;
`HANDOVER_DOCS/` is what it *is*, and why.

## Status

**Phase 1 and Phase 2 are complete.** The mobile app is an offline-first daily driver with
authenticated replay for workouts, weight, tasks, and nutrition, plus quotes, wallpapers,
and local reminders.
See [`docs/06-roadmap.md`](docs/06-roadmap.md) for the full phased plan.

**In progress:** a complete dark-masculine-Greek-themed UI rebuild — scope locked in
[`docs/09-ui-rebuild-plan.md`](docs/09-ui-rebuild-plan.md), progress in
[`HANDOVER_DOCS/01-current-state.md`](HANDOVER_DOCS/01-current-state.md). The module table below
describes function, not the restyle.

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
| Backend nutrition sync API | Built — owned foods, entries, effective targets |
| Backend workout sync API | Built — client-ID-preserving, replay-safe sessions and sets |
| Motivation | Built — deterministic daily quote and Pillow wallpaper generation |
| Daily reminders | Built — SQLite-backed local recurring notifications |
| Mobile sync client/outbox | Built — ordered replay with refresh, backoff, and terminal errors |
| Movement / GPS | Implemented release candidate — local tracking, replay, edits, and backend replay; native device gate pending |
| Later roadmap modules | Not started |

The mobile app remains **offline-first** and runs with no backend or network. When
`EXPO_PUBLIC_KAIRO_API_URL` and `EXPO_PUBLIC_KAIRO_DEVICE_KEY` are configured, supported
mutations are recorded transactionally and replayed on launch, foreground, and retry intervals.
Without those values, all local modules, quotes, and reminders continue to work offline;
wallpaper generation falls back to the local quote card until an API is configured.

## Layout

```
kairo/
├── docs/            # planning package — the locked specs and plans
├── HANDOVER_DOCS/   # running session handover — current state, conventions, history
├── media/           # UI/UX design exports (media/stitch/, one folder per screen)
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
npm test                 # 481 tests across 20 suites (measured 2026-08-19)
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
pytest -q                # 28 tests
alembic upgrade head     # verified at latest migration
```

Implemented API surface: device-key token exchange and refresh, authenticated workouts, and
authenticated weight, task, and nutrition endpoints. Replay preserves client UUIDs where rows
are identity-based and uses semantic uniqueness for completion dates and effective targets.
The mobile outbox drains operations in order with refresh, exponential backoff, and terminal
handling for non-retryable client errors.

Postgres for local development (requires a running Docker daemon):

```bash
docker compose -f infra/docker-compose.yml up -d postgres
cd apps/backend && alembic upgrade head
```
