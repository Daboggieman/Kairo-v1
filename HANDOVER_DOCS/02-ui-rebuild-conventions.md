# The rebuild's conventions — follow these for the remaining screens

Each of these was decided once, on an early module. Re-deciding them per module is how the app ends up
looking assembled rather than designed. Stage 2 is complete, so they bind all five Stage 3 screens and
any return to one of the 22 already restyled. Stage 3 added its final screens on 2026-08-21.

## Structure

- **Every module `_layout.tsx` sets `headerShown: false`** and keeps
  `contentStyle: { backgroundColor: colors.background }` — that is what paints behind a push
  transition. Drop the `title` from each `Stack.Screen`; nothing renders it any more. Keep
  `presentation: 'modal'` where it is already set.
- **A tab root renders `ScreenHeader` as the first child of its `ScreenScroll`; a pushed or modal screen
  renders `AppBar`.** `AppBar` takes `onBack` for a push and **omits it for a modal** — the way out of a
  modal is its own dismiss, and a back chevron there claims a screen underneath that does not exist. A
  modal's escape is an `IconButton icon="close"` in the `AppBar`'s `action` slot.
  **Exception: `movement/active.tsx` keeps no back affordance at all.** It used to carry that intent as
  `headerBackVisible: false`, which had nothing left to hide once the native header went; the restyle
  moved it to **`gestureEnabled: false`** in `movement/_layout.tsx`. A recording is left by finishing it.
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
  it on a `loaded` flag set in the effect's `finally` (The Armory, The Call) or on `loading` (The Forge).
- **A fixed-width control laid out seven-across needs `flexShrink: 1`.** React Native's `flexShrink`
  defaults to **0**, unlike the web, so a row of seven 44pt `Chip shape="circle"` day toggles needs 308pt
  (332 with gaps) against the ~312–327pt a phone's screen margin leaves — and without the line the last
  one runs off the edge instead of the row tightening. Present in The Call and the New Rite; found in the
  New Rite *after* it shipped.
- **Which kind of route a new screen is — module folder, hidden tab, or root route — is decided in
  [`../docs/07-repo-structure.md`](../docs/07-repo-structure.md).** The short version: if leaving it
  should return the user where they were, it is a hidden tab (`href: null`); if it owns the whole surface,
  it is a root route under `app/`. A root route registers with `headerShown: false` and draws its own
  `AppBar`.
