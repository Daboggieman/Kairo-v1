# Phase 3 — status and the native acceptance sequence

**Do not start any of this until the Greek UI rebuild is finished.** A device run against a half-rebuilt
app produces findings that have to be re-collected afterwards. The rebuild's scope is locked in
`docs/09-ui-rebuild-plan.md`; its state is in [`01-current-state.md`](01-current-state.md). Phase 3
acceptance is the step **after** it.

**Do not restart the provider/integration decision.** It is locked: Kairo records and owns its movement
data. There is no Strava connection, no import, no segment competition, no social feature, no third-party
activity upload. `docs/08-phase-3-movement-plan.md` is the complete product and technical contract — read
it first.

## Implementation checkpoint — 2026-08-16

Phase 3 is explicitly Kairo-owned GPS tracking. The locked plan covers run/walk/ride, an Android-first
native spike with iOS designed in, live map, background tracking, pause/autopause, default-on time and
distance voice cues, shared units, indefinite raw-point retention with edit revisions, route replay, and
Kairo backend upload only after completion.

**Implementation is complete through the executable mobile and backend layers.**

- Mobile schemas **v7–v9** cover activities, raw points, lifecycle events, durable engine state, and
  reversible raw-point edit exclusion. v9 is defensive/idempotent because migration tests can rewind
  `user_version` on a current database.
- Expo Location, Task Manager, Speech and React Native Maps are installed at SDK-compatible versions.
- The module-scope background task opens and migrates the same SQLite database, recovers active state,
  processes location batches, and persists points atomically with summaries. **Expo Go has a foreground
  `watchPositionAsync` fallback** for UI testing; background and screen-lock collection still require a
  custom Android development build.
- **Schema v8** stores autopause candidate timestamps and next voice-cue thresholds per active activity.
  Movement settings expose metric/imperial units, default-on voice cues with separate distance/time
  toggles, and autopause. The background task evaluates those settings, persists autopause and voice
  events in order, and invokes local speech. **Native voice behaviour still needs physical Android
  testing**, especially with the screen locked and over Bluetooth audio.
- The first Movement UI is wired: a sixth bottom tab, run/walk/ride readiness and permission flow, live map
  with persistent recording, pause/resume and finish, completed history and detail, and offline animated
  route replay with normalised 1×/2×/4×/8× speeds. The live view respects the shared metric/imperial
  preference, shows run/walk pace or ride speed, separates moving and elapsed time, displays autopause
  explicitly, and lets the user pan before recentering. Replay uses the same unit preference and a
  responsive scrubber.
- **Schema v8 recovery and default-on preference behaviour have direct SQLite-backed tests.** Schema v9
  adds trim/recompute persistence without deleting raw points. Completed activities enqueue a movement
  aggregate only after completion; later edits enqueue higher revisions and deletes enqueue idempotent
  removal.
- Backend migration **`7e3b9a1c2d44`** provides authenticated movement upload, list/detail, revision
  replacement, ownership isolation, and replay-safe deletion.

Automated verification at that checkpoint: mobile typecheck/lint clean, **376 tests across 18 suites**
(**394 across 20** after the 2026-08-17 Expo Go fix, **481 across 20** on 2026-08-19, **494 across 20** on
2026-08-20, and **523 across 21** on 2026-08-21), backend Ruff clean, **28 backend tests**, Alembic at
head, Expo Doctor **21/21**, and both Android and iOS exports successful. The current figure and the
standing `tsc` exception are in [`08-verification.md`](08-verification.md); this list is history, kept to
show the direction of travel.

**No physical-device result has ever been returned.** Background location, screen lock, foreground-service
notification, force-kill recovery, Bluetooth speech, battery use and iOS native behaviour all remain open
acceptance gates. `personal_test.txt` is the current Phase 2/3 runbook.

## Code entry points

- `apps/mobile/src/domain/movement.ts` — pure GPS filtering, state transitions, timing, distance/pace/speed
  formatting, autopause, cue scheduling, replay interpolation.
- `apps/mobile/src/db/schema.ts` and `src/db/migrations.ts` — append-only schemas v7, v8, v9.
- `apps/mobile/src/db/movement.ts` — activity/point/event/history/edit queries and durable engine-state
  recovery. Point-plus-summary writes and event sequence allocation are transactional.
- `apps/mobile/src/services/movementTracking.ts` — the module-scope Expo background task and start/stop
  APIs. **Local SQLite is authoritative throughout an active recording.**
- `apps/mobile/app/(tabs)/movement/` — readiness, active tracking, history/detail, replay, settings.
- `apps/mobile/src/db/__tests__/movement.test.ts` and `src/domain/__tests__/movement.test.ts` — the
  executable persistence and domain contracts.

A fuller map of that layer is in [`07-module-reference.md`](07-module-reference.md).

## The acceptance sequence

Offer to check readiness, then direct the user to run `personal_test.txt` themselves. **Do not claim the
native gate passed until they return the completed checklist and device evidence.** In this order:

**0. Confirm Expo Go renders.** Relaunch and check: no `expo-notifications` error, no "missing the required
default export" warning, no `ExpoMediaLibraryNext` error, all six tabs reachable. That is the 2026-08-17
fix, verified only by typecheck/lint/tests so far. Confirm too that the intro plays once, that the reminders
and wallpaper screens are legible (they were black-on-black), and that no
`NativeDatabase … NullPointerException` appears after a movement recording starts. Then run the Expo Go
foreground sections of the runbook.

**1. Run the Android development-build physical spike.** Verify foreground/background permission flows, the
foreground-service notification, screen-lock collection, manual and automatic pause/resume, force-kill
recovery of already-persisted points, map tiles, voice cues through speaker and Bluetooth, and
representative battery consumption. **Continued collection after force-kill is explicitly not guaranteed;
recovery of the persisted activity is what is required.**

**2. Record the user's Android development-build results.** Expo Go is not sufficient evidence for the
background-service contract. Keep iOS compatibility in the API and schema design, but Android remains the
first native target.

**3. Fix any native issues the spike exposes and re-run all automated checks.**

**4. Run backend sync acceptance** once API credentials are configured: offline completion, exact replay,
higher-revision edit, delete, and cross-user isolation.

**5. Later iOS native integration and physical validation** against the same product contract.

Native reminder delivery / permission prompts and Wallpaper Save-to-Photos also deserve a physical smoke
test, but they are **Phase 2 follow-ups, not Phase 3 blockers**. Workout polish (RPE, set edit/delete,
finish notes, rest-timer threshold) stays explicitly deferred.
