# Kairo — Build Roadmap

Phased by dependency and platform risk, not just feature priority — the goal is to
front-load the features that are pure app-logic (fast to build, low platform risk) and
push the native-engineering-heavy features (GPS, Apple Music) later, once the app
already has momentum and daily-use value.

## Phase 0 — Setup
- Init monorepo (see `07-repo-structure.md`)
- Expo project scaffold, EAS configured, app runs on your device via dev client
- FastAPI project scaffold, Postgres running locally via docker-compose, Alembic
  migration baseline
- CI: lint + type-check on push

## Phase 1 — Core (P0)
- Workout logging (local-first, no backend dependency required yet)
- Weight & progress charts
- Daily tasks + streaks
- Macro/nutrition tracking
- **Goal**: usable daily without any backend running. This is the phase where the app
  starts replacing other apps in your day-to-day.

## Phase 2 — Sync + Motivation (P1) — Complete
- Device-key authentication, JWT refresh, ownership checks, and ordered mobile outbox replay.
- Replay-safe body weight, tasks/completions, nutrition, and workout sessions/sets. Mobile IDs
  are preserved; exact replays succeed and conflicting reuse returns `409`.
- Deterministic daily quotes with an offline mobile fallback.
- Synchronous Pillow wallpaper generation (`1080x1920` PNG) with mobile preview and Photos save.
- SQLite-backed local daily/weekly reminders via `expo-notifications`; no server push required.
- Verification: backend 24 tests, mobile 350 tests across 16 suites, Ruff, ESLint, and TypeScript.

## Phase 3 — Movement (P2a)
- Build Kairo-owned GPS tracking for run, walk, and ride; no Strava/provider integration.
- Android-first technical spike with a custom development build, background location,
  screen-lock recording, SQLite persistence, maps, speech, restart recovery, and battery
  measurement; then integrate iOS against the same pure engine and local model.
- Ship live maps, manual pause/resume, autopause/auto-resume, time and distance voice cues,
  offline history, editable activity summaries, and route replay.
- Upload completed activities only, through replay-safe backend batches; never stream an
  active route to the server or upload to an external provider.
- Detailed scope, data model, platform contract, and gates are in `08-phase-3-movement-plan.md`.

## Phase 4 — Bible (P2b)
- Integrate chosen public-domain Bible API, chapter caching for offline reading
- Reading plan + bookmarks

## Phase 5 — Music (P3)
- Spotify OAuth + now-playing/control widget
- Apple Music: deep-link only, unless you decide to invest in the native MusicKit
  module (flag this as a separate mini-project, not a Phase 5 sub-task)

## Phase 6 — Polish & release
- App icon, splash, wallpaper style variety
- Offline-sync edge cases (conflict handling, retry logic)
- TestFlight / Play Console internal testing
- Revisit the "and more" backlog now that the core app is in daily use — you'll have a
  much better sense of what's actually missing once you're living in it

## Sequencing notes
- Phases 1–2 are the highest-value, lowest-risk work — prioritize finishing these
  before touching Phase 3+, even though GPS/Bible/Music were on your original list.
  A fully working daily-driver app with four solid modules beats a half-built app with
  ten.
- Re-evaluate scope after Phase 2. Building for yourself means the roadmap can flex —
  if Phase 1–2 already replaced most of what you needed, later phases can slow down
  without cost.
