# Verification — the commands, their measured results, and the traps

The repo gate is **0 TypeScript errors, 0 ESLint errors, 0 ESLint warnings, 0 failing tests.** Everything
below states when it was last *measured*; treat an undated claim as an expectation.

Stage 3 is implemented and TypeScript is clean. The former three typed-route errors cleared when the
Pantheon, Annals and Sanctum route files landed.


## The commands

```sh
# Mobile — from apps/mobile
npm run typecheck              # tsc --noEmit
npm run lint                   # eslint .
npm test                       # jest (add -- --runInBand if a suite interferes)

# Mobile end-to-end — from apps/mobile, with the backend running
npm run test:e2e               # 5 passed; needs a live backend, see below

# Backend — from apps/backend
source .venv/bin/activate
ruff check .                   # All checks passed!
pytest -q                      # 35 passed
alembic upgrade head           # reaches head (idempotent)

# Native / packaging
EXPO_NO_TELEMETRY=1 npx expo-doctor
EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir /tmp/kairo-android-export
EXPO_NO_TELEMETRY=1 npx expo export --platform ios     --output-dir /tmp/kairo-ios-export
                               # telemetry disabled because the sandbox cannot write ~/.expo
```

## What was last measured, and when

| Check | Result | Measured |
|---|---|---|
| `npm test` | **554 passed, 24 suites, 0 failures** | **2026-08-22** |
| `npx tsc --noEmit` | **clean** | **2026-08-22** |
| `npm run lint` | clean, banner only | **2026-08-22** |
| `ruff check .` | All checks passed | **2026-08-22** |
| `pytest -q` | **35 passed** | **2026-08-22** |
| `alembic upgrade head` | reached `7e3b9a1c2d44` from an empty SQLite database | **2026-08-22** |
| `expo-doctor` | **20/21; dependency-version check failed for 9 one-patch-behind Expo packages** | **2026-08-22** |
| `expo export` android | **successful; 53 assets** (`/tmp/kairo-android-export`) | **2026-08-22** |
| `expo export` ios | **successful; 49 assets** (`/tmp/kairo-ios-export`) | **2026-08-22** |
| Physical-device acceptance | **user reported successful** | **2026-08-22** |
| `npm run test:e2e` | **5 passed** against a live backend on `127.0.0.1:8000` | **2026-08-22** |

### The end-to-end sync proof — `npm run test:e2e`, added 2026-08-22

`apps/mobile/e2e/workoutSetSync.e2e.ts` is the only check here that needs a **running backend**. It drives
`createSession` → `addSet` → `updateSet` → `deleteSet` through the real `syncOutbox`, and after each drain
it **reads the server back** — so it catches the class of bug a mocked `fetch` cannot: a path the client
builds correctly that the server routes nowhere, a field name off by an underscore, a status the outbox
misreads as terminal. Five cases: the create, the PATCH correction, the same correction twice, the DELETE,
and a re-delivered DELETE.

Three things about it worth knowing before running or extending it:

- **It is opt-in and outside `npm test`.** `package.json`'s `testMatch` covers only `.test.ts`/`.test.tsx`;
  the `test:e2e` script overrides `--testMatch` to `**/e2e/**/*.e2e.ts`. The suite must never depend on a
  server being up, which is why the file is not named `.test.ts`.
- **Credentials come from `apps/mobile/.env`**, the same values the app uses, unless `KAIRO_E2E_API_URL` /
  `KAIRO_E2E_DEVICE_KEY` are set. A `.env` pointing at a LAN IP is rewritten to `127.0.0.1` for this
  process, because that address is right for a phone and wrong for a backend bound to loopback.
- **It uses `node:http`, not `fetch`.** `jest-expo` replaces `globalThis.fetch` with Expo's native-backed
  implementation, which without the native module resolves to an object with no `status` and a falsy `ok` —
  measured against a healthy backend, in both the default and the `node` test environments, and `undici` is
  not in the tree. So the file adapts `node:http` behind the `Response` shape the client touches. It is a
  real socket, not a mock; what is substituted is the transport, not the contract.

**Start the backend first**, or the run fails with a message telling you to:
`source .venv/bin/activate && uvicorn app.main:app --host 127.0.0.1 --port 8000` from `apps/backend`.
Verify with `curl -s http://127.0.0.1:8000/health` — note the path is `/health`, **not**
`/api/v1/health`, which 404s.

**It writes to whichever backend it is pointed at.** Ids are fresh UUIDs per run so runs cannot collide,
and the set is removed by the case that proves deletion. The *session* row is left behind: there is no
`DELETE /api/v1/workouts/{id}`, and adding one so a test could tidy up would be the test dictating the API.
Point it at a development backend.

**A pass was confirmed against the server's own log**, not only against the assertions:
`PATCH …/sets/… 200` twice, `DELETE …/sets/… 204` twice — the second of each being the re-delivery, which
is the idempotency both route docstrings claim.


The 554/24 measurement **supersedes every earlier count in this handover** — 350/16, 376/18, 394/20, the
never-measured "426 expected", 481/20 from 2026-08-19, 494/20 from 2026-08-20, 534/24, and 538/24 taken
earlier on 2026-08-22. (The older docs recorded 534 under both 2026-08-21 and 2026-08-22 and were never
reconciled; it is superseded either way, so the disagreement was closed by deletion rather than by
picking one.)

