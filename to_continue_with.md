# Continue with

Handoff for the Kairo v1 Phase 0 + Workouts session. Read before continuing.

## Status

Phase 0 (monorepo scaffold) and the first module (workout logging) are **implemented and
verified**, and the work so far has been pushed. This file records where things stand so a
future session can resume without re-deriving it.

## What is done and verified

### Backend — green
`apps/backend/`, FastAPI + SQLModel + Alembic. Portability decision from this session:
models use portable SQLAlchemy types so everything runs on SQLite locally, with Postgres
as the deployment target (no Docker/Postgres was available on the dev machine).

- Migration `c7080c2dd1c6` applied against SQLite; tables confirmed via sqlite3:
  `alembic_version, exercises, users, workout_sessions, workout_sets`.
- `pytest` → **6 passed** (health + workout lifecycle, in-memory SQLite via `StaticPool`).
- `ruff check .` → **All checks passed!** (select E, F, I, UP, B; B008
  `Depends`/`Query` exempted via `extend-immutable-calls`).
- `POST /workouts/{id}/sets` accepts an array (offline bulk sync); router carries a
  `TODO(phase-2)` noting the endpoints are unauthenticated by design until then.
- `alembic/env.py` reads `DATABASE_URL` from `app.core.config` (single source of truth).

### Mobile — implemented, verified as far as possible
`apps/mobile/`, Expo SDK 57 + Expo Router (file-based) + expo-sqlite + Zustand.

- `npx expo-doctor` → **20/20 checks passed**.
- `npx tsc --noEmit` → **0 errors** (tsconfig has `"types": ["jest", "node", "react"]`
  pinned so jest globals resolve without importing them in tests).
- `npx eslint .` → **clean** (flat config, `eslint-config-expo/flat`).
- `npm test` → **29 passed** (pure domain logic only; see "test coverage" below).
- `npx expo export --platform android` → **bundled successfully** (1287 modules) — every
  import resolves and the router tree is valid end-to-end. Output deleted afterwards.
- Flow: Home tab → Workouts history → Start/Resume → pick exercise (modal library, seeded
  30 exercises, search + add-custom) → pre-filled weight/reps from last time
  (`suggestNextSet`) → log sets (writes through to SQLite immediately) → rest timer
  (`RestTimer`, derives from stored epoch-ms start) → Finish → detail screen.
- Force-kill survival: `hydrate()` on History focus re-reads any unfinished session from
  SQLite so "Resume" appears instead of starting a duplicate; `activeSession()` query
  added to `src/db/workouts.ts` for this.

## Decisions to know

- **Expo Router over React Navigation** (deviation from planning docs): routes live in
  `app/(tabs)/<module>/`, no `src/screens/` or `src/navigation/`. Documented in
  `docs/07-repo-structure.md` — keep new modules under `app/(tabs)/`.
- **Local-first**: the app is 100% offline; the backend exists but nothing calls it yet.
  Sync arrives in Phase 2 per `docs/06-roadmap.md`. Seeded exercises use deterministic
  `seed-*` ids so Phase 2 sync won't duplicate them.
- **Single user for now**: `LOCAL_USER_ID = 'local-user'` in
  `src/store/workoutStore.ts`; rows carry `user_id` from day one per the data model.
- **Unit preference**: stores no app-wide default — each set carries its own unit;
  `suggestNextSet` falls back to kg with no history (feature-spec open decision).
- **Infra/CI written, not run**: no Docker daemon/Postgres on the dev machine, so
  `infra/docker-compose.yml` and `apps/backend/Dockerfile` are YAML-validated only
  (`docker compose up` is unverified), and `.github/workflows/ci.yml` has not executed on
  GitHub. The CI backend job is the first real exercise of the Postgres path.

## Work left

- **Docker stack smoke test** (`infra/docker-compose.yml`): `docker compose up -d postgres`,
  `alembic upgrade head`, `uvicorn --reload`, `pytest` against it. Both files note this
  has not been run.
- **Run the CI once**: after the first push, confirm `.github/workflows/ci.yml` is green —
  particularly the backend job's Postgres service container (migration + tests).
- **Test coverage** (deliberately scoped this pass): only `src/domain/workouts.ts` is
  unit-tested (29 tests). `src/db/*` and `src/store/workoutStore.ts` are typed but have no
  SQLite-backed tests. A later pass should add in-memory SQLite tests for the query layer
  (`src/db/workouts.ts`) and store actions — the patterns are in `apps/backend/tests/`.
- **Screen-level polish** (manual, on-device): rest-timer target ("long enough" turns
  green at 90s), notes field on finish, RPE field, set-deletion/edit, and the Home
  dashboard are all consciously deferred per `04-feature-specs.md`.
- **`src/store/workoutStore.ts` refinement**: `emptySession()` returns all-`null` fields, so
  "no session open" and "session open" are not distinguishable at the type level. Worth a
  discriminated union once an edit flow exists. Not urgent, and not currently flagged in
  the code.

## Verification commands

```sh
# Backend
cd apps/backend && source .venv/bin/activate
ruff check .            # All checks passed!
pytest -q               # 6 passed
alembic upgrade head    # c7080c2dd1c6 (idempotent)

# Mobile
cd apps/mobile
npm run typecheck       # tsc --noEmit, 0 errors
npm run lint            # eslint ., clean
npm test                # 29 passed
npx expo-doctor         # 20/20
npx expo export --platform android   # ~83s, 1287 modules
```

## Repo hygiene notes

- `apps/backend/kairo.db` had been committed by mistake. It was untracked
  (`git rm --cached`, file kept on disk) and `*.db` / `*.db-shm` / `*.db-wal` added to
  `.gitignore`. It held only the Alembic version row and empty tables, so nothing was
  lost. Recreate with `alembic upgrade head`.
- `kairo_backend.egg-info/` and `.venv/` are untracked (fine).
