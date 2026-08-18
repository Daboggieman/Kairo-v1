# Kairo — Feature Specs

Each spec covers: purpose, core screens, key logic, and open decisions to make before/while building.

**Screen names here are functional, not the app's display copy.** Every module was renamed on a
Greek lexicon during the UI rebuild — the Active Session below is THE ANVIL on the device, the Day
log is THE FEAST, the Trend chart is THE SCALES. The mapping lives in `09-ui-rebuild-plan.md` and
only there; these specs describe behaviour, which the rebuild did not change. Where a spec and the
app disagree on a *name*, the lexicon wins; where they disagree on what a screen *does*, this file
wins and the app is wrong.

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

## App-shell screens (added by the UI rebuild)

Five screens that belong to no feature module. They read data the other modules already own; none
adds a table. Locked scope and Greek display names are in `09-ui-rebuild-plan.md`.

- **Onboarding** — first-run introduction and initial preferences. Gated on a single
  `ONBOARDING_COMPLETE` preference key; the root layout redirects while it is unset.
- **Settings** — units, reminder defaults, sync status, a JSON export of every local table, a
  confirmed local wipe, and a read-only foundations block (runtime, schema version, app version).
- **Sync outbox viewer** — the pending queue with per-entry entity, operation, attempt count, last
  error, and next attempt time, plus a manual retry. Read-only over `src/db/outbox.ts` apart from
  the retry.
- **Personal records** — bests derived from existing history: heaviest lift and session, longest
  and fastest activity, greatest climb, longest streak, most tasks kept in a day, lowest weight
  trend. **Derived, never a target** — nothing here is editable and nothing sets a goal.
- **Weekly review** — one week at a time: a plain-language verdict, per-module aggregates with a
  seven-day strip, weight this week against last, and what slipped. Read-only.

## Backlog ("and more")
Not specced yet by design — add a spec here once a specific idea is ready to build,
following the same purpose/screens/logic/decisions shape as above.
