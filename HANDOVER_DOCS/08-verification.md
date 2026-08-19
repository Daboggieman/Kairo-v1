# Verification — the commands, their measured results, and the traps

The repo gate is **0 TypeScript errors, 0 ESLint errors, 0 ESLint warnings, 0 failing tests.** Everything
below states when it was last *measured*; treat an undated claim as an expectation.

## The commands

```sh
# Mobile — from apps/mobile
npm run typecheck              # tsc --noEmit
npm run lint                   # eslint .
npm test                       # jest (add -- --runInBand if a suite interferes)

# Backend — from apps/backend
source .venv/bin/activate
ruff check .                   # All checks passed!
pytest -q                      # 28 passed
alembic upgrade head           # reaches head (idempotent)

# Native / packaging — the user's to run
EXPO_NO_TELEMETRY=1 npx expo-doctor
EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir /tmp/kairo-android-export
EXPO_NO_TELEMETRY=1 npx expo export --platform ios     --output-dir /tmp/kairo-ios-export
                               # telemetry disabled because the sandbox cannot write ~/.expo
```

## What was last measured, and when

| Check | Result | Measured |
|---|---|---|
| `npm test` | **481 passed, 20 suites, 0 failures** (24–64 s, cache-dependent) | **2026-08-19** |
| `npx tsc --noEmit` | clean, exit 0, no output | **2026-08-19** |
| `npm run lint` | clean, banner only | **2026-08-19** |
| `ruff check .` | All checks passed | 2026-08-16 |
| `pytest -q` | 28 passed | 2026-08-16 |
| `alembic upgrade head` | at head | 2026-08-16 |
| `expo-doctor` | 21/21 | 2026-08-16 — **predates the rebuild** |
| `expo export` android + ios | both successful | 2026-08-16 — **predates the rebuild** |
| Any physical-device run | **never run** | — |

The 481/20 measurement **supersedes every earlier count in this handover** — 350/16, 376/18, 394/20 and the
never-measured "426 expected". Suites covered:
`db/{alarms,tasks,workouts,weight,macros,movement,outbox}`, `store/workoutStore`, `sync/sync`, and
`domain/{tasks,movement,macros,weight,workouts,dashboard,reminders,motivation,chart,dates,numbers}`.

**Division of labour:** `npm test`, `npx tsc --noEmit` and `npm run lint` are ours to run — the user
authorised that on 2026-08-19 (*"run the required tests, the dependencies have been installed"*). Device
runs, `expo export` and `expo-doctor` remain **theirs**. Report readiness; never claim a native gate passed
without their evidence.

## This machine

Two things that cost time every time they are rediscovered:

- **Node is not on the non-interactive shell's `PATH`.** Prefix every `npm`/`npx`/`node` call with
  `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" &&`.
- **The shell is zsh, where an unmatched glob is a hard error**, not a literal.
  `grep -rn foo --include=*.ts .` dies with `no matches found: --include=*.ts`, and any unquoted route path
  breaks: write `app/'(tabs)'/workouts/index.tsx`, or reach for `find`.

Housekeeping:

```sh
cd apps/mobile && python3 scripts/generate-icons.py     # after an artwork change; needs Pillow
cd apps/mobile && npm install                           # fresh clone
cd apps/backend && python3 -m venv .venv && source .venv/bin/activate && pip install -e '.[dev]'
```

`apps/backend/.venv` is **currently absent** — recreate it before any backend check.

## The three ESLint rules that bite

This config is React-Compiler-era, and the gate is zero warnings, so all three are effectively errors:

- **`react-hooks/refs`** rejects `useRef(new Animated.Value(0)).current` — reading a ref during render.
  `Logo.tsx` has a local `useAnimatedValue()` (a `useState` with an initialiser) for exactly this; reuse it
  rather than reinventing it. It will hit any new animated component.
- **`react-hooks/set-state-in-effect`** rejects calling `setState` *synchronously* inside an effect. That is
  why `wallpaper.tsx` derives its status from a result tagged with its attempt number instead of storing a
  status and setting it to `'loading'` at the top of the fetch. Setting state **after an `await` is fine**.
- **`react-hooks/preserve-manual-memoization`** cost **7 errors** in the macros module alone. The fix is not
  to satisfy it — it is to **drop the manual memo**: write `onPress={() => void onSave()}` rather than
  wrapping a handler in `useCallback` the compiler then objects to.

