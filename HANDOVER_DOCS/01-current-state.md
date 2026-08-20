# Current state — 2026-08-20

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
| **Stage 2 — 22 screens** | **Done — 22 of 22.** The Citadel (1), the tasks module (3), the workouts module (4), the macros module (3), the weight module (3), the movement module (6), The Call and The Oracle (2) — plus each module's `_layout.tsx`. |
| **Stage 3 — 5 new screens** | Not started. Gates, Sanctum, Envoy, Pantheon, Annals. |

Detail on what landed and why: [`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md). The rules the
Stage 3 screens must follow: [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md).

## The resume point — Stage 3's five new screens

Stage 2 is **finished**. The last two screens, The Call (`app/(tabs)/alarms.tsx`, 430 lines) and The
Oracle (`app/(tabs)/wallpaper.tsx`, 312), were restyled 2026-08-20 per §5.22 / §5.23. Neither needed new
domain vocabulary — `describeRepeat` / `formatTimeOfDay` in `src/domain/reminders.ts` and `quoteForDate`
in `src/domain/motivation.ts` already held it — so **the test count is unchanged at 494 across 20 suites**,
which is the expected result rather than a gap in coverage. `motivation.ts` gained two doc comments and no
code. The departures both files took are in
[`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md#stage-2--the-call-and-the-oracle).

Next: **Stage 3** — Gates, Sanctum, Envoy, Pantheon, Annals, per `docs/09-ui-rebuild-plan.md`. The
rebuild hangs the Pantheon and the Annals off The Citadel's Outer Ward row group, so no navigation
restructure is needed for those two.

**Two things the Stage 2 close-out turned up, neither of them blocking:**

- **A layout bug in a screen already shipped, now fixed:** `app/(tabs)/tasks/new.tsx`'s seven day toggles
  overflowed the screen margin, because React Native's `flexShrink` defaults to **0** and seven fixed 44pt
  circles need more width than a 360–375pt phone leaves. `dayChip: { flexShrink: 1 }` in both that file
  and The Call. Written up as a convention in
  [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md).
- **A content question for the user, not a decision to take unilaterally:** the design for The Oracle
  quotes *"Know thyself. — Inscribed at Delphi"*, while `QUOTES` in `src/domain/motivation.ts` holds seven
  modern lines (Twain, Collier, Roosevelt, Mandela, Franklin, Gandhi, Ashe). By the standing rule that
  design sample content is not transcribed, the existing set was kept. Swapping it for classical sources
  would fit the lexicon and would break nothing — `motivation.test.ts`'s two `it` blocks are structural
  and pin no content — but it is a change to what the app *says*, so it waits for the user. See open item 5.

**One tracker gap the movement pass found and did not paper over:** `elevation_gain_meters` is never
written by anything, so The Chronicle's CLIMB cell and elevation chart were dropped rather than
rendered as a permanent zero. Whoever implements elevation owns both.

## Verification — measured 2026-08-20

Run from `apps/mobile`, after the movement pass and again after The Call and The Oracle:

| Check | Result |
|---|---|
| `npm test` | **20 suites passed, 494 tests passed, 0 failures** (11–24 s, cache-dependent) |
| `npx tsc --noEmit` | clean, exit 0, no output |
| `npx eslint .` | clean, exit 0 — the gate is 0 errors / 0 warnings |

Suites covered: `db/{alarms,tasks,workouts,weight,macros,movement,outbox}`, `store/workoutStore`,
`sync/sync`, and `domain/{tasks,movement,macros,weight,workouts,dashboard,reminders,motivation,chart,dates,numbers}`.

**This supersedes every earlier count in the handover** (350/16, 376/18, 394/20, the never-measured
"426 expected", and 481/20 from 2026-08-19). The +13 over 481 is the movement domain vocabulary; The Call
and The Oracle added none, because nothing they do is untested behaviour that moved.

**Still not run at all:** any device pass. Delivery gate 4 — *each module restyled and run on a device
before the next is started* — is therefore half-satisfied for all of Stage 2. So are
`npx expo export` (both platforms) and `expo-doctor`, which predate the rebuild. Those belong to the
user; see [`08-verification.md`](08-verification.md).

## Working tree — branch `phase_3`

**All of Stage 2 is committed**, in two commits the user made on 2026-08-20: **`ox-07`** (`32870e5`) —
*"Stage 2 of the Greek UI rebuild: the movement module, The Call, The Oracle"*, 24 files, 2,892 insertions
and 724 deletions — and **`ox-07(2)`** (`cac8cfa`), the doc-audit fixes that followed it. Nothing here
stages or commits on its own; both were the user's.

**This section does not list the current tree**, deliberately: it went stale three times in one session,
once because the commit that made it stale happened while it was being written. Run
`git status --short --branch` — that is the answer, and it is never older than the moment you ask.

What `ox-07(2)` fixed is worth keeping, because both were **pre-existing misses from the movement pass**
rather than from the Stage 2 close-out, and both were the same shape — a **future-tense claim about work
already done**, which reads as current until someone opens the file it describes:

| File | The stale claim |
|---|---|
| `02-ui-rebuild-conventions.md` | the `movement/active.tsx` exception still named `headerBackVisible: false` and said it "must survive the restyle"; the restyle had already moved that intent to `gestureEnabled: false` in `movement/_layout.tsx` |
| `04-movement-restyle-brief.md` | its "After movement" section still said `alarms.tsx` (391 lines) and `wallpaper.tsx` (211) needed §5.22 / §5.23 transcribing |

The same audit found the resume point living in **three** files, drifting in two of them. It is now in this
document only; [`README.md`](README.md) and the root `to_continue_with.md` link here instead of restating
it, and the root file was cut to a pure redirect that holds no facts of its own.

| Commit | Date | What |
|---|---|---|
| `cac8cfa` | 2026-08-20 | `ox-07(2)` — the doc-audit fixes: the two stale future-tense claims above, and the resume point collapsed to one copy |
| `32870e5` | 2026-08-20 | `ox-07` — **the whole of Stage 2 past the weight module**: the movement module (7 files) + `movement.ts` + its suite, The Call, The Oracle, `motivation.ts`, the `tasks/new.tsx` `flexShrink` fix, and the handover updates |
| `89499ba`, `c8ceed9` | 2026-08-20 | merges of PR #14 (`master`) and PR #13 (`phase_3`) |
| `85960e2` | 2026-08-19 | `ox-06(4)` |
| `f46dca7` | 2026-08-19 | `ox-06(3)` — the `personal_test.txt` rewrite, `docs/07-repo-structure.md`, the `dates.test.ts` comment repoint |
| `7d744c9` | 2026-08-19 | `ox-06(2)` — the `HANDOVER_DOCS/` split itself, plus the `README.md` / `docs/README.md` / roadmap / rebuild-plan repoints |
| `369531c` | 2026-08-19 | `ox-06` — carries the weight module (and the last touch to `apps/backend/.env`) |
| `fff186f`, `65521f2` | 2026-08-18 | `end of day commit` ×2 — the earlier rebuild work; `65521f2` also carries the `ui_rebuild_stitch_prompt.md` deletion |
| `92c21da` | 2026-08-18 | merge of `phase_3` from the remote |
| `e164a93` | 2026-08-18 | the 30 Stitch designs under `media/stitch/` |

`phase_3` is **level with `origin/phase_3`** (0/0) and **13 ahead / 0 behind `origin/master`** as of
2026-08-20. It was 11/0 before `ox-07` and 8 ahead / 1 behind on 2026-08-19, so the user merges and pushes
between sessions. That also retires three warnings the handover used to carry: "nothing is committed",
"part of it is already in the index", and the unstaged `ui_rebuild_stitch_prompt.md` deletion.

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
5. **The Oracle's quote set is modern, the design's is classical.** `QUOTES` in
   `src/domain/motivation.ts` holds seven lines from Twain, Collier, Roosevelt, Mandela, Franklin, Gandhi
   and Ashe; `5.23_the_oracle` shows *"Know thyself. — Inscribed at Delphi"*. The set was kept, per the
   rule that design sample content is not transcribed. Replacing it with classical sources would suit the
   lexicon and costs nothing technically — `motivation.test.ts` asserts structure, not content, and
   `quoteForDate` works on any array length — but it changes what the app says to its user every morning,
   so it is the user's call. Raised 2026-08-20; undecided.
