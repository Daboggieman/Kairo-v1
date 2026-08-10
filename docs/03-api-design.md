# Kairo — API Design (FastAPI)

Base URL: `/api/v1`. All endpoints (except auth) require a bearer JWT. FastAPI will
auto-generate interactive docs at `/docs` from these route definitions — worth relying
on rather than hand-maintaining a separate spec.

## Auth
- `POST /auth/token` — exchange device credential for JWT (single-user, so this can be
  as simple as a long-lived device key rather than a full login form)
- `POST /auth/refresh` — refresh JWT

## Workouts
- `GET /exercises` — list exercise reference data
- `POST /exercises` — add custom exercise
- `POST /workouts` — create session
- `GET /workouts?from=&to=` — list sessions in range
- `GET /workouts/{id}` — session detail with sets
- `POST /workouts/{id}/sets` — add set to session
- `PATCH /workouts/{id}` — update session (end time, notes)

## Weight
- `POST /weight-entries`
- `GET /weight-entries?from=&to=`

## Tasks & streaks
- `POST /tasks`
- `GET /tasks` — active tasks with today's completion status
- `POST /tasks/{id}/complete` — mark today complete, server recalculates streak
- `GET /tasks/{id}/streak`

## Nutrition
- `GET /food-items?search=`
- `POST /food-items` — add custom food
- `POST /nutrition-entries`
- `GET /nutrition-entries?date=` — day's log with macro totals vs target
- `PUT /macro-targets`

## Quotes & wallpapers
- `GET /quotes/today` — today's rotated quote
- `POST /wallpapers/generate` — body: quote_id + style_config; returns image URL
  (Python/Pillow job, likely async via Celery with a polling or webhook result)
- `GET /wallpapers` — history

## Alarms
- `POST /alarms`
- `GET /alarms`
- `PATCH /alarms/{id}`
- `DELETE /alarms/{id}`
*(Actual scheduling happens on-device via `expo-notifications`; these endpoints exist
purely for cross-device sync of the alarm list.)*

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
- Bulk endpoints (e.g. `POST /workouts/{id}/sets` accepting an array) are worth adding
  once the app is offline-first, so a session logged entirely offline syncs in one call.
- Keep provider-specific logic (Spotify vs Apple Music) behind a common `/music/*`
  interface where possible, so the mobile app doesn't need provider-aware branching
  everywhere.
