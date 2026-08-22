# The module pattern, and repo hygiene

## Pattern for future modules

Five modules have taken the same shape. Copy it.

1. **Migration** — append to `MIGRATIONS` in `src/db/migrations.ts` and bump `SCHEMA_VERSION` in
   `src/db/schema.ts`. **Never edit an existing entry**: installs in the wild have already run it. v1
   workouts, v2 weight (`body_weight_entries`, `user_preferences`), v3 tasks (`tasks`,
   `task_completions`), v4 macros (`food_items`, `nutrition_entries`, `macro_targets`), v5–v6 reminders,
   v7–v9 movement.
2. **Types** — a row type and a domain type in `src/db/types.ts` plus a `to*` mapper. The split is what
   keeps `snake_case` SQL out of the screens. **Don't add a join type speculatively** — the tasks pass
   deleted a `TaskWithCompletion` that no query ended up wanting.
3. **Domain** — pure functions in `src/domain/<module>.ts`, no `db` and no React import, and `nowMs` always
   **injected** rather than read. That is the whole testability seam; anything interesting should be
   reachable from here. Use `src/domain/dates.ts` for day math instead of dividing by `86_400_000`. Since
   the rebuild, **the module's display wording belongs here too** — see
   [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md).
4. **Queries** — `src/db/<module>.ts`, one function per query, plus a `__tests__/` suite using
   `createTestDb()`. Include a **migration test that upgrades a database holding the previous modules'
   rows**, which is what a real install does on update — the tasks one seeds both a workout and a weight
   row, rewinds `user_version`, re-migrates, and asserts both survive. Finish with one integration case
   that feeds real query output through the domain layer, so a disagreement between the two shows up in CI
   rather than on a phone.
5. **Screens** — `app/(tabs)/<module>/`, reloading with `useFocusEffect` rather than on mount so a modal
   dismissal shows the row just written. **Refresh `nowMs` in the same load as the data.** Add the tab in
   `app/(tabs)/_layout.tsx` and a card in `app/(tabs)/index.tsx`.

### Mistakes earlier modules' tests deliberately guard

- **`ORDER BY … ASC LIMIT n` returns the oldest n.** For a chart you want the newest n, *then* sorted
  ascending — otherwise a user with years of history sees their first few entries and nothing since.
  `listEntriesAscending` does the limit in a subquery.
- **A rolling average must window by date, not by sample count.** Three weigh-ins in July and one in August
  would otherwise report a "7-day average" spanning six weeks.
- **Never derive "today" from `nowMs / MS_PER_DAY`** if the data was bucketed locally. See the `summarise`
  bug in [`08-verification.md`](08-verification.md).
- **Don't bound a per-entity history query with a row `LIMIT`.** It starves whichever entities sort last and
  reports them as empty, which is indistinguishable from data loss. Bound by date.

---

## Repo hygiene

### Open item: `apps/backend/.env` is tracked, with real secrets in history

Verified **2026-08-19**, and it needs the user's decision rather than a quiet fix.

- `git ls-files` lists **`apps/backend/.env`** as tracked, alongside the two `.env.example` files that are
  meant to be.
- It has been committed twice: `f3c6618` (*"start organic test for phase 2 & 3"*) and **`369531c`**
  (`ox-06`, 2026-08-19).
- Its key set matches `.env.example`, but **`DEVICE_KEY` and `JWT_SECRET` hold non-example values.** Real
  secrets are therefore in git history, not just in the working tree.
- **Root cause:** `.gitignore`'s "Environment / secrets" block carries the comment *"real .env files are
  never committed"* and the `!.env.example` negation — but **no `.env` pattern at all**. There has never
  been a rule for git to apply. The comment describes an intention that was never implemented.

**The remedy, in order — do not start it without asking:**

1. Add a real pattern (`.env` and/or `*.env`) to `.gitignore`, above the `!.env.example` negation.
2. `git rm --cached apps/backend/.env` — keeps the file on disk, stops tracking it.
3. **Rotate `DEVICE_KEY` and `JWT_SECRET`.** This is the part that makes it the user's call: the values are
   in two commits that have been pushed, so removing the file from HEAD does not un-publish them. Rotation
   invalidates every issued token, which is a decision about a running system.

Step 3 is why this is written down rather than done. Steps 1 and 2 alone would look like a fix while
leaving the secrets readable in history.

### Everything else

- **`.gitignore` is otherwise intentionally as-is.** It covers `.claude/`, `*.db` / `*.db-shm` / `*.db-wal`,
  `node_modules/`, `.venv/`, `dist/` and `*.jks`.
- **`apps/backend/kairo.db` had been committed by mistake.** It was untracked with `git rm --cached` (file
  kept on disk) and `*.db` / `*.db-shm` / `*.db-wal` added to `.gitignore`. It held only the Alembic version
  row and empty tables, so nothing was lost. Recreate with `alembic upgrade head`.
- **`.claude/` at the repo root is machine-local tool config** holding settings from other projects in this
  workspace. It was staged accidentally by a `git add` once, unstaged before committing, and is now
  gitignored so it cannot happen again.
- `kairo_backend.egg-info/` and `.venv/` are untracked, which is correct. **`.venv` exists** as of
  2026-08-22 and the current Ruff and `pytest` figures were measured through it; a fresh clone still
  recreates it.
- **`expo` had been floating on `"latest"`** in `apps/mobile/package.json` and is now pinned to the SDK 57
  range like everything else. Expo-managed packages use a **tilde** range by convention here;
  `react-native-svg` went in with a caret and was corrected.
- **`expo-doctor` drifts to 19/20 on its own** as the SDK publishes patch releases — the four packages it
  flagged were upstream, not local. `npx expo install --fix` is the remedy, run **from `apps/mobile`** (from
  the repo root, `npx` bootstraps a throwaway `expo` instead of using the local one). It cannot take
  `--check` and `--fix` together. On a slow link it can die mid-install and leave `package-lock.json`
  half-rewritten; a plain `npm install` afterwards reconciles it.
- **The Android `dist/` directory is a generated, ignored build artifact** — never part of a source commit.

### Committing

**Do not create or amend commits unless the user asks** — including not staging, and not tidying the index.
The user commits and pushes outside these sessions, which is why every commit list in this folder is dated
and every reader is told to re-check with `git status --short --branch`.
