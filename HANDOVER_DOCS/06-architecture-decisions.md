# Architecture decisions — the ones that cost something to learn

Project-wide. Each of these was either a deviation taken deliberately or a rule extracted from a bug that
took a session to find. Read the first two sections before adding a dependency, opening a database
connection, or making a native call.

## Never open a second default SQLite connection — 2026-08-17

Once the app rendered, a second physical run produced ~57 identical unhandled rejections:

```
Call to function 'NativeDatabase.prepareAsync' has been rejected.
→ Caused by: java.lang.NullPointerException
```

**Read that signature precisely: it means the native database peer was destroyed while JS still believed
the connection was open.** Proven from `node_modules/expo-sqlite`'s Android source, not inferred:

- `SQLiteModule.closeDatabase` sets `isClosed = true`, and every entry point calls
  `maybeThrowForClosedDatabase` first. An ordinary close therefore reports
  `AccessClosedResourceException`, **never** an NPE.
- `NativeDatabaseBinding.close()` is `mHybridData.resetNative()`, which destroys the C++ peer. fbjni then
  throws a bare `NullPointerException` for any later call on that object.
- The only path that resets the peer *without* setting `isClosed` is
  `NativeDatabase.sharedObjectDidRelease()` → `this.ref.close()`, which fires when a **JS handle is
  garbage-collected**.
- `SQLiteModule.kt`'s `NativeDatabase` constructor returns a **cached** native database for a matching
  path + options (`findCachedDatabase { … && !options.useNewConnection }`), bumping a reference count. So
  two JS handles can share one native peer, and the reference count guards `closeAsync` but cannot guard
  the garbage collector.

Kairo's trigger was `src/services/movementTracking.ts`: `processLocationBatch` opened
`openDatabaseAsync(DATABASE_NAME)` and closed it in a `finally` **on every GPS batch**. That open returned
the `SQLiteProvider`'s own native database; when the extra JS handle was later collected, it destroyed the
peer every screen was still using, and the whole app's SQLite access died at an unpredictable moment
shortly after tracking started — permanently, with nothing surfaced to the user. The same call also re-ran
the entire `migrate()` roughly every three seconds.

It now opens **one** connection per process, with `useNewConnection: true` so the cache is bypassed and the
handle owns its own peer, held at module scope so it is never collected, migrated once, and never closed.
WAL (set by `migrate`) is what makes a second writer safe, and calling `migrate` on it also applies the
per-connection `PRAGMA foreign_keys = ON`.

> **The rule: never call `openDatabaseAsync(DATABASE_NAME)` with default options.** Screens take the handle
> from `useSQLiteContext()`. Anything outside the React tree opens with `useNewConnection: true` and does
> not close it.

