# Current state — 2026-08-19

The status board. Everything here is dated; if a claim is older than the work, distrust it and
re-measure.

## What is being built right now

The complete Greek-themed UI rebuild. The brief, in the user's words: *"i want to rebuild the ui
completely … dark masculine greek themed app for Kairo maintaining the same logo and accent color of
the logo"*. Every screen is renamed on a Greek lexicon — The Citadel (dashboard), The Rites (tasks),
The Forge (workouts), The Feast (macros), The Scales (weight), The Expedition (movement), The Call
(reminders), The Oracle (wallpaper).

`docs/09-ui-rebuild-plan.md` is the **locked scope**: the lexicon, the screen → route map, the
colour/spacing substitution table, the token changes, the five new screens, the delivery gates.

| Stage | State |
|---|---|
| **Stage 0 — foundations** | **Done.** Theme tokens, Cinzel, all 25 `Layout` primitives, `Button`, `Checkbox`, `Logo`. |
| **Stage 1 — shell** | **Done.** `app/(tabs)/_layout.tsx` is the six-tab Canon bar. |
| **Stage 2 — 22 screens** | **15 of 22.** The Citadel, the tasks module (3 + `_layout`), the workouts module (4 + `_layout`), the macros module (3 + `_layout`), the weight module (3 + `_layout`). |
| **Stage 3 — 5 new screens** | Not started. Gates, Sanctum, Envoy, Pantheon, Annals. |

Detail on what landed and why: [`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md). The rules the
remaining screens must follow: [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md).

## The resume point — the movement module

`apps/mobile/app/(tabs)/movement/` — `index.tsx` (111 lines), `new.tsx` (112), `active.tsx` (158),
`[activityId].tsx` (206), `replay.tsx` (103), `settings.tsx` (79), plus `_layout.tsx` (22).
**None of them has been modified.** All six designs (`5.16`–`5.21`) are dumped and analysed and every
decision is written down in [`04-movement-restyle-brief.md`](04-movement-restyle-brief.md) — including
the vocabulary the module's domain layer needs. There is nothing left to gather; open that file and
write code.

After movement: `alarms.tsx` (391 lines) and `wallpaper.tsx` (211), which still need §5.22 / §5.23
transcribing. Both already import `Layout.tsx` — from the **2026-08-17** pass, not the rebuild — so do
not read the import as "already done". Then Stage 3's five new screens.

## Verification — measured 2026-08-19

Run from `apps/mobile`, after the four passes that edited the domain suites (tasks, workouts, macros +
dates, weight):

| Check | Result |
|---|---|
| `npm test` | **20 suites passed, 481 tests passed, 0 failures** (24–64 s, cache-dependent) |
| `npx tsc --noEmit` | clean, exit 0, no output |
| `npm run lint` | clean, banner only — the gate is 0 errors / 0 warnings |

Suites covered: `db/{alarms,tasks,workouts,weight,macros,movement,outbox}`, `store/workoutStore`,
`sync/sync`, and `domain/{tasks,movement,macros,weight,workouts,dashboard,reminders,motivation,chart,dates,numbers}`.

**This supersedes every earlier count in the handover** (350/16, 376/18, 394/20 and the never-measured
"426 expected"). 481 across 20 suites is the first measurement taken since the rebuild began.

**Still not run at all:** any device pass. Delivery gate 4 — *each module restyled and run on a device
before the next is started* — is therefore half-satisfied for all five completed modules. So are
`npx expo export` (both platforms) and `expo-doctor`, which predate the rebuild. Those belong to the
user; see [`08-verification.md`](08-verification.md).

## Working tree — branch `phase_3`

As of 2026-08-19, `git status --porcelain` is **empty**. The whole rebuild through the weight module, and
this handover folder itself, are committed:

| Commit | Date | What |
|---|---|---|
| `f46dca7` | 2026-08-19 | `ox-06(3)` — the `personal_test.txt` rewrite, `docs/07-repo-structure.md`, the `dates.test.ts` comment repoint |
| `7d744c9` | 2026-08-19 | `ox-06(2)` — the `HANDOVER_DOCS/` split itself, plus the `README.md` / `docs/README.md` / roadmap / rebuild-plan repoints |
| `369531c` | 2026-08-19 | `ox-06` — carries the weight module (and the last touch to `apps/backend/.env`) |
| `fff186f`, `65521f2` | 2026-08-18 | `end of day commit` ×2 — the earlier rebuild work; `65521f2` also carries the `ui_rebuild_stitch_prompt.md` deletion |
| `92c21da` | 2026-08-18 | merge of `phase_3` from the remote |
| `e164a93` | 2026-08-18 | the 30 Stitch designs under `media/stitch/` |

`phase_3` is **level with `origin/phase_3`** (0/0) and **8 ahead / 1 behind `origin/master`**. The user
committed and pushed all of this outside these sessions — including the two `ox-06(2)`/`ox-06(3)` commits
made *during* the handover split — which retires three warnings the handover used to carry: "nothing is
committed", "part of it is already in the index", and the unstaged `ui_rebuild_stitch_prompt.md` deletion.
All three are resolved.

Confirm the real state with `git status --short --branch`, `git log --oneline -5` and
`git rev-list --left-right --count origin/master...HEAD` rather than trusting this table — the user
merges and pushes between sessions, so any commit list here dates the moment it was written.

## Open items — none of them blocking

1. **`apps/backend/.env` is tracked in git and holds non-example `DEVICE_KEY` and `JWT_SECRET`
   values** (last committed in `369531c`). `.gitignore`'s secrets block has the `!.env.example`
   exception but no `.env` pattern, so nothing was ever ignoring it. Remedy and reasoning in
   [`11-module-pattern-and-hygiene.md`](11-module-pattern-and-hygiene.md) — it needs the user's
   decision, because it means rotating two secrets, not just a `git rm --cached`.
2. **`apps/backend/.venv` is absent.** Recreate with
   `python3 -m venv .venv && source .venv/bin/activate && pip install -e '.[dev]'` before any backend
   check.
3. **Four Expo packages a patch behind** — `expo-location`, `expo-notifications`, `expo-router`,
   `expo-task-manager`, as reported by `npx expo install --check` before the Cinzel install rebuilt
   `node_modules`. The recommendation was to leave them (nothing observed traces to those versions) and
   the user has not decided. Worth re-running `--check` to see whether the drift is still the same four.
4. **Workout polish** — RPE, set edit/delete, finish notes, rest-timer threshold — remains explicitly
   deferred, and the rebuild does not add it.
