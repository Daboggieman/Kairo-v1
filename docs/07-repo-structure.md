# Kairo — Repo Structure

Monorepo, so the mobile app and backend evolve together and these planning docs live
alongside the code they describe.

```
kairo/
├── docs/                        # this planning package
├── apps/
│   ├── mobile/                  # Expo React Native app
│   │   ├── app.json
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   │   ├── workouts/
│   │   │   │   ├── progress/
│   │   │   │   ├── tasks/
│   │   │   │   ├── nutrition/
│   │   │   │   ├── quotes/
│   │   │   │   ├── wallpapers/
│   │   │   │   ├── alarms/
│   │   │   │   ├── runs/
│   │   │   │   ├── bible/
│   │   │   │   └── music/
│   │   │   ├── components/      # shared UI (buttons, cards, chart wrappers)
│   │   │   ├── store/           # Zustand stores, one per module
│   │   │   ├── db/              # local SQLite schema + queries
│   │   │   ├── services/        # API client, sync logic
│   │   │   ├── navigation/
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
│       └── pyproject.toml
├── infra/
│   ├── docker-compose.yml       # postgres + redis + backend for local dev
│   └── deploy/                  # Fly.io/Railway config
└── .github/
    └── workflows/               # CI: lint, type-check, test, EAS build trigger
```

## Conventions worth setting early
- One router + one model file per feature module on the backend, one screen folder +
  one store per feature module on the frontend — keeps the "modular features" principle
  from `00-overview.md` enforced by the folder structure itself, not just intention.
- Shared types between frontend/backend: since the frontend is TypeScript and the
  backend is Python, there's no automatic type sharing. Two reasonable options: (a)
  generate a TypeScript client from FastAPI's OpenAPI schema (`openapi-typescript`),
  or (b) hand-maintain matching types and accept the duplication for a single-developer
  project. (a) is worth the one-time setup cost once the API stabilizes past Phase 2.
