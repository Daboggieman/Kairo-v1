# Project history — archaeology

Nothing here is a current instruction. It is the record: what was built in Phases 0–2, what the git
history says, which device findings are closed, and the 2026-08-17 restyle that the Greek rebuild
superseded. Read it to answer *"why is it like this"* — not to decide what to do next.

---

## Where the project stands overall

Phase 0 (monorepo scaffold) and all four Phase 1/P0 modules — **workout logging**, **weight/progress
charts**, **daily tasks & streaks**, and **macro/nutrition tracking** — are implemented and verified.
Phase 1/P0 is complete as a coherent daily app: Home aggregates all four local modules, and the full
manual device smoke test is complete including the Today/tasks workflow, locale decimal inputs and real
bottom-tab icons.

**Phase 2 is complete**: authenticated replay for workouts, weight, tasks and nutrition; deterministic
motivation; Pillow wallpapers; local daily/weekly reminders. Sync is opt-in through Expo public
configuration; without it the app stays fully offline.

**Phase 3** (Kairo-owned GPS movement tracking) is implemented through the executable layers and awaits
physical acceptance — see [`09-phase-3-acceptance.md`](09-phase-3-acceptance.md).

## Git history

**Branch strategy:** `phase_1` preserves the completed Phase 1 snapshot at `ea80c37`; `phase_2` preserves
the Phase 2 slice. Active work lives on **`phase_3`**. `master` is **no longer** at the Phase 1 snapshot —
it has been advanced through pull requests (`origin/master` was at `1df12bc`, *"Merge pull request #12 from
Daboggieman/phase_3"*, on 2026-08-18). Two branches of the same name can therefore disagree: local `master`
lagged `origin/master` at that point.

**Confirm the real state** with `git status --short --branch`, `git log --oneline -5` and
`git rev-list --left-right --count origin/master...HEAD` rather than trusting any table here. The user
pushes and merges outside these sessions, so every commit list dates the moment it was written. The current
one is in [`01-current-state.md`](01-current-state.md).

Recorded commits, newest first:

| Commit | What |
|---|---|
| `f46dca7`, `7d744c9` | `ox-06(3)` and `ox-06(2)` — the `HANDOVER_DOCS/` split and the build-doc repoints that went with it (2026-08-19) |
| `369531c` | `ox-06` — the weight module and the last `.env` touch (2026-08-19) |
| `fff186f`, `65521f2` | `end of day commit` ×2 — the rest of the rebuild through the macros module; `65521f2` also carries the `ui_rebuild_stitch_prompt.md` deletion (2026-08-18) |
| `92c21da` | Merge `phase_3` from the remote into local `phase_3` |
| `e164a93` | The 30 Stitch UI/UX designs under `media/stitch/` |
| `e78fcea`, `493da42`, `791a588` | The 2026-08-17 partial restyle, frontend remodel, and database-schema fixes |
| `af5b2da` | Complete workout replay, quotes, Pillow wallpapers, local reminders, tests, docs |
| `ea80c37` | Confirm physical-device retest for locale decimals and final tab icons |
| `77d4016` | Locale-safe numeric parsing, real tab icons, regression tests, manual findings |
| `b08aabf` | Macro/nutrition v4 storage and UI, Home dashboard composition, tests, handoff |
| `44c140d` | `refactor(dates)` — extract `src/domain/dates.ts`, fix two UTC/local window bugs in weight |
| `9d641d3` | `feat(tasks)` — the whole tasks module, migration v3, three screens, 97 new tests |
| `984901c` | `docs` — tasks-module handoff |

Two notes from the Phase 2 session, kept because the second is still in force:

- The old *"Unpushed / credential helper has no usable credentials"* warning was **resolved** — the earlier
  work had been pushed. Do not read it as current.
- **Git identity is configured repo-local** as `Daboggieman` / `adaraph722@gmail.com`, because this
  environment could not see the previous global identity when the Phase 2 commit was created.

## Backend — Phase 2 auth, replay, and motivation

`apps/backend/`, FastAPI + SQLModel + Alembic. Portability decision from an earlier session: models use
portable SQLAlchemy types so everything runs on SQLite locally, with Postgres as the deployment target.

- Alembic migrations through `4d91e2f7c3ab` apply cleanly against SQLite. Workout and motivation endpoints
  use the existing reference schema; mobile reminder state is local schema v6 rather than a server
  migration.
- `pytest -q` → **24 passed** at that point (auth, health/OpenAPI, authenticated workout lifecycle,
  cross-user isolation, weight/task/nutrition sync); **28** by the Phase 3 checkpoint.
- `ruff check .` → clean (select E, F, I, UP, B; B008 `Depends`/`Query` exempted via
  `extend-immutable-calls`).
- `POST /auth/token` exchanges the configured device key for access/refresh JWTs; `POST /auth/refresh`
  rotates the pair. PyJWT performs HS256 claim/signature validation.
- All workout endpoints require bearer auth. Workout creation derives `user_id` from the token, and
  list/detail/update/set writes hide rows belonging to another user.
- Body weight has authenticated create/list/delete. POST preserves the client UUID, treats identical replay
  as success, returns `409` for conflicting reuse, and normalises offset timestamps to UTC before
  comparison and persistence.
- Tasks and completions have authenticated create/list/update/delete. Task POST replay preserves the client
  UUID; completion replay is idempotent by `(task_id, completed_date)`; archive/restore and clear are
  replay-safe. **Streaks remain derived.**
- Nutrition has authenticated owned-food, entry and target endpoints. Food and entry UUIDs replay
  idempotently; target PUT updates the effective-date row; entry deletion is idempotent.
- `alembic/env.py` reads `DATABASE_URL` from `app.core.config` — single source of truth.
- Workout sessions accept client UUIDs; sets preserve client UUIDs, resolve mobile seeded exercise ids,
  return success for exact replay and `409` for conflicting reuse.
- `GET /api/v1/quotes/today?day=` returns a stable deterministic quote; the mobile app has an offline quote
  catalogue. `POST /api/v1/wallpapers/generate` returns a validated 1080×1920 PNG as base64.

### Final Phase 2 verification (historical, commit `af5b2da`)

- Backend: `ruff check .` clean; `pytest -q` **24 passed**; `alembic upgrade head` reaches head.
- Mobile: typecheck clean; lint clean; `npm test -- --runInBand` **350 passed across 16 suites**.
- Workout replay preserves client session/set ids, accepts mobile seeded exercise ids, and rejects
  conflicting id reuse with `409`.
- Quotes are deterministic by calendar day; wallpaper tests decode a nonblank 1080×1920 PNG.
- Reminders persist in mobile schema v6 and schedule daily or selected-weekday notifications.
- `npx expo-doctor` started all 21 checks but that runner did not return its final summary — it was re-run
  interactively later and passed 21/21.
- `npx expo export --platform android` succeeded. **The Android `dist/` directory is a generated, ignored
  build artifact** and is not part of the source commit; re-run the export when validating a fresh
  checkout.

### Phase 2 implementation map

| Area | Backend | Mobile | Verification |
|---|---|---|---|
| Workout replay | `app/api/workouts.py`, workout schemas | `db/workouts.ts`, `db/outbox.ts`, `sync/outbox.ts` | `test_workouts.py`, outbox suite |
| Quotes | `app/api/motivation.py` | `domain/motivation.ts`, Home | `test_motivation.py`, motivation suite |
| Wallpapers | Pillow route in `app/api/motivation.py` | `app/(tabs)/wallpaper.tsx`, `src/services/mediaLibrary.ts` | PNG decode test, Android export |
| Reminders | Deliberately device-local | `db/alarms.ts`, `src/services/notifications.ts`, `src/domain/reminders.ts`, schema/migration v6, `app/(tabs)/alarms.tsx` | `src/db/__tests__/alarms.test.ts`, `src/domain/__tests__/reminders.test.ts`; delivery still needs a device |

## Mobile — the module flows as built

`apps/mobile/`, Expo SDK 57 + Expo Router (file-based) + expo-sqlite + Zustand.

- **Home**: one focus-time load reads tasks, nutrition, weight, workout history and any active session
  together. Unfinished tasks in priority order, macro progress, the smoothed weight trend and 30-day
  change, active/recent workout status. Each section opens its owning module; an active workout goes
  straight to Resume.
- **Workouts**: history → Start/Resume → pick exercise (modal library, 30 seeded exercises, search +
  add-custom) → weight/reps pre-filled from last time (`suggestNextSet`) → log sets (written through to
  SQLite immediately) → rest timer (derived from a stored epoch-ms start) → Finish → detail. **Force-kill
  survival:** `hydrate()` on History focus re-reads an unfinished session so "Resume" appears instead of
  starting a duplicate.
- **Weight**: trend chart (7-day moving average in accent over raw daily readings in grey, optional dashed
  goal line, 90-day window) → "Log weight" modal pre-filled from the last entry **so the unit cannot
  silently switch** → back to the trend, which reloads on focus. Goal weight is a second modal; long-press
  a history row to delete. **No Zustand store** — the screens read SQLite directly, since there is no
  cross-screen in-progress state the way an active workout has.
- **Tasks**: tick habits off, or open one for its streak history.
- **Macros**: browse the day log, move backward through previous days, inspect calorie/protein/carbs/fat
  progress, add a saved or custom food with a serving quantity and meal, or edit effective-dated targets.
  Entries are grouped by meal; long-press to delete.
- **Motivation**: the deterministic local quote for the current calendar day. The Wallpaper action
  authenticates when sync configuration exists, asks the Pillow API for a 1080×1920 PNG, writes it to
  cache, previews it, and saves it after Photos permission.
- **Reminders**: add or edit a label/time and optional weekday selection; empty selection means daily.
  Rows can be reopened or deleted; updates cancel old native schedule ids before creating replacements.

## Manual device findings — closed

The first device run reported two defects outside the fully passing Today/tasks workflow:

- **Locale decimal input.** `Number.parseFloat` treated `1,5` as `1`, silently changing macro quantities and
  decimal weight values. `src/domain/numbers.ts` now parses dot, comma and Arabic decimal separators with
  strict validation, and macro add/target fields, weight log, weight goal and active-workout weight all use
  it. Mixed or malformed values are rejected rather than partially saved.
- **Bottom-tab icons.** The tab layout uses Material Community Icons; `@expo/vector-icons` and its required
  `expo-font` peer/config plugin are declared directly.

The focused retest passed all five checks on a physical device — a `1,5` quantity of chicken breast
contributing `247.5 kcal` / `46.5 g` protein / `0.0 g` carbs / `5.4 g` fat with a `1.5 × 100 g` serving row;
weight `75,5` storing as `75.5`; a set at `62,5` storing as `62.5`; decimal macro targets and weight goal
saving, reloading and validating; and all five tabs showing real icons. **Both findings are closed.**

The physical migration scenario was not available on that device (no prior Kairo data); the populated v3→v4
migration remains covered by the automated SQLite suite.

---

## The 2026-08-17 UI restructure — superseded by the Greek rebuild

**Read this for the facts it established, not for its plan.** Its screen-by-screen resume point is no
longer the resume point: the three screens it rewrote are being redone along with the other nineteen, and
its outstanding items are folded into the rebuild's per-module work (the checklist now lives in
[`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md)). Its constraints and its lint rules are
still binding — those moved to [`06-architecture-decisions.md`](06-architecture-decisions.md) and
[`08-verification.md`](08-verification.md).

The brief, in the user's words: *"fix other and every issue that was found, or that stopped the app from
running, also the reminder section has bad ui, i think we should restructure the whole app ui to be less
congested and more, as well as an intro logo and a loader logo"*, then *"how about i go and find a new png
icon that would be the icon we would use, and also the base theme color of the icon … and then u could
convert the png icon to a animated loader"* — followed by the artwork itself, a gold Spartan helmet on a
transparent background. So: **the user's art is the app icon, the app's accent is sampled from that art,
and the art is the loader.**

That pass is committed (`791a588`, `493da42`, `e78fcea`), including `apps/mobile/assets/`,
`apps/mobile/scripts/`, `apps/mobile/types/assets.d.ts` (declares `*.png` as `number`, **without which the
asset imports fail typecheck** — nothing in `node_modules` provides it), `src/components/Layout.tsx` and
`src/components/Logo.tsx`.

### Where the shared shell came from

`src/components/Layout.tsx` was created in that pass with `Screen`, `ScreenScroll` (which took over the
`insets.bottom + layout.scrollFooter` footer every screen had been computing differently), `ScreenHeader`,
`Section`, `Card`, `Notice`, `EmptyState`, `Field`, `Divider` and `Stat`.

Three token groups in `src/theme/index.ts` backed it:

- **`layout`** — screen/card/section rhythm, as absolute values, because `spacing` was being used for both
  "gap between two icons" and "screen margin" and everything ended up 16px from everything else.
- **`lineHeight`** — React Native leaves it unset at ~1.15×, which was **the single largest cause of the
  cramped feel**.
- **`chartColors`**.

The rebuild kept all of it and extended it: a fourth group (`type`), new primitives (`AppBar`, `Eyebrow`,
`Meander`, `Fluting`, `StatCard`, `Timer`, `ProgressBar`), and changes to existing ones — `Field` gained a
focus state, `Notice` moved from a full border to a 3px left rule over a 10% tint, `Divider` gained a
vertical orientation, `Button`'s danger variant became outlined.

### The three screens it rewrote, and their defects

The **defects** are the useful part: each is a mistake the rebuild must not reintroduce across 22 screens.

- **`app/(tabs)/alarms.tsx`** — the "bad ui" the user named. It had light-theme hex on a dark scene, so the
  title and every reminder's time rendered **black on near-black**; it duplicated the native header's
  title; and its time field used `keyboardType="numbers-and-punctuation"`, which is **iOS-only**, so on
  Android there was no colon key and the field could not be filled. Rewritten as one `FlatList` with the
  runtime notice and form as its header, a day-of-week picker, a per-row `isActive` Switch (the DB layer
  already supported it), a delete confirmation, "Saved, not scheduled" on any row the OS never took, and
  digit-only time entry.
- **`app/(tabs)/wallpaper.tsx`** — the same invisible-text problem, plus it spun forever when sync was
  unconfigured *while showing a line of text saying sync was unconfigured*, and swallowed every failure into
  that same spinner. Rewritten with four explicit states (`unconfigured` / `loading` / `ready` / `error`), a
  retry, and errors that name the step that failed.
- **`app/(tabs)/index.tsx`** (Home) — six cards of equal weight, so a one-line navigation shortcut looked as
  important as the day's macros. Rewritten as four data cards plus a compact "More" row group (now THE
  OUTER WARD), `chartColors` instead of hardcoded hex, `LogoLoader`, and a `Notice` when the load fails.

New pure helpers in `src/domain/reminders.ts`, all tested: `describeRepeat` (which agrees with
`reminderTriggers` on the ugly case — a non-empty list with no valid day says "Never", not "Every day"),
`weekdayInitials`, `formatTimeOfDay`, `formatTimeInput`, `parseTimeOfDay`.

That pass expected **426 passed (20 suites)** — the previous 394 plus 32 new reminder-helper cases — but
**it was never measured, so it should never have been written down as fact.** The real figure, measured
2026-08-19, is 481 across 20.

## Docs written for the rebuild, 2026-08-18

`docs/09-ui-rebuild-plan.md` is new, and `docs/README.md` lists it as item 10. `docs/00-overview.md` gained
a "Voice and visual identity" section. `docs/04-feature-specs.md` gained a note that its screen names are
functional rather than display copy, plus a spec block for the five new app-shell screens.
`docs/06-roadmap.md`'s "Pulled forward from Phase 6" section records the 2026-08-17 partial restyle as
superseded. `docs/07-repo-structure.md` gained `media/` in the tree, the new Layout primitives, a convention
for the `type` token group, and the English-identifiers rule.

`ui_rebuild_stitch_prompt.md` at the repo root — the prompt the 30 designs were generated from, added in
`e164a93` — was **deleted, and that deletion is committed in `65521f2`**. It is superseded by
`docs/09-ui-rebuild-plan.md`. Older handover text describing the deletion as unstaged is stale.

This folder itself replaced the single `to_continue_with.md` on **2026-08-19**, at 1,606 lines.
