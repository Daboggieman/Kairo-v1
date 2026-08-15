# Kairo — Repo Structure

Monorepo, so the mobile app and backend evolve together and these planning docs live
alongside the code they describe.

```
kairo/
├── docs/                        # this planning package
├── apps/
│   ├── mobile/                  # Expo React Native app
│   │   ├── app.json
│   │   ├── app/                 # Expo Router routes — see "Navigation" below
│   │   │   ├── _layout.tsx      # SQLiteProvider + migrations
│   │   │   └── (tabs)/
│   │   │       ├── _layout.tsx  # bottom tabs, one per module
│   │   │       ├── index.tsx    # Home
│   │   │       └── workouts/    # one folder per feature module
│   │   ├── src/
│   │   │   ├── components/      # shared UI (buttons, cards, chart wrappers)
│   │   │   ├── store/           # Zustand stores, one per module
│   │   │   ├── db/              # local SQLite schema + queries
│   │   │   ├── domain/          # pure per-module logic, unit-tested
│   │   │   ├── hooks/           # shared React hooks
│   │   │   ├── services/        # API client, sync logic
│   │   │   └── theme/
│   │   └── package.json
│   └── backend/                 # FastAPI service
│       ├── app/
│       │   ├── api/             # routers, one per module (mirrors 03-api-design.md)
│       │   ├── models/          # SQLModel/SQLAlchemy tables (mirrors 02-data-model.md)
│       │   ├── schemas/         # Pydantic request/response models
│       │   ├── services/        # business logic (streaks, wallpaper gen, OAuth)
│       │   ├── jobs/            # Celery tasks (quote rotation, token refresh)
│       │   └── main.py
│       ├── alembic/
│       ├── tests/
│       ├── Dockerfile
│       └── pyproject.toml
├── infra/
│   ├── docker-compose.yml       # postgres + redis + backend for local dev
│   └── deploy/                  # Fly.io/Railway config
└── .github/
    └── workflows/               # CI: lint, type-check, test, EAS build trigger
```

## Navigation: Expo Router instead of `src/screens/` + `src/navigation/`

This package originally specified React Navigation with screens under `src/screens/` and
wiring in `src/navigation/`. The implementation uses **Expo Router** instead, which is
built on React Navigation and is the default for new Expo apps.

What changed:
- `src/screens/<module>/` and `src/navigation/` are replaced by `app/(tabs)/<module>/`.
  Routes come from the file tree, so there is no separate navigator file to keep in sync.
- Everything else under `src/` is unchanged, plus two additions the original tree did not
  anticipate: `src/domain/` (pure module logic, unit-tested without a React renderer) and
  `src/hooks/`.

Why: the "one folder per feature module" convention below stops being a convention and
becomes structural — a module without a folder under `app/` has no routes. Deep linking
and typed routes come for free, which matters for the Phase 2 alarm and wallpaper
notifications that need to open a specific screen.

Cost: route files must live in `app/`, so the module's screens and its store/db/domain code
sit in two different trees rather than one folder per module.

## Conventions worth setting early
- One router + one model file per feature module on the backend, one route folder under
  `app/` + one store per feature module on the frontend — keeps the "modular features"
  principle from `00-overview.md` enforced by the folder structure itself, not just
  intention.
- Shared types between frontend/backend: since the frontend is TypeScript and the
  backend is Python, there's no automatic type sharing. Two reasonable options: (a)
  generate a TypeScript client from FastAPI's OpenAPI schema (`openapi-typescript`),
  or (b) hand-maintain matching types and accept the duplication for a single-developer
  project. (a) is worth the one-time setup cost once the API stabilizes past Phase 2.
