# The rebuild's conventions — follow these for the remaining screens

Each of these was decided once, on an early module. Re-deciding them per module is how the app ends up
looking assembled rather than designed. They are binding on the seven screens left in Stage 2 and on
Stage 3's five new ones.

## Structure

- **Every module `_layout.tsx` sets `headerShown: false`** and keeps
  `contentStyle: { backgroundColor: colors.background }` — that is what paints behind a push
  transition. Drop the `title` from each `Stack.Screen`; nothing renders it any more. Keep
  `presentation: 'modal'` where it is already set.
- **A tab root renders `ScreenHeader` as the first child of its `ScreenScroll`; a pushed or modal screen
  renders `AppBar`.** `AppBar` takes `onBack` for a push and **omits it for a modal** — the way out of a
  modal is its own dismiss, and a back chevron there claims a screen underneath that does not exist. A
  modal's escape is an `IconButton icon="close"` in the `AppBar`'s `action` slot.
  **Exception: `movement/active.tsx` keeps no back affordance at all** — it sets
  `headerBackVisible: false` deliberately today, and that must survive the restyle.
- **One action per tab root, as an outlined `IconButton` in `ScreenHeader`'s `action` slot.** The
  designs' docked full-width footer button is dropped: a 56pt slab above an 80pt tab bar was eating a
  fifth of the screen. Where a screen needs a second destination, it becomes a `NavRow` in the content —
  the move The Scales made for The Vow, and the reason dropping the footer is safe rather than lossy.
- **A tab root uses `FlatList` only when its list has no natural ceiling** — The Forge's session log, The
  Scales' weight log. Everything else stays inside `ScreenScroll`. A `FlatList` screen must read
  `useSafeAreaInsets` itself and add `insets.bottom + layout.scrollFooter` to its
  `contentContainerStyle`, because it is not inside the component that would have owned that inset; a
  screen inside `ScreenScroll` must **not** read insets, or it pays them twice.
- **Aggregate strips render only when there is something to aggregate.** Three zeroes above an empty list
  is chrome describing nothing.
- **A list screen whose data starts `[]` flashes its `EmptyState` before the first query resolves.** Gate
  it on a `loaded` flag set in the effect's `finally` (The Armory) or on `loading` (The Forge).

## Meaning

- **Three surfaces, three meanings — settled across the macros and weight modules.**
  - An **accent-soft `Card` with an accent `CardHeader`** is a *computed read-back* of what the user
    typed or logged: The Decree's calorie total, The Vow's projection.
  - A **`Notice`** means something is *degraded* — a failed query, a rule that cannot hold.
  - An **accent left rule** on accent-soft means *"the one thing in play"*. It belongs to The Anvil's
    active-lift card and to The Expedition's live-recording card, and to nothing else. (This wording was
    widened from "The Anvil only" when the movement analysis showed an in-progress journey carries the
    identical semantic. It is not an invitation to widen it again.)

  Picking the wrong one is how a reading starts looking like an error.
- **`Meander` is drawn at its default 14px.** The motif is a repeating Greek key whose turns close up
  below ~12px, at which point it is a gold `Divider` with extra render cost.
- **Wording that is tested lives in the domain layer, not at the call site.** Four screens end up saying
  the same three things about the same figures, and a phrase written four times ends up worded three
  ways. The chain so far: `formatProgress`/`formatStreak` (`tasks.ts`) →
  `formatTonnage`/`formatForgeTotals`/`formatAnvilSummary` (`workouts.ts`) → the Feast lexicon
  (`macros.ts`) → the Scales lexicon (`weight.ts`). Movement is the fifth link.
- **A formatted figure has exactly one formatter.** `formatWeight` puts a space before the unit and
  `formatDelta` was changed to match, app-wide — two figures side by side in one `StatStrip` cannot
  disagree about it. If a new screen prints a weight, call `formatWeight`; do not re-concatenate.

## Where the design and the app's data disagree

**The tested domain wins, and the deviation gets a comment in the file that makes it.** Precedents, all
from screens already shipped:

- The Flame's heatmap day labels stay Sunday-first because `dayOfWeek` is `getDay()` order — re-basing a
  tested grid to match a label column is the wrong trade.
- The New Rite drops the design's "OR / Every N days" numeric field: nothing in the app creates an
  `interval:` rule, and two live ways to express one cadence with no apply step leaves "which wins" to be
  inferred.
- The New Rite's *"Selecting no day repeats every day"* hint was rejected in favour of refusing to save an
  empty custom selection — a sheet that silently converts your choice into a different rule is the harder
  thing to notice.
- A cell the tracker never writes is dropped rather than rendered as a zero. See The Chronicle's CLIMB
  cell in [`04-movement-restyle-brief.md`](04-movement-restyle-brief.md).

The full per-module list of departures is in
[`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md) — read it before "fixing" anything that looks
wrong.

## Fold these in as each file is opened

These were an outstanding pass of their own from 2026-08-17. They are **not** a separate sweep any more:
every one of these files is being opened for the rebuild anyway, and a second pass over the same 13 files
would be wasted work. Keep ticking them off.

1. **The `.catch` → `<Notice tone="danger">` guard.** Every screen loaded with an async IIFE and no
   `.catch`, which is why one dead SQLite connection printed ~57 unhandled rejections instead of one
   visible error. Done: `index.tsx` (Citadel), `alarms.tsx`, `wallpaper.tsx`, the whole tasks module, the
   whole workouts module, the whole macros module, the whole weight module. **Left:**
   `movement/index.tsx`, `movement/active.tsx`, `movement/settings.tsx`, `movement/replay.tsx`,
   `movement/[activityId].tsx`.
   (`requestSync(db).catch(() => {})` calls are deliberate and unrelated — sync is best-effort.)
2. **Full-screen `ActivityIndicator` → `LogoLoader`**, in `movement/[activityId].tsx` and
   `movement/active.tsx`. Keep `ActivityIndicator` inside `Button`, where it has to fit a 56px control.
   The old line numbers predate the rebuild — re-grep rather than trusting them.
3. **The density pass** on any screen still setting its own: `padding: spacing.lg` →
   `layout.screenPadding`, gaps → `layout.cardGap` / `layout.sectionGap`, and `lineHeight` on body text.
   **Left:** `movement/new.tsx`, `movement/settings.tsx`, and whatever `alarms.tsx` / `wallpaper.tsx`
   still carry. Read the values from the theme, not from any list — the rebuild moved `layout` onto an
   8px grid.
4. **Local colour constants → `chartColors`.** The macros module's `MACRO_COLORS` is done; check any
   screen that draws a series.
5. **Adopt `Layout.tsx` primitives** wherever a screen's own container adds nothing.
6. **Re-run `npx tsc --noEmit` and `npm run lint` after every module, and `npm test` when a domain suite
   changed.**

Two things the tab bar does **not** need: `alarms` and `wallpaper` are already `href: null` with six
visible tabs, and both are reachable from The Citadel's Outer Ward rows. No navigation restructure. (The
rebuild hangs the Pantheon and the Annals off that same row group.)