- **A screen that reads data another screen writes reads on focus, not on mount** —
  `useFocusEffect(useCallback(…))` with a `cancelled` flag, as The Citadel, The Rites and The Envoy do.
  Two reasons it is the convention and not a preference: the data is stale by the time anyone comes back
  to the tab, and a plain `useEffect` that calls a `useCallback` which sets state **fails the lint gate**
  even when every write is behind an `await`. The rule's exact behaviour is in
  [`08-verification.md`](08-verification.md#the-four-eslint-rules-that-bite). A one-shot pushed screen
  stays a plain effect (`tasks/[taskId].tsx`).
- **Panels inside a horizontal `ScrollView` take explicit width *and* height — never `flex: 1`.** The
  content container is a row, so `flex: 1` sizes a child along the *scroll* axis and collapses every page
  onto one. A percentage height is no better: against a container sized by its own children it resolves to
  nothing. The Gates sets both.
- **`pagingEnabled` snaps to the scroll view's own frame, not the window.** They differ in landscape on a
  notched phone, so a page width taken from `useWindowDimensions()` drifts one inset per swipe. Take it
  from `onLayout` — seeded from the window so the first frame is not zero-width — with an equality guard,
  because `onLayout` re-fires.


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
  thing to notice. **The Call does the opposite and both are right:** there, empty-means-daily is
  `reminderTriggers`' documented contract rather than a silent conversion, so the screen prints the
  resolved schedule (`describeRepeat([])` → "Every day") instead of refusing. The test is whether the
  domain already means it, not whether the two screens match.
- A cell the tracker never writes is dropped rather than rendered as a zero. See The Chronicle's CLIMB
  cell in [`04-movement-restyle-brief.md`](04-movement-restyle-brief.md).
- **A control that cannot control its thing is not rendered as a control.** The Gates shows the three OS
  permissions as informational rows with no checkboxes, because a grant cannot be revoked from inside the
  app — and each row reports what *this runtime* can actually do (`notificationsMode`, `IS_EXPO_GO`,
  `mediaLibraryAvailable`) rather than promising Expo Go a capability it lacks. The same rule retired The
  Envoy's "Forget Credentials" button: the device key is a build-time constant, so the button would have
  implied a stored secret the app could drop.
- **A figure with no source is dropped, not invented.** The Envoy lost its DELIVERED count because
  `markSucceeded` deletes the row it succeeded on, and its token-expiry row because no token outlives one
  sync. On a diagnostics screen especially, a plausible number is worse than a missing one.
- **A caption that states a threshold reads the constant.** The Envoy prints its retry cap from
  `MAX_BACKOFF_MS` (one hour) rather than repeating the design's "ten minutes", and
  `describeRetryPolicy` takes the value as an argument so the sentence and the behaviour cannot drift.
- **A degraded row is toned `warning`, never dimmed.** Dimming the row that carries the caveat hides the
  caveat — the readability failure this rebuild exists to fix.


The full per-module list of departures is in
[`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md) — read it before "fixing" anything that looks
wrong.

## Fold these in as each file is opened

These were an outstanding pass of their own from 2026-08-17, folded into the rebuild instead of run twice
over the same 13 files. **Items 1–3 are closed as of 2026-08-20**, when the last two Stage 2 screens were
opened. What remains — 4, 5, 6 — is standing guidance for Stage 3, not a backlog.

1. **The `.catch` → `<Notice tone="danger">` guard.** ~~Left to do.~~ **Done everywhere** as of
   2026-08-20: `index.tsx` (Citadel), `alarms.tsx`, `wallpaper.tsx`, and the whole tasks, workouts,
   macros, weight and movement modules. It was on this list because every screen loaded with an async
   IIFE and no `.catch`, which is why one dead SQLite connection printed ~57 unhandled rejections
   instead of one visible error. Keep the pattern for the Stage 3 screens: try/catch around the IIFE,
   `setError` in the catch, a danger `Notice` above the content.
   (`requestSync(db).catch(() => {})` calls are deliberate and unrelated — sync is best-effort.)
2. **Full-screen `ActivityIndicator` → `LogoLoader`.** ~~Left to do.~~ **Done** as of 2026-08-20 — both
   sites were `movement/[activityId].tsx` and `movement/active.tsx`. Keep `ActivityIndicator` inside
   `Button`, where it has to fit a 56px control; a full-screen wait is `LogoLoader`.
3. **The density pass** — `padding: spacing.lg` → `layout.screenPadding`, gaps → `layout.cardGap` /
   `layout.sectionGap`, `lineHeight` on body text. ~~Left: whatever `alarms.tsx` / `wallpaper.tsx` still
   carry.~~ **Done** as of 2026-08-20; those two were the last files carrying their own. Read the values
   from the theme, not from any list — the rebuild moved `layout` onto an 8px grid.
4. **Local colour constants → `chartColors`.** The macros module's `MACRO_COLORS` is done; check any
   screen that draws a series. Nothing in the 22 still holds one, so this is a rule for new screens.
5. **Adopt `Layout.tsx` primitives** wherever a screen's own container adds nothing. The Call was the
   last conversion — `CardHeader`, `Eyebrow`, `Chip`, `Fluting` and `IconButton` replaced bespoke styles
   and a direct `MaterialCommunityIcons` import.
6. **Re-run `npx tsc --noEmit` and `npm run lint` after every module, and `npm test` when a domain suite
   changed.** **Lint the whole tree, not the file you just wrote** — `app/(tabs)/envoy.tsx` shipped a
   `set-state-in-effect` error in `ox-08` because that pass linted only the other new file. **The pass
   mark is 0 errors.** TypeScript is clean now that every Stage 3 route file exists, so the three
   route-union errors that stood from 2026-08-21 are gone and any error you see is yours — history in
   [`08-verification.md`](08-verification.md).

Two things the tab bar does **not** need: `alarms` and `wallpaper` are already `href: null` with six
visible tabs, and both are reachable from The Citadel's Outer Ward rows. `envoy` joined them as a third
`href: null` tab in `ox-08`. No navigation restructure. The Pantheon and the Annals hang off that same
Outer Ward row group and **their rows are already in place** (`index.tsx:331`, `:336`); The Envoy
deliberately does not, and is reached from The Sanctum instead — see
[`01-current-state.md`](01-current-state.md#the-resume-point--continued-product-work).