Its companion rule: **every screen load needs a `.catch`.** One dead connection printed ~57 unhandled
rejections instead of one visible error because every screen loaded with `query().then(setState)` and no
handler. The remaining five are listed in
[`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md).

## A native package Expo Go may lack is never imported at module scope — 2026-08-17

The first Expo Go LAN run on a physical Android device never rendered a single screen. The ~22 Metro lines
came from **three** app-level root causes plus two environment items; everything else was downstream noise.

**1. `expo-notifications` cannot be imported in Expo Go on Android — and it took the whole app down.** Its
barrel entry has a module-scope side effect (`DevicePushTokenAutoRegistration.fx`) that registers a
device-push-token listener as the module evaluates, and that listener *throws* on Android in Expo Go
because SDK 53 removed remote notifications from it. `app/_layout.tsx` imported it at line 12, so the root
layout never finished evaluating. Expo Router reported the casualty as
`Route "./_layout.tsx" is missing the required default export`, and rendering died on
`Cannot read property 'ErrorBoundary' of undefined` — the exported `ErrorBoundary` cannot catch a throw in
its own module. `src/db/alarms.ts` imported it too, which is why `./(tabs)/alarms.tsx` warned as well.
**Read repeated identical errors as one failure re-thrown from Metro's module cache, not eight.**

**2. `expo-media-library`'s default entry is wrong twice over.** It resolves the `ExpoMediaLibraryNext`
native module at module scope, which Expo Go does not ship — hence
`Cannot find native module 'ExpoMediaLibraryNext'` and a dead `wallpaper.tsx` route. In SDK 57 that
entry's `saveToLibraryAsync` is also a deprecated stub that *throws* and tells you to import from
`expo-media-library/legacy`, so Save to Photos could not have worked in a development build either. The
legacy entry needs only the older `ExpoMediaLibrary` module and is where `saveToLibraryAsync` still lives.

**3. Two smaller defects found in the same code.** `deleteAlarm` awaited
`cancelScheduledNotificationAsync` without a catch, so a schedule the OS had already dropped would reject
and abort the `DELETE`, leaving a row the user could not remove. And the alarms screen validated
`hour > 23` without a lower bound, so `-1:00` passed the screen and hit the `alarms` CHECK constraint as an
unhandled rejection.

**Environment, not app:** the React Native DevTools `chrome-sandbox` SUID error (affects only the `j`
debugger; `chown root` + `chmod 4755` fixes it) and one `npm ETIMEDOUT` fetching `expo-doctor`, which
passed 21/21 on the retry. Both are in `personal_test.txt`.

### The fix: capability tiers, required lazily

> **A static import is hoisted past every guard, and its failure is not a degraded feature — it is a dead
> route, reported as a missing default export.**

That rule is why `src/services/runtime.ts` exists:

| File | Role |
|---|---|
| `src/services/runtime.ts` | `IS_EXPO_GO` (`Constants.executionEnvironment === 'storeClient'`), moved out of `movementTracking.ts` and re-exported from it so `movement/new.tsx` is untouched |
| `src/services/notifications.ts` | `notificationsMode()` → `full` \| `local-only` \| `unavailable`, plus `configureNotificationHandler`, `scheduleReminder`, `cancelReminder` |
| `src/services/mediaLibrary.ts` | `mediaLibraryAvailable()` and `saveImageToLibrary()` over `expo-media-library/legacy` |
| `src/domain/reminders.ts` | pure `reminderTriggers` — the daily-versus-weekly decision and weekday validation |

`notificationsMode()` resolves once, lazily, through three tiers: the public barrel (development builds,
production, and Expo Go on **iOS**, where it only warns); the deep local-only modules
(`expo-notifications/build/{NotificationPermissions,scheduleNotificationAsync,cancelScheduledNotificationAsync,NotificationsHandler}`)
for Expo Go on Android, which do not pull the push side effect in and still schedule local reminders; then
`unavailable`. The deep paths are private API reached through a try/catch `tryRequire`, so a future SDK
restructuring `build/` degrades to a banner rather than a crash — the exact failure this module exists to
prevent. `expo-notifications` has no `exports` map today, which is what makes the subpaths resolvable.

**Metro resolves `require()` at build time, so the path must be a literal.** The first version passed the
path as a parameter (`require(request)`), which is not a runtime failure but a *bundling* failure —
`Invalid call at line 70: require(request)`, thrown by `metro-transform-worker`, taking down the whole
bundle rather than one route. Each path is now written out at its own call site and handed over as a thunk
(`tryRequire(() => require('…'))`); the laziness was always in the closure, never in the dynamic path, so
the tiers are unaffected. Anything added here must keep the literal, and the five deliberate requires sit
inside one scoped `eslint-disable @typescript-eslint/no-require-imports` pair (that rule is `warn`, and the
repo gate is zero warnings).

Behaviour that follows:

- **Rows always save.** `scheduleReminder` returns `null` for an unavailable runtime, a denied permission,
  or a row whose time/weekdays do not describe a schedule; `createAlarm` stores `notification_id = NULL`
  and keeps the row, so the reminder starts working once the missing piece is in place. `src/db/alarms.ts`
  no longer mentions `expo-notifications`.
- **The reminders screen states the runtime.** A muted line for `local-only`, an amber notice for
  `unavailable`, and "Saved, but not scheduled" when a working runtime denied permission — the case that
  otherwise looks like a silent no-op.
- **The wallpaper screen offers Save to Photos only when it can.** Otherwise "Preview only".
  `saveImageToLibrary` returns `saved` / `permission-denied` / `unavailable` instead of throwing, because
  those are three different messages to the user.
- **An empty `repeatDays` means daily** (the screen's contract). A non-empty list whose weekdays are all
  invalid schedules *nothing* rather than falling back to daily — firing seven times a week is a worse
  answer than not firing. Weekdays here are `1`–`7` (Sunday first), which is `getDay() + 1`, **not** the
  `getDay()` numbering `src/domain/tasks.ts` uses.

**Expo Go bundles and launches** as of that fix: `npx expo start --go --lan -c` reached
`Android Bundled 68023ms node_modules/expo-router/entry.js (1741 modules)` with no `expo-notifications`
error, no missing-default-export warning, and no `ExpoMediaLibraryNext` error. The one remaining `WARN` —
Expo Go "can no longer provide full access to the media library" — is emitted by the **Expo Go client's own
native code** (the string appears nowhere in `node_modules`), which is positive evidence that
`expo-media-library/legacy` bound to a native module that is actually present. `mediaLibraryAvailable()`
therefore returns true in Expo Go and the Save button renders; whether the file reaches the gallery is
still a device check.

## Structure and data

- **Expo Router over React Navigation** (a deviation from the planning docs): routes live in
  `app/(tabs)/<module>/`; there is no `src/screens/` or `src/navigation/`. Documented in
  `docs/07-repo-structure.md` — keep new modules under `app/(tabs)/`.
- **Offline-first.** Local writes remain authoritative. When sync configuration is present, weight
  creates/deletes are recorded in the outbox and replayed; without it the app is fully offline. Seeded
  exercises use deterministic `seed-*` ids so sync will not duplicate them.
- **Single user for now.** `LOCAL_USER_ID = 'local-user'` in `src/constants.ts`, re-exported from
  `src/store/workoutStore.ts` so the existing workout screens kept working. Grep the constant to find
  everything Phase 2 auth has to touch; every row carries `user_id` from day one per the data model, and
  the queries honour it — there are tests for that, in a single-user app, on purpose, because the filters
  must not be missing when sync arrives.
- **Calendar-day arithmetic lives in `src/domain/dates.ts`**, extracted from `domain/weight.ts` when tasks
  needed the same helpers (the same move `LOCAL_USER_ID` made). `dayKeyFromDate` is the single place the
  host timezone is read; `toDayKey` and `todayNumber` both route through it, so "the day this timestamp
  belongs to" and "the day it is now" cannot be computed two different ways. **A day is always a local
  calendar day**; a day *key* (`YYYY-MM-DD`) is parsed as UTC midnight because the timezone has already
  been resolved out of it, and re-applying an offset would shift days across a DST boundary.
- **Charting is hand-rolled** on `react-native-svg` — the only added dependency, and Expo bundles it.
  `react-native-svg-charts` peers on svg `^6||^7` against the 15.15.4 the SDK ships and is unmaintained
  since 2019; `victory-native@41` pulls Skia, Reanimated and gesture-handler as native deps for one line
  chart. Geometry lives in `src/domain/chart.ts` as pure functions (`seriesBounds`, `niceRange`, `project`,
  `linePath`, `yTicks`) — the degenerate cases that actually ship (one point, flat series, empty series)
  produce `NaN` in an SVG `d` attribute, which React Native reports as a render warning rather than a
  crash. Reach for the same split before adding any further chart.
- **Weight is stored as logged, normalised on read.** The row keeps the unit the user typed and the domain
  layer converts to kg, same as `workout_sets`. Derived values (goal, trend, deltas) are kg throughout,
  converted once at the display boundary. `LB_PER_KG` has one definition, in `src/domain/workouts.ts`.
- **Preferences are a generic key-value table** (`user_preferences`, PK `(user_id, key)`, upsert via
  `ON CONFLICT DO UPDATE`) rather than a column per setting, so the deferred unit-preference decision needs
  no further migration. `getGoalWeightKg` treats an unparseable value as unset rather than throwing — a
  corrupt preference should not break the screen it decorates.
- **Unit preference:** movement has one shared metric/imperial preference in `user_preferences`, and
  live/replay displays read it. Strength sets still carry their own logged unit, and `suggestNextSet` falls
  back to kg with no history.
- **`user_preferences` has no entity type in `src/sync/outbox.ts`**, so anything stored there is
  device-local by design. A weighing syncs; a vow does not. Calling `requestSync` after writing a
  preference would be a no-op that reads like a promise.
- **Infra/CI is written but not fully exercised.** Docker/Postgres and GitHub CI are optional follow-up
  checks, not prerequisites for the current work.

## Branding invariants

- **Greek display copy, English identifiers.** Every screen has a Greek display name — the dashboard is
  THE CITADEL, workouts THE FORGE, macros THE FEAST — but routes, tables, columns, types, stores and
  functions keep their plain English ones, because `docs/02-data-model.md`, `docs/03-api-design.md` and the
  backend's matching routers all use them. A `domain/pantheon.ts` is fine: it is named after a screen that
  exists. Renaming `domain/tasks.ts` to `rites.ts` is not. **The lexicon lives in
  `docs/09-ui-rebuild-plan.md` and nowhere else.**
- **The app is dark-only and its accent is measured, not chosen.** `userInterfaceStyle` is pinned `dark` in
  `app.json` because there is no light palette; a screen that assumes a light default renders black on
  near-black, which has happened twice.
- **The accent comes from the user's own artwork.** `apps/mobile/assets/source/kairo-mark.png` is the
  original file, kept for provenance. `apps/mobile/scripts/generate-icons.py` derives every rendered asset
  from it: trims to the alpha bounding box, recolours near-black interior pixels to `#0B0D10` so no OLED
  seam shows, and fits the art by its longest side. It writes `assets/logo.png` (296×512, in-app),
  `assets/icon.png` (opaque field, `ICON_FIT = 0.80`) and `assets/adaptive-icon.png` (transparent,
  `ADAPTIVE_FIT = 0.56` for Android's 108dp canvas where only the central 72dp is visible). **Re-run it if
  the artwork changes; never hand-edit the outputs.**
  - `colors.accent = '#D79E2D'` is the **measured mean gold** of that art. The first attempt at automatic
    extraction picked `#080000` — a near-black artifact with saturation 1.0 — so the heuristic also
    requires HSV value > 0.45.
  - `colors.accentText = '#0B0D10'`. White on this gold is **2.38:1** and fails WCAG AA; near-black is
    8.17:1. That flip is why every primary `Button` label and the `Checkbox` tick is dark on gold.
    `colors.warning` moved to amber `#E07B39` because gold *is* the accent now, and `chartColors.fat` moved
    to violet for the same reason.
  - Verified visually at 48/72/96 px and under a simulated circular launcher mask — nothing clips.
- **Two hard constraints on `src/components/Logo.tsx`:**
  1. **The helmet must never rotate.** It is a figure with a top and a bottom; a spinning logo reads as a
     rendering fault. `LogoLoader` holds the mark still and turns an SVG ring around it
     (`react-native-svg` 15.15.4, already installed).
  2. **These components must sit on `colors.background`.** The mark's interior is opaque
     background-coloured pixels, not transparency, so on a lighter surface it shows as dark patches.
     `wallpaper.tsx`'s loading placeholder carries a comment about exactly this.

  Exports: `KairoMark`, `KairoWordmark`, `LogoLoader`, `AppLoader` (the `Suspense` fallback in
  `app/_layout.tsx`), `IntroOverlay`. The intro renders **over** a mounted app rather than gating it, so
  the database opens behind it and dismissing it reveals data instead of a spinner. A module-scope
  `introPlayed` flag in `app/_layout.tsx` stops it replaying on Fast Refresh or an `ErrorBoundary` retry.
  **`expo-splash-screen` is not installed** — the intro is JS, not a native splash.
- `app.json` carries `icon`, `backgroundColor` and `android.adaptiveIcon`, and `userInterfaceStyle` changed
  `automatic` → `dark`: with no light palette, `automatic` only made native alerts and the keyboard clash.
