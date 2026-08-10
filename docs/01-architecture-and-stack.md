# Kairo — Architecture & Tech Stack

## High-level architecture

```
                         ┌─────────────────────────┐
                         │   Kairo Mobile App       │
                         │   React Native (Expo)    │
                         │                          │
                         │  Local SQLite (offline-  │
                         │  first store, per module)│
                         └───────────┬──────────────┘
                                     │ HTTPS (sync, only when needed)
                                     ▼
                         ┌──────────────────────────┐
                         │   Kairo API (Python)     │
                         │   FastAPI service         │
                         │                          │
                         │  - business logic         │
                         │  - OAuth token exchange   │
                         │  - wallpaper generation    │
                         │  - scheduled jobs (Celery)│
                         └───────────┬──────────────┘
                                     │
                 ┌───────────────────┼────────────────────┐
                 ▼                   ▼                    ▼
         ┌───────────────┐  ┌────────────────┐   ┌─────────────────┐
         │ PostgreSQL     │  │ Object storage │   │ Third-party APIs │
         │ (canonical DB) │  │ (S3-compatible)│   │ Spotify / Apple   │
         │                │  │ wallpapers,    │   │ Music / Bible API │
         │                │  │ progress photos│   │ HealthKit/Strava  │
         └───────────────┘  └────────────────┘   └─────────────────┘
```

**Why a backend at all, for a single-user app?** Three of your features genuinely need
one: OAuth secrets for Spotify/Apple Music shouldn't live on-device; wallpaper
generation is cheaper and more flexible done server-side with Python's image libraries;
and having a durable database means a lost/replaced phone doesn't lose your training
history. Everything else (workout logging, tasks, macros) works fine local-first with
the backend just acting as a sync target.

## Frontend — mobile app

| Layer | Choice | Why |
|---|---|---|
| Framework | React Native + Expo (SDK, managed workflow + dev client) | One codebase for iOS + Android; Expo's config plugins cover most native needs (notifications, location) without hand-writing native code |
| Language | TypeScript | Catches data-model mismatches early across ~10 feature modules |
| Navigation | React Navigation (bottom tabs + native stacks) | De facto standard, well-documented |
| State | Zustand | Minimal boilerplate vs Redux; fine for a single-user app |
| Local storage | SQLite via `expo-sqlite` (or `WatermelonDB` if sync gets complex) | Real relational queries for workout history, offline-first |
| Charts | `victory-native` or `react-native-svg-charts` | Weight trend, macro breakdowns |
| Maps | `react-native-maps` | Route display for the GPS tracker |
| Location | `expo-location` + `expo-task-manager` (background updates) | Needed for run tracking; see integrations doc for platform limits |
| Notifications | `expo-notifications` | Local scheduled notifications for alarms/reminders |
| Audio/deep-linking | `expo-linking`, provider SDKs as needed | Music integrations |

## Backend — API service (Python)

| Layer | Choice | Why |
|---|---|---|
| Language/runtime | Python 3.12 | Per your requirement; also gives you the option to add ML-driven features later (e.g. macro suggestions, progress-photo analysis) without a second stack |
| Framework | FastAPI | Async, typed via Pydantic, auto-generates OpenAPI docs — useful since you're the only client developer and will want a live API reference |
| ORM | SQLModel or SQLAlchemy 2.0 | Typed models shared between Pydantic schemas and DB tables |
| Migrations | Alembic | Standard with SQLAlchemy |
| Database | PostgreSQL | Handles relational data (sets, meals, runs) and scales past SQLite if you ever add users |
| Background jobs | Celery + Redis (or APScheduler if you want to avoid running Redis) | Daily quote rotation, wallpaper pre-generation, token refresh |
| Image generation | Pillow | Renders motivational wallpapers (quote text over background art) |
| HTTP client | httpx | Calls to Spotify/Bible/etc. APIs |
| Auth | JWT (via `python-jose` or `fastapi-users`) | Even single-user, keeps the API safe if it's ever exposed publicly, and future-proofs multi-device use |

## Infrastructure

| Concern | Choice | Why |
|---|---|---|
| Backend hosting | Fly.io, Railway, or a small VPS + Docker | Cheap for a low-traffic single-user API; Fly.io/Railway avoid server-ops overhead |
| Containerization | Docker + docker-compose for local dev | Keeps backend + Postgres + Redis reproducible |
| Object storage | Cloudflare R2 or AWS S3 | Wallpaper images, any progress photos |
| Mobile build/release | EAS (Expo Application Services) | Builds and submits to TestFlight / Play Console without a Mac required for Android, and simplifies iOS signing |
| CI | GitHub Actions | Lint/type-check/test on push; trigger EAS builds on tag |
| Push delivery | Expo push notification service | Wraps APNs/FCM; simplest path for local + remote notifications |

## Data flow summary
- **Fully local features** (workout log, tasks/streaks, macro entries, weight entries):
  written to on-device SQLite immediately; synced to Postgres opportunistically when
  online, last-write-wins is fine for a single-user app.
- **Server-dependent features**: wallpaper generation (Python/Pillow), OAuth flows
  (Spotify/Apple Music), Bible content fetching/caching, quote rotation logic.
- **Third-party-dependent features**: GPS/run tracking may lean on Apple HealthKit /
  Google Fit rather than reinventing tracking (see integrations doc).
