# Kairo — API Design (FastAPI)

Base URL: `/api/v1`. All endpoints (except auth) require a bearer JWT. FastAPI will
auto-generate interactive docs at `/docs` from these route definitions — worth relying
on rather than hand-maintaining a separate spec.

## Auth
- `POST /auth/token` — exchange device credential for JWT (single-user, so this can be
  as simple as a long-lived device key rather than a full login form)
- `POST /auth/refresh` — refresh JWT

Implemented in Phase 2. The configured `DEVICE_KEY` creates or resolves the single backend
user and returns an HS256 access/refresh pair. Refresh reissues a valid pair. All non-auth
routes validate the access token
and derive ownership from its `sub`; clients never submit `user_id` as authority.

## Workouts
- `GET /exercises` — list exercise reference data
- `POST /exercises` — add custom exercise
- `POST /workouts` — create session; accepts an optional client UUID and is replay-safe
- `GET /workouts?from=&to=` — list sessions in range
- `GET /workouts/{id}` — session detail with sets
- `POST /workouts/{id}/sets` — add sets; preserves client set UUIDs and accepts seeded mobile IDs
- `PATCH /workouts/{id}` — update session (end time, notes)

## Weight
- `POST /weight-entries` — preserves the client UUID; identical replay is idempotent and a
  conflicting payload for the same UUID returns `409`
- `GET /weight-entries?from=&to=`
- `DELETE /weight-entries/{id}` — sync counterpart to the mobile long-press delete action

Implemented in Phase 2. The mobile outbox records create/delete operations transactionally and
replays them in order on launch, foreground, and retry intervals. All three operations are
scoped to the authenticated user. Timestamps are normalized to UTC before persistence and
comparison so SQLite and Postgres replay semantics agree with explicit offsets.

## Tasks & streaks
- `POST /tasks` — client-ID-preserving, idempotent task upsert
- `GET /tasks` — authenticated task facts
- `PATCH /tasks/{id}` — archive or restore
- `DELETE /tasks/{id}` — idempotent delete, including completion history
- `POST /task-completions` — idempotent by task and completed calendar day
- `GET /task-completions` — authenticated completion facts
- `DELETE /tasks/{id}/completions/{date}` — idempotent clear

Implemented in Phase 2. Streaks remain derived from completion facts; the server does not
materialize a second streak counter.

## Nutrition
- `GET /food-items?search=` — authenticated personal food library
- `POST /food-items` — client-ID-preserving food upsert
- `POST /nutrition-entries` — ownership-checked, idempotent log entry
- `GET /nutrition-entries?date=` — authenticated entries for a local day
- `DELETE /nutrition-entries/{id}` — idempotent delete
- `PUT /macro-targets` — effective-date upsert
- `GET /macro-targets` — authenticated target history

Implemented in Phase 2. Food definitions are user-owned, entries cannot attach to another
user's food, and targets update by `(user_id, effective_date)` without rewriting history.

## Quotes & wallpapers
- `GET /quotes/today?day=` — deterministic authenticated daily quote
- `POST /wallpapers/generate` — synchronous Pillow render; returns base64 PNG metadata

## Alarms
Alarm CRUD and scheduling are local SQLite operations in the mobile app. `expo-notifications`
creates daily or selected-weekday triggers on the device; a backend sync API is intentionally
deferred because local notification IDs are platform-specific.

## Runs / GPS
- `POST /runs` — create from on-device GPS track (batch upload of points) OR from a
  HealthKit/Strava import
- `GET /runs?from=&to=`
- `GET /runs/{id}` — includes route points if source is kairo_gps

## Bible
- `GET /bible/{translation}/{book}/{chapter}` — proxied/cached from public Bible API
- `POST /bible/bookmarks`
- `GET /bible/bookmarks`
- `GET /bible/reading-plans/{id}/progress`
- `POST /bible/reading-plans/{id}/advance`

## Music
- `GET /music/spotify/authorize` — returns OAuth URL to open in-app browser
- `GET /music/spotify/callback` — exchanges code for tokens, stores encrypted
- `GET /music/spotify/now-playing`
- `POST /music/spotify/playback` — play/pause/skip (proxies Spotify Web API)
- (Apple Music equivalents once native MusicKit integration exists — see integrations doc)

## Design notes
- Phase 2 auth, workout/weight/task/nutrition replay, quotes, wallpapers, and local reminders
  are implemented. Phase 3 begins with movement/GPS strategy.
- Bulk endpoints (e.g. `POST /workouts/{id}/sets` accepting an array) are worth adding
  once the app is offline-first, so a session logged entirely offline syncs in one call.
- Keep provider-specific logic (Spotify vs Apple Music) behind a common `/music/*`
  interface where possible, so the mobile app doesn't need provider-aware branching
  everywhere.
