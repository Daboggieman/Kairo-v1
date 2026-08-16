# Kairo — Feature Specs

Each spec covers: purpose, core screens, key logic, and open decisions to make before/while building.

## Workout logging
- **Purpose**: replace a paper/notes-app log with structured, queryable training history.
- **Screens**: Active Session (add exercise → add sets, big tap targets for rest-timer
  use), History list, Session Detail, Exercise Library.
- **Key logic**: rest timer between sets; auto-suggest last-used weight/reps for an
  exercise; volume calculation (sets × reps × weight) for progress charts.
- **Open decisions**: plate-math helper (calculate plates needed) — nice-to-have; unit
  preference (lb/kg) stored once in user preferences, not per entry.

## Weight & progress charts
- **Purpose**: trend, not noise — daily weight fluctuates, the chart should smooth it.
- **Screens**: Trend chart (line, with a rolling 7-day average overlay), quick-entry widget.
- **Key logic**: 7-day moving average calculation; goal-line overlay if a target weight is set.

## Daily tasks + streaks
- **Purpose**: habit consistency, visible at a glance.
- **Screens**: Today list (checkbox-style), Streak view per task.
- **Key logic**: streak increments on completion, breaks if a scheduled day is missed
  (respecting each task's own recurrence rule — a "weekdays only" task shouldn't break
  over a weekend). This logic is worth unit-testing thoroughly; it's the kind of thing
  that's subtly annoying to get wrong.

## Macro / nutrition tracking
- **Purpose**: log food against calorie/macro targets without the bloat of a full social
  nutrition app.
- **Screens**: Day log (grouped by meal), Add Food (search + custom entry + quantity),
  Targets summary ring/bar (protein/carbs/fat/calories vs target).
- **Key logic**: running daily totals; target comparison. Consider whether you want a
  barcode scanner eventually (would need a food database API — see backlog).

## Motivational quotes
- **Purpose**: a fresh quote each day, tied to whatever tags matter to you
  (discipline, faith, etc.).
- **Screens**: Home widget showing today's quote; optional Quote Library/Favorites.
- **Key logic**: the API and offline client use deterministic calendar-day rotation, so the
  same day is stable across reloads and devices without a background job.

## Motivational wallpapers
- **Purpose**: turn the daily quote into a phone-wallpaper-ready image.
- **Screens**: Wallpaper preview + Save-to-Photos action.
- **Key logic**: Python/Pillow synchronously renders a 1080x1920 PNG using validated colour
  configuration; the mobile client writes the base64 result to cache before saving to Photos.
- **Open decision**: curate a small set of background images/gradients up front rather
  than sourcing them dynamically, to avoid image-licensing questions.

## Daily alarms
- **Purpose**: wake-up and reminder alarms inside the same app as everything else.
- **Screens**: Alarm list, Add/Edit Alarm (time, repeat days, label, sound).
- **Key logic**: scheduled via `expo-notifications` locally on-device, with daily or selected
  weekday repeat triggers and SQLite persistence. This is a reminder, not a silent-mode
  bypassing alarm clock.

## GPS fitness tracker
- **Purpose**: Kairo-owned offline run, walk, and ride tracking with durable route history.
- **Screens**: activity selection/readiness, Active Tracking (live map, distance/pace or
  speed/duration), summary, history, detail, edit, and route replay.
- **Key logic**: cumulative haversine distance over accepted points; moving versus elapsed
  time; manual pause/resume; accuracy filtering; activity-aware autopause/auto-resume;
  time and distance voice cues; splits per km/mile; replay from points and events.
- **Platform contract**: normal backgrounding and screen lock are supported. A force-killed
  app is not guaranteed to continue recording, but persisted points remain recoverable.
- **Sync**: completed activities upload to Kairo only after finalization; raw points remain
  locally retained indefinitely and edits create revisions without overwriting raw samples.

## Bible
- **Purpose**: read scripture, follow a plan, bookmark verses, without needing a
  separate app.
- **Screens**: Book/Chapter browser, Reader, Bookmarks, Reading Plan progress.
- **Key logic**: content fetched from a public-domain-licensed API and cached locally
  per chapter for offline reading. Translation choice matters for licensing — see
  integrations doc.

## Music integration
- **Purpose**: control what's playing without leaving Kairo.
- **Screens**: Now Playing mini-widget (art, track, play/pause/skip), Connect Account
  (per provider).
- **Key logic**: OAuth handled server-side (tokens never touch the device in plaintext);
  the app polls or subscribes to now-playing state and proxies playback controls through
  the backend. Realistic v1 scope is Spotify only — see integrations doc for why Apple
  Music and "other platforms" are meaningfully harder.

## Backlog ("and more")
Not specced yet by design — add a spec here once a specific idea is ready to build,
following the same purpose/screens/logic/decisions shape as above.