One scoped `eslint-disable @typescript-eslint/no-require-imports` pair exists on purpose, around the five
deliberate lazy `require()`s in `src/services/notifications.ts`. That rule is `warn`, and the gate is zero
warnings — see [`06-architecture-decisions.md`](06-architecture-decisions.md).

## The test harness

`src/db/__tests__/testDb.ts` exposes `createTestDb()`: a thin adapter presenting Node's built-in
`node:sqlite` through the subset of the `SQLiteDatabase` interface the query layer uses (`execAsync`,
`runAsync`, `getAllAsync`, `getFirstAsync`, `prepareAsync`). Tests get the **real** schema from
`migrations.ts` and the **real** seed data, so SQL is exercised as written rather than mocked.

Four details to know before extending it:

- **`jest.testMatch` in `package.json` is narrowed to `**/*.test.[jt]s?(x)`.** jest-expo's default treats
  every file under `__tests__/` as a suite, which made the shared `testDb.ts` helper fail as an empty test
  file. Colocated helpers are fine now.
- Because the harness runs the app's own `migrate()`, it inherits `PRAGMA foreign_keys = ON` — so tests
  catch FK violations the app would hit. But **`node:sqlite` enables foreign keys by default**, so a
  passing cascade test does not by itself prove that pragma is doing its job on a real device, where SQLite
  defaults it off. The tasks delete-cascade test says so in a comment.
- **The store is a zustand module singleton**: reset its state in `beforeEach`, or a `sessionId` from the
  previous test leaks into a fresh database and surfaces as a confusing FK error.
- **`expo-crypto`'s `randomUUID` has no jest implementation** — the store suite mocks it with a counter, and
  `Date.now()` is pinned with `jest.useFakeTimers()`. The tasks suites avoid both by passing explicit ids
  and an injected `nowMs`. Prefer that.

### Timezone pinning — `globalSetup`, never `setupFiles`

The weight domain buckets weigh-ins by **local** calendar day on purpose (a 22:00 weigh-in should land on
the date shown beside it), and the tasks domain counts a habit ticked off at 23:30 for that day. Both are
therefore timezone-sensitive: a fixture at `23:59:59Z` is the 11th in London and the 12th in Berlin.
`jest.globalSetup.js` pins `TZ=UTC` for the run.

**It has to be `globalSetup`.** A setup file runs *inside* the jest environment, whose `process` is a
sandboxed copy — assigning `TZ` there never reaches the ICU timezone cache, so `Date` quietly keeps using
the host zone. Confirmed the slow way: `jest --showConfig` proved the setup file was resolved and loading,
and separate Node probes proved Node does honour a runtime `TZ` mutation, leaving the sandboxed `process` as
the only explanation. `globalSetup` runs in the real Node process before workers fork, so they inherit the
zone at spawn.

**Two rules that follow:**

1. Do not "fix" a future timezone failure by editing the assertion to match the machine.
2. **`TZ` is pinned; the locale is not.** So assert a formatted number against `n.toLocaleString()`, never
   against a literal like `"5,240"` — that is a test which passes here and fails on a French machine. Same
   for dates: no literal `"18/08/2026"`.

## Bugs the tests actually caught

Worth reading as evidence for where to put the next test.

**In `listSessions()`** (`src/db/workouts.ts`, the History query) — neither was reachable from the domain
tests, which is what made the SQLite-backed pass worth doing:

- **`exercise_names` was silently truncated.** `GROUP_CONCAT(DISTINCT e.name)` ignores a custom separator
  (SQLite rejects a second argument alongside `DISTINCT`), so the query emitted comma-joined names while
  the mapper split on `'|'` — every session collapsed to one long pseudo-name. Fixed by moving the
  `DISTINCT` into a subquery so the two-argument `GROUP_CONCAT(name, '|')` can run outside it.
- **`total_volume` mixed lb and kg.** The SQL summed `reps * weight` raw while the detail screen's
  `setVolume()` normalises lb to kg — so a session logged in lb reported ~2.2× the volume of the same
  session's detail view. The SQL now applies the same conversion.

**In `summarise()` and `withinDays()`** (`src/domain/weight.ts`), found while extracting `dates.ts`: both
derived today with `Math.floor(nowMs / MS_PER_DAY)`, which answers in **UTC**, while the points they filter
were bucketed by **local** day. Off-UTC the window compared two different calendars and could shift by a
day. Both now call `todayNumber(nowMs)`. **Not caught earlier because the suite pins `TZ=UTC`, where the
two agree** — worth remembering before reading a green run as proof of timezone correctness.
