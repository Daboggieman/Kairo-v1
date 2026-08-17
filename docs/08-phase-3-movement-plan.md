# Phase 3 — Kairo Movement Plan

Phase 3 is a self-contained Kairo GPS tracker. It has no Strava integration, no
external fitness-provider import, no uploads to third-party services, and no social
or competitive features.

## Locked scope

- Run, walk, and ride activities from the first release; hike is deferred.
- Live route map while recording and route replay after completion.
- Background location while the screen is locked or the app is normally backgrounded.
- Manual pause/resume, autopause, and auto-resume.
- Voice cues enabled by default, with settings to disable them and to control time- and
  distance-based cues independently.
- One explicit shared metric/imperial preference for display and cue thresholds.
- Indefinite raw GPS retention initially, with edits represented separately from raw data.
- Upload to Kairo's backend only after completion; recording never requires a network.
- Android-first native spike, followed by iOS integration using the same domain/data model.

Force-killing the app is not guaranteed to keep recording. Points successfully persisted
before termination remain recoverable; normal backgrounding and screen lock are supported.

## Architecture

The native location task writes to SQLite. React state is only a live presentation layer;
an active workout must survive screen unmounts and process recovery. A pure domain engine
owns the state machine, point filtering, distance, moving time, autopause, splits, cues,
replay interpolation, and edit/recalculation rules.

The lifecycle is:

```text
draft -> preparing -> recording -> manually_paused -> recording
                              -> auto_paused -> recording
                              -> finishing -> completed
```

`cancelled`, `discarded`, and `interrupted` are terminal alternatives. Only completed
activities enter the sync outbox.

## Local model

Mobile schema v7 introduces `movement_activities`, `movement_points`, `movement_events`,
and `movement_splits`; shared/movement preferences remain in the existing preference
table. Canonical values are SI:
meters, meters/second, kilograms, and seconds. Raw points are retained even when a point
is rejected for distance calculations, with a processing state and rejection reason.

An activity stores a current summary and revision. Points are ordered by sequence. Events
record starts, pauses, resumes, autopause transitions, voice cues, interruptions, edits,
and completion. User edits never overwrite raw coordinates: trim/inclusion decisions and
an edit event cause derived summaries and splits to be recalculated.

## Tracking rules

The pipeline is native callback -> durable raw sample -> validation/filtering -> accepted
distance/time update -> autopause/split/cue evaluation -> atomic SQLite commit -> live UI.
Duplicate or out-of-order samples must be harmless. Poor accuracy and impossible jumps are
excluded from derived distance but remain inspectable.

Initial autopause defaults are tunable constants: run below 0.8 m/s, walk below 0.35 m/s,
ride below 1.0 m/s, with sustained thresholds of roughly 10–12 seconds and higher resume
thresholds. Manual pause always disables auto-resume until explicitly resumed.

Voice defaults are distance every 1 km/mi and time every 10 minutes, plus pause/resume,
autopause/auto-resume, split, and completion announcements. The scheduler persists crossed
thresholds so recovery cannot repeat old cues.

## UX

The Movement tab will provide history and weekly summaries. A readiness screen handles
permissions and activity selection. The active screen shows the live map, distance,
elapsed/moving time, pace or speed, pause state, and finish controls. Detail shows the
route, splits, elevation where useful, pause/event timeline, edits, and replay.

Replay supports play/pause, scrubbing, restart, recenter, and 1x/2x/4x/8x normalized speeds.
The marker and metrics are reconstructed from stored points/events; replay is fully offline.

## Sync contract

Completed activities are uploaded after finalization through replay-safe Kairo endpoints.
Metadata, events, and points may be batched. Client IDs and revisions are preserved; exact
replays succeed, conflicting reuse returns `409`, and partial uploads remain incomplete.
Deleting or editing an activity is also replay-safe. The server derives ownership from JWT.

## Delivery gates

1. Android physical-device spike: custom build, background task, screen lock, SQLite writes,
   map, speech, recovery, and battery measurement.
2. Pure domain engine and tests: state machine, filtering, distance, time, pace/speed,
   elevation, autopause, splits, cues, replay, and edit recalculation.
3. Schema/query migration and active-workout recovery.
4. Native recording adapter and permission/interruption handling.
5. Live workout UI.
6. History, editing, detail, and replay UI.
7. Backend migrations, authenticated APIs, and post-completion outbox replay.
8. Android hardening, then iOS background-location, maps, speech, and recovery validation.

Completion requires physical-device verification, offline usability, no duplicate replay,
correct pause/autopause accounting, voice settings, edit revisions, and green Phase 1/2
regression suites.