**Where the +16 over 538 went, and the one case that is not accounted for.** Fifteen are the Annals
ledger: `domain/__tests__/annals.test.ts` went from **3 cases to 18**, verified against
`git show HEAD:apps/mobile/src/domain/__tests__/annals.test.ts`. The remaining **+1 is not attributable
to this pass** — four test files differ from `HEAD` in the working tree (`db/workouts.test.ts` +3,
`sync/sync.test.ts` +1, `store/workoutStore.test.ts` +2, `domain/annals.test.ts` +15, so `HEAD` itself
would measure 533), and the 538 figure cannot be reconciled against that without re-measuring a checkout.
**Treat 538 as superseded, not as explained.** It is recorded this way rather than quietly rounded because
the folder's own rule is that an unexplained count is how a fabricated one gets in.

The earlier +4 over 534 was the workout-set sync coverage: one `sync.test.ts` case asserting the PATCH
and DELETE replay, and three `db/workouts.test.ts` cases asserting what a correction enqueues. Suites
covered:
`db/{alarms,tasks,workouts,weight,macros,movement,outbox,maintenance}`, `store/workoutStore`, `sync/sync`,
and
`domain/{tasks,movement,macros,weight,workouts,dashboard,reminders,motivation,chart,dates,numbers,envoy,annals,pantheon}`.

**Backend went 28 → 35** in the same pass: seven cases covering the two new workout-set routes —
field-preserving PATCH, clearing RPE, PATCH idempotence, idempotent DELETE, cross-user isolation, a set
id under the wrong workout, and a missing set.

**Run time varies with cache state, not case count.** The same 24 suites have been measured at 10.6 s,
17.0 s and 60 s on the same machine within one day. A slow run is not a hang.

### Historical typed-route errors — all cleared

`app.json` sets `experiments.typedRoutes`, so expo-router generates its `Href` union from the route files
that **exist**. Through 2026-08-21 the Citadel pushed three routes whose files did not yet exist:

| Where | Route | Cleared by |
|---|---|---|
| `app/(tabs)/index.tsx:162` | `/sanctum` | `app/sanctum.tsx` |
| `app/(tabs)/index.tsx:331` | `/pantheon` | `app/pantheon.tsx` |
| `app/(tabs)/index.tsx:336` | `/annals` | `app/annals.tsx` |

All three were the same error — *not assignable to parameter of type `Href`* — and each cleared the moment
its screen file was created, with no change to the pushing code. That was first proven when `app/gates.tsx`
landed and both `/gates` errors disappeared the same way.

Kept here because the shape recurs: a `router.push` written before its screen is a **tsc error that fixes
itself**, so do not silence one with a cast. A route file should clear its own generated union entry. The
pass mark is 0 TypeScript errors, and it is currently met — any error you see now is yours.


**Division of labour:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `expo export` and `expo-doctor`
may be run here; the user explicitly requested the packaging checks on 2026-08-22. Physical-device
runs remain theirs. Never claim a device gate passed without their evidence.

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

`apps/backend/.venv` **exists** as of 2026-08-22 and the `pytest`/`ruff` figures above were measured
through it. It is untracked, so a fresh clone still needs the line above.

## The four ESLint rules that bite

This config is React-Compiler-era, and the gate is zero warnings, so all four are effectively errors:

- **`react-hooks/refs`** rejects `useRef(new Animated.Value(0)).current` — reading a ref during render.
  `Logo.tsx` has a local `useAnimatedValue()` (a `useState` with an initialiser) for exactly this; reuse it
  rather than reinventing it. It will hit any new animated component.
- **`react-hooks/set-state-in-effect`** rejects calling `setState` *synchronously* inside an effect. That is
  why `wallpaper.tsx` derives its status from a result tagged with its attempt number instead of storing a
  status and setting it to `'loading'` at the top of the fetch. Setting state **after an `await` is fine**.
  **Two things about it that cost a gate failure on 2026-08-21** (`app/(tabs)/envoy.tsx`, caught only
  because that pass linted the whole tree rather than the one new file): it **follows a direct call from an
  effect body into a `useCallback`** and flags the setStates it finds there, even when every one is behind
  an `await` — so `useEffect(() => { void load(); }, [load])` fails where the same `load` called from a
  handler passes. And **it does not treat `useFocusEffect` as an effect**, which is why
  `app/(tabs)/index.tsx` has always passed with the same shape. The house pattern is therefore
  `useFocusEffect(useCallback(() => { let cancelled = false; void load(() => !cancelled); return () => { cancelled = true; }; }, [load]))`
  — which is also the better behaviour for anything reading data another screen writes.
- **`react-hooks/preserve-manual-memoization`** cost **7 errors** in the macros module alone. The fix is not
  to satisfy it — it is to **drop the manual memo**: write `onPress={() => void onSave()}` rather than
  wrapping a handler in `useCallback` the compiler then objects to.
- **`react-hooks/purity`** rejects `Date.now()` in a render body — it is an impure read, so a component
  that derives "now" while rendering fails the gate. The house fix, used by the movement and weight
  modules: seed it once with `useState(() => Date.now())`, then call `setNowMs(Date.now())` inside the
  focus effect **after an `await`** (which `set-state-in-effect` allows). The same applies to
  `Math.random()` and `new Date()` with no argument.

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
