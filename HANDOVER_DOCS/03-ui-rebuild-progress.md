# The rebuild so far — what landed, and the departures that are deliberate

Stages 0, 1 and 2 are complete — **22 of 22 screens** — and Stage 3 is complete — **5 of 5 screens**.
Every "departure from the design" below is commented in the file that makes it. **Do not
"fix" them** — each one is a decision about the app's real data, and several were made twice because the
first record of them was too thin to trust.

Verified after Stage 3 completion, the workout-polish sync fix and the Annals ledger on **2026-08-22**:
`npm test` **554 passed across 24 suites**, `npx tsc --noEmit` clean, and `npm run lint` clean. Device evidence is
**user-reported**, not measured here — see
[`01-current-state.md`](01-current-state.md#verification--measured-2026-08-22), which owns that claim.

---

## Stage 0 — foundations

- **`src/theme/index.ts`** (223 lines): `colors.border` `#2A2F38` → **`#504535`** (the one colour the
  designs contribute); `layout` on the 8px grid (`screenPadding` 24, `sectionGap` 24, `cardPadding` 16,
  `cardGap` 16, `rowPadding` 16, `scrollFooter` 40); `fontSize.xxl = 40` / `lineHeight.xxl = 48`; and the
  new **`type`** export with six roles — `displayLg`, `displayMd`, `headlineSm` (the three Cinzel ones),
  `eyebrow`, `label`, `timer`.
  - Screens import it aliased — `import { type as typeScale } from '@/theme'` — and should keep doing so:
    a bare `type` in an import list reads as TypeScript's type-only import modifier, so the alias is what
    keeps the line unambiguous to both the compiler and the reader.
  - **`type` is declared `satisfies Record<string, TextStyle>`, not `as const`.** This will be re-broken
    by anyone who "tidies" it: `as const` freezes `fontVariant` as a *readonly* tuple, which
    `StyleSheet.create` will not accept, and the error surfaces at the call site rather than here.
    `satisfies` also checks every role against what React Native really takes, so a typo in `fontWeight`
    or `fontVariant` fails in the theme file.
- **Cinzel is installed and loading.** `@expo-google-fonts/cinzel ^0.4.2` is in
  `apps/mobile/package.json`. `app/_layout.tsx` calls `useFonts({ Cinzel_600SemiBold, Cinzel_700Bold })`
  above the provider and gates first paint on `fontsLoaded || fontError !== null` behind the same
  `AppLoader` as the SQLite migration. A **font error is deliberately not fatal** — it degrades to the
  platform serif rather than hanging on a loader forever. (Which is also why Cinzel has to be confirmed
  on a device: absent, it looks like a slightly wrong serif, not an error.)
- **`src/components/Layout.tsx` is ~1050 lines and owns 25 exports.** This is the file to read before
  writing any screen; nothing below should be rebuilt per-screen:

  `Screen` · `ScreenScroll` · `ScreenHeader` (tab roots) · `AppBar` (pushed/modal screens) · `Eyebrow` ·
  `Section` · `Card` · `CardHeader` · `CardAction` · `RowGroup` · `NavRow` · `Notice` · `EmptyState` ·
  `IconButton` · `StatStrip` · `Pill` · `Chip` · `Field` · `Divider` · `Stat` · `StatCard` · `Timer` ·
  `ProgressBar` · `Meander` · `Fluting`

  The contracts worth not re-deriving:
  - `ScreenScroll` owns the `insets.bottom + layout.scrollFooter` footer inset, so a screen inside it must
    **not** also read `useSafeAreaInsets`.
  - `RowGroup` draws the rules between its children, so its rows must not carry their own
    `borderBottomWidth`; it takes a `style` prop for group-level dimming.
  - `StatStrip` takes `size?: 'md' | 'lg'`, a per-item `progress?: number` that draws a bar pinned to the
    bottom of that cell, and `bare` — which drops its own `Card` so the grid can nest inside one.
  - `Chip` takes `role?: 'radio' | 'checkbox'`, which picks the accessibility contract (`selected` vs
    `checked`) so a screen cannot pair them wrongly, and `shape?: 'block' | 'circle'`.
  - `Pill` takes `tone?: 'accent' | 'danger' | 'muted' | 'success'`; its border is always `colors.border`
    because the designs draw it as the tone colour at 30% alpha, which would mean inventing four rgba
    values.
  - `IconButton` is 44pt; `TAP_TARGET` (56) is the floor for anything a thumb aims at during a set.
  - `Fluting` stretches to its parent's height, so the parent must have one.
- `Button`: labels are uppercase + `type.label`, and **`danger` is outlined** (transparent fill).
  `Checkbox`: `SIZE = 28`. `Logo`: `KairoWordmark` is `Cinzel_700Bold` with its optical-centring
  `paddingLeft` re-measured.

## Stage 1 — the shell

`app/(tabs)/_layout.tsx` keeps six visible tabs plus `href: null` on `alarms`/`wallpaper`, labelled
`CITADEL · RITES · FORGE · FEAST · SCALES · MOVE` at 10px/700/1pt tracking.

- The bar is `TAB_BAR_HEIGHT = 80` **plus `insets.bottom` added by hand** — with an explicit `height` the
  navigator treats it as the whole bar and still pads by the inset, which left 46 points of usable bar.
- The 2pt active accent rule is an absolutely-positioned `View`, not a `borderTopWidth`, which would add
  height to the active tab and jog the icons on every switch.
- A local `TabButton` replaces the default (which packs icon and label to the top of an 80pt item). Its
  props type is declared **structurally** rather than imported, because `BottomTabBarButtonProps` lives
  inside expo-router's vendored react-navigation. `aria-selected` is the only source of focus state for a
  replaced button.

---

## Stage 2 — The Citadel and the tasks module

`app/(tabs)/index.tsx` — **The Citadel**: fluted header with `KairoMark` + wordmark on
`colors.background` (never a card), a `Meander` under it, four `DashboardCard`s named The Rites / The
Feast / The Scales / The Forge, and a `Section title="The Outer Ward"` `RowGroup` holding The Oracle and
The Call.

| File | Lines | Screen |
|---|---|---|
| `app/(tabs)/tasks/_layout.tsx` | 28 | `headerShown: false`; `new` stays `presentation: 'modal'` |
| `app/(tabs)/tasks/index.tsx` | 357 | The Rites |
| `app/(tabs)/tasks/new.tsx` | 168 | The New Rite |
| `app/(tabs)/tasks/[taskId].tsx` | 364 | The Flame |

`src/domain/tasks.ts` gained the module's wording: `formatProgress` returns `"3 of 4 kept"` /
`"nothing due"`, `formatStreak` a bare number or `''`. First link in the domain-vocabulary chain.

**Four visual decisions that look like mistakes and are not:**

- The Flame's history window went from 8 weeks to **13** — a quarter, rounded to whole weeks because the
  grid is week-aligned.
- Its heatmap **scrolls horizontally** rather than shrinking its cells. Thirteen 14pt columns fit a modern
  phone and not a small one, and squares that shrink to fit stop being readable before they stop being
  drawable.
- A missed day is **tinted red** rather than left empty: the point of a quarter of history is seeing where
  it broke, and an empty square looks identical to a day off.
- The cell `borderRadius` is a literal **2**, not `radius.sm` — at 14 points the smallest token in the
  scale (8) rounds the square into a circle.

And on The Rites, the "not due today" and archived groups dim at the **`RowGroup`** level, not per row,
because the rules between rows are drawn by the group and fading one row makes the rules look misaligned.

## Stage 2 — the workouts module

All five files rewritten.

| File | Screen |
|---|---|
| `app/(tabs)/workouts/_layout.tsx` | `headerShown: false`; `exercises` is `presentation: 'modal'` |
| `app/(tabs)/workouts/index.tsx` | The Forge |
| `app/(tabs)/workouts/active.tsx` | The Anvil |
| `app/(tabs)/workouts/exercises.tsx` | The Armory |
| `app/(tabs)/workouts/[sessionId].tsx` | The Stele |

**`src/domain/workouts.ts` gained the module's vocabulary** — `formatTonnage`, `totalTonnage`,
`formatForgeTotals`, `formatAnvilSummary`, plus a private `count()` pluraliser. `formatTonnage` always
reports kg because `setVolume` normalises through `toKg`. **Its tests compare against
`n.toLocaleString()`, not a literal `"5,240"`** — `jest.globalSetup.js` pins `TZ` only, never the locale,
so a hard-coded grouping separator is a test that passes on this machine and fails on a French one.

**Three shared primitives changed, app-wide on purpose:**

- **`Section` now draws a trailing hairline** after its title (`flex: 1`, so it stops at the `action` if
  there is one). The designs give each module a different section ornament — a trailing rule on The Forge,
  a left accent rule on The Anvil and The Stele. Unified in the primitive so eight modules cannot arrive
  at eight rules.
- **`StatStrip` takes `bare`** — drops its own `Card` and its cells' vertical padding, so the grid can sit
  *inside* a card that already owns the surface, and so four figures can be two stacked strips with a
  `Divider` between them. Its value `Text` is deliberately **not** `numberOfLines={1}
  adjustsFontSizeToFit`: that prop is iOS-only, and three cells across a phone leaves ~82pt each, which
  "5,240 kg" does not fit — so Android would clip to "5,240…". Wrapping at the space is the correct
  failure.
- **`CardHeader` takes `tone`**, forwarded to its `Eyebrow`.

`SessionElapsed` gained `prefix` and `style` (and tabular figures) so it can serve as both the Forge
card's *"In progress · 24m 10s"* and the Anvil's app-bar clock. `RestTimer` was rebuilt as **The
Breath**: a full-bleed `colors.surface` band with a bottom border and the progress rule flush to that
edge, so the band reads as chrome continuous with the app bar. Its idle `—` mirrors `Timer`'s metrics so
the band does not change height when the first set is logged.

**Departures:**

- **The Forge's kindle `+` shows only when no session is open** — `startSession` returns the existing id
  rather than creating a second session, so a `+` beside a live session would be a control that lies.
- **The Anvil keeps the kg/lb toggle and drops the +/− steppers.** The design hardcodes "WEIGHT (KG)";
  the unit is real data (`suggestNextSet` returns the unit the lift was last logged in), so a screen that
  cannot change it silently records pounds as kilograms.
- **The Anvil drops "Add another lift."** In this data model it and the card's own "Change" are one
  function — `selectExercise`.
- **The Anvil's set rows carry the estimated 1RM plus recorded RPE when entered; The Stele's carry RPE
  and/or rest.** RPE is optional and persisted with each set.
- **The Armory drops the muscle-group filter chips.** `seed.ts` stores **eleven** raw groups, not the
  design's six, and a custom lift has `muscleGroup: null` — mapping ours onto theirs is a taxonomy
  decision hiding inside a UI pass, on a library of thirty rows the search box already filters. It also
  drops the per-row last-time, which is thirty queries on open; The Anvil prints it for the lift you
  actually picked.
- **The Stele lays its four figures out 2×2, not 1×4.** `5.9_the_stele` is a `max-w-4xl` desktop layout;
  four display numbers across a phone gives each ~80pt.
- **Set corrections are available inline in The Anvil.** Editing preserves the recorded rest interval;
  deletion confirms and queues a durable sync delete. The Stele remains a read-only historical view.

## Stage 2 — the macros module

All four files rewritten.

| File | Screen |
|---|---|
| `app/(tabs)/macros/_layout.tsx` | `headerShown: false`; `add` and `targets` are `presentation: 'modal'` |
| `app/(tabs)/macros/index.tsx` | The Feast |
| `app/(tabs)/macros/add.tsx` | The Offering |
| `app/(tabs)/macros/targets.tsx` | The Decree |

**`src/domain/macros.ts` gained the module's vocabulary**, the third link in the chain: `MACRO_LABELS`
(Caloric Forge / Protein Den / Granary / Fat Pool), `MEAL_PLAIN_LABELS` and `formatMealHeading` ("Dawn
(Breakfast)"), `formatMacroSplit`, `describeFood`, `describeEntry`, `formatStore`, `formatRemaining`,
`caloriesFromMacros`, `checkDecree`. `MEAL_LABELS` now holds the Greek names. **`MealType` is
untouched** — the column, the type and the queries stay `breakfast | lunch | dinner | snack`; only the
display string is the theme.

`src/domain/dates.ts` gained **`relativeDayLabel(day, today)`** — `'Today'`, `'Yesterday'` or `null`. It
lives there, not in `macros.ts`, because it is about days and The Scales needed it next. It decides only
the two words: spelling the date out is `toLocaleDateString`'s job at the call site, and pulling that into
the domain would make every assertion about it a test of the machine's locale.

**`nutritionFor` now takes `PerServing`** — `Pick<FoodItem, 'caloriesPerServing' | 'proteinG' | 'carbsG' |
'fatG'>` — instead of a whole `FoodItem`. Every existing caller still satisfies it. The Offering needs to
price a food that has no row yet (the one being forged, whose figures are in the form), and doing that
with a `FoodItem` meant inventing an `id: ''` and an empty `createdAt`: a value that reads like a saved
food and is not one.

**Departures:**

- **The Feast's day chevrons are their own ruled strip, not the header.** `5.10_the_feast` flanks the title
  with a chevron either side; `ScreenHeader` has one action slot and the screen's action is adding an
  offering. The strip is also the only arrangement where the date has room to be spelled out ("Today ·
  Monday 18 August"). Forward is disabled at today.
- **An empty meal is not drawn.** `groupByMeal` still returns all four so a caller *can* offer a per-meal
  add; The Feast filters to the non-empty ones. Four titled empty cards is furniture, and The Offering
  picks its own meal (defaulting by the hour), so nothing is unreachable.
- **No per-meal add** — neither has the design; that was invented in an earlier plan reading.
- **The Four Stores card is pressable as a whole and leads to The Decree.** The card is a reading of
  progress *against* the decree, so the decree is the honest target, and it avoids a second header action.
- **`MACRO_LABELS` drops "The" from all four names.** `5.10_the_feast` writes two of them with a leading
  "THE" and two without; they are read as a column of labels, where an article on half reads as a mistake.
- **The Offering has no +/− steppers.** The design has steppers *and* quick chips, and the chips (0.5 / 1 /
  1.5 / 2) are the stepper; the field takes anything else. Its search box also drops the magnify glyph
  inside the input — `Field` has no icon slot.
- **The tribute total is one display figure plus a bare 3-cell strip, not a row of four** — the same
  ~80pt-per-cell arithmetic as The Stele's hero.
- **The Decree puts its units in the labels** ("Granary (g)"): `Field` has no suffix slot, and the label is
  what a screen reader says. Its derived-calories read-out is an `accentSoft` `Card`, not a `Notice` —
  nothing has gone wrong, it is a reading of what you typed.
- **The Decree drops the design's "Change" button on the effective date.** There is no date picker in the
  app and future-dating a decree is a feature, not a restyle; the row states the date instead.
- **Neither modal has a Cancel button.** The bar's close glyph is the way out.

**`checkDecree` is the one place the transcription went past the design.** `5.12_the_decree` prints the
macros' own calorie total as a line of text and leaves the subtraction to the reader. It is the only thing
on that screen that can tell you a decree is internally impossible *before* you spend a week failing to
hit it, so the gap is named — with a **50 kcal tolerance**, because the Atwater factors are themselves
rounded and every correctly-written decree lands a few tens of kilocalories off its own total.

## Stage 2 — the weight module

All four files rewritten.

| File | Screen |
|---|---|
| `app/(tabs)/weight/_layout.tsx` | `headerShown: false`; `log` and `goal` are `presentation: 'modal'` |
| `app/(tabs)/weight/index.tsx` | The Scales |
| `app/(tabs)/weight/log.tsx` | The Weighing |
| `app/(tabs)/weight/goal.tsx` | The Vow |

**`src/domain/weight.ts` gained the module's vocabulary**, the fourth link: `formatWeight`, `weighings`
(+ the `Weighing` type), `weeklyRateKg`, `formatVowGap`, `describeVow`. The lexicon the module writes in:
a weigh-in is a **weighing**, the smoothed line is the **trend**, a goal weight is a **vow**.

- **`weighings` is deliberately not `dailyWeights`.** The chart wants one point a day; the log wants every
  time you actually stood on the scale, newest first, each row's delta measured against the *previous
  weighing* — including one outside the visible range, so changing the range never silently changes a
  delta. It carries `day` so `withinDays` can window the log with the same tested cutoff as the chart.
- **`weeklyRateKg` returns `null` rather than a slope it cannot justify**: fewer than two trend points in
  the period, or a span under seven days. A rate from two days multiplied by seven is a month's forecast
  built from a hydration swing.
- **`describeVow` owns every sentence The Vow says**, including the four refusals — no rate yet, a flat
  trend, a trend moving *away* from the vow, and past a year. It says "about 7 weeks" where `5.15_the_vow`
  writes "seven weeks": the app writes figures as digits everywhere else.
- **`formatVowGap` says "2.8 kg to lose" / "2.0 kg to gain"**, not the design's "2.8 kg to go" — which
  direction is meant is the one thing a gap figure cannot convey on its own.

**`formatDelta` now puts a space before the unit — and that rule is app-wide.** The designs write "74.8
kg"; the app had been writing "74.8kg". `formatWeight` was written spaced, `formatDelta` was changed to
match, the **four affected assertions in `weight.test.ts` were updated**, and `app/(tabs)/index.tsx`
switched from `{toDisplayWeight(...)}{unit}` to `formatWeight(...)`. A grep of the other domain suites
confirmed none of them assert a formatted weight string.

**`StatStrip` gained a `success` tone** (additive; `text` | `accent` | `danger` | `success`) — for a figure
that is good news *in its own terms*, like a loss on a cut.

**Departures:**

- **The Scales' vow is a `NavRow`, not the third stat cell.** `5.13_the_scales`' third cell carries a value
  *and* a caption ("2.8 kg to go"), which `StatStrip` has no slot for, and three display figures across a
  phone leaves each ~82pt. As a row it also becomes the way *into* The Vow, which is what makes dropping
  the design's docked footer safe.
- **The range moves the chart *and* the log.** The design scopes it to the chart. Windowing the log too is
  what makes "30 D" mean anything on a screen whose list is the taller half, and it costs no new query and
  no new data path — `withinDays` is already tested. The trend is smoothed across the **full** history and
  windowed afterwards, so the leftmost visible point carries a complete 7-day window rather than
  restarting from a partial one at the range edge.
- **The 30-day change cell stays 30 days at every range.** The design labels that cell "30 DAYS" under a
  header reading "Last 90 days", and it is right to: the range moves the view, not the yardstick.
- **No month ticks and no in-chart vow label.** `LineChart` draws neither; an x axis is a chart feature,
  not a restyle. The legend names the dashed line instead.
- **Green for down, red for up assumes a cut** — every weight app assumes it and none of them say so.
  Localised in one commented `changeTone` helper in `weight/index.tsx` (`FLAT_KG = 0.05`), the single place
  that has to learn about direction when the vow eventually carries one.
- **The Weighing's kg/lb toggle sits *under* the number, not beside it.** A `Chip` is a 56pt target; two
  stacked beside a 56pt digit is 120pt of column next to a 70pt figure. Full width underneath is The
  Anvil's arrangement for the same control.
- **The Vow's insight block has no left rule**, per the three-surfaces convention.
- **No icons on The Vow's buttons** — `Button` has no icon slot, and adding one for two buttons on one
  screen is a component change in service of decoration.
- **Neither modal has a Cancel button**, and neither states a "Change" button on its date/time row — there
  is no picker in the app and back-dating is a feature, not a restyle.

**Two decisions worth not re-deciding:**

- **The Weighing records `openedAt`, the instant the sheet opened, not the instant Save was pressed.** Both
  reasons agree: it is the honest measurement time (you stepped on the scale before you typed the note),
  and it is what lets the "Recorded — Today · 07:12" row promise a time without lying. `new Date()` in a
  render body would be impure, and a sheet left open an hour would then record an hour it never measured.
  The Scales and The Vow capture `nowMs` the same way, in state at load — `useNow` is the wrong tool for a
  90-day window that only moves on refocus.
- **A vow is device-local on purpose.** `user_preferences` has no entity type in `src/sync/outbox.ts`, so
  `requestSync` in The Vow would be a no-op that reads like a promise. This **reverses** an earlier note
  calling the missing `requestSync` a bug — it is not one. A weighing syncs; the line you drew on your own
  chart does not, yet.

---

## Stage 2 — the movement module

All seven files rewritten, 2026-08-20. Decided in
[`04-movement-restyle-brief.md`](04-movement-restyle-brief.md); what follows is what was actually built.

| File | Screen |
|---|---|
| `app/(tabs)/movement/_layout.tsx` | `headerShown: false`; `new` is `presentation: 'modal'`; `active` is `gestureEnabled: false` |
| `app/(tabs)/movement/index.tsx` | The Expedition |
| `app/(tabs)/movement/new.tsx` | The Threshold |
| `app/(tabs)/movement/active.tsx` | The March |
| `app/(tabs)/movement/[activityId].tsx` | The Chronicle |
| `app/(tabs)/movement/replay.tsx` | The Retelling |
| `app/(tabs)/movement/settings.tsx` | The Compass |

**`src/domain/movement.ts` gained the module's vocabulary**, the fifth link in the chain that starts at
`formatProgress`: `MOVEMENT_LABELS`, `movementPerformance`, `splits` (+ `MIN_SPLIT_METERS`, the `Split`
and `SplitPoint` types), `describeMovementEvent`, `movementWeek` (+ `MovementWeek`,
`MovementWeekActivity`), `formatExpeditionTotals`, `heldSeconds`. Thirteen `it` blocks added to
`src/domain/__tests__/movement.test.ts` — 26 in the suite, 494 in the app.

The lexicon: the three types are **Dromos** (run), **March** (walk) and **Chariot** (ride). "March" is
overloaded on purpose — it is both the walk type and the name of the live screen — so the generic word
for an outing is **journey**: *"42 journeys · 318 km"*. A journey is recorded in The Expedition, lived
through The March, written up in The Chronicle. There is no fourth word for it.

- **`MOVEMENT_LABELS` is the only place that knows the stored type is `ride` and its glyph is `bike`.**
  Its test asserts the whole record for that reason. Never write `'bike'` as an activity type.
- **`movementPerformance` is why no screen branches on the type.** Ride → speed and `km/h`; everything
  else → pace and `/km`. The Expedition and The March each computed that branch, in slightly different
  words, which is the usual way two screens end up disagreeing about one activity.
- **`splits` interpolates each unit boundary between the pair of points that straddle it**, never snaps
  to the nearest sample. With a fix every few seconds a runner covers 10–30 m between samples and the
  snapping error accumulates in one direction, so the reported splits drift away from the watch. Its
  test uses two points 2 km apart at an even 5:00/km: interpolating gives `[300, 300]`, snapping gives
  `[600, 0]`, so the assertion fails against a wrong implementation rather than merely passing against
  the right one. Distances are measured **relative to the first point**, so a trimmed route splits the
  same; a partial tail's `secondsPerUnit` is extrapolated so the last row compares with the whole ones;
  and a tail under `MIN_SPLIT_METERS` (50 m, the accuracy floor) is dropped rather than shown.
- **`describeMovementEvent` takes a `string`, not the `MovementEventType` union, and that is deliberate.**
  `MovementEvent.eventType` is typed `string` in the schema and `active.tsx` writes `'finished'`, which
  is not in the union (that has `'completed'`). Both spellings are in real rows; both map to "Journey
  closed". A `switch` over the union alone would silently drop the finish event from every chronicle.
  It returns `null` for machinery events, and the timeline drops whatever it will not describe.
- **`movementWeek` is a rolling seven days ending today, not a calendar week.** A calendar week has to
  pick a first day and that answer is locale-dependent. The rolling window also visits each weekday
  exactly once, which is what makes the strip's two-letter labels unique — `StatStrip` keys its cells by
  `item.label`, and S/M/T/W/T/F/S collides twice.
- **`formatExpeditionTotals` rounds to whole units where `formatMovementDistance` gives two decimals.**
  A 318 km lifetime total does not want to read "318.00 km". `formatTonnage` already stands apart from
  `formatWeight` for exactly this reason, so the aggregate follows the aggregate.
- **`heldSeconds` is `elapsed - moving`, and ignores the stored `pausedSeconds`.** Only
  `trimMovementActivity` ever writes that column, so it is blank on most rows; the subtraction is true
  however the row came to be.

**Departures:**

- **No CLIMB cell and no elevation chart on The Chronicle** (`5.19`, `5.20` show both).
  `elevation_gain_meters` is never written by anything, so both would be a permanent zero — which reads
  as a flat route rather than an unmeasured one. **This is a real tracker gap**, recorded as one; a gain
  figure needs an altitude threshold gate, and inventing that gate is a feature.
- **No "pace peaked at 4:10/km" in the timeline** (`5.20`). No event records a peak. The rest of the
  timeline is real `movement_events` rows.
- **The March shows HELD where the design shows a fourth clock.** `SessionElapsed` in the app bar already
  ticks elapsed once a second while the row is re-read every two, so an elapsed cell beside it would
  disagree with it by a second. Held is the one figure on that screen not derivable from the bar.
- **The March keeps no back affordance at all**, and `_layout.tsx` now backs that with
  `gestureEnabled: false` rather than the `headerBackVisible: false` it used to say — which has nothing
  left to hide now the native header is gone. A recording is left by finishing it.
- **The Threshold's three types are `Chip`s, not 104pt icon tiles.** `Chip` is the app's one-of-many
  control and it is label-only, so the glyph goes and the **gloss** takes its place: "Chariot — the ride".
  Better here, because Chariot is the one name in the lexicon a first-time reader cannot guess.
- **The Chronicle's map is a still, not a live map.** Pan and zoom are off and the scroll gesture belongs
  to the page — a map inside a `ScrollView` otherwise swallows every drag that starts over it, which on
  that screen is most of them. Interacting with the route is what The Retelling is for.
- **The Retelling's speed control is four chips, not one cycling button.** The old control advanced
  1 → 2 → 4 → 8 → 1 per tap, so the only way to learn what it did was to press it and the only way back
  from 8× was three more presses. Four chips are the same four choices, stated.
- **The Compass's unit setting is a pair of chips, not a "Metric units" switch.** A switch has an on and
  an off state, and "off" there meant miles — a choice hidden inside the absence of one.
- **The Expedition is a `FlatList`**, so it reads `useSafeAreaInsets` itself and adds
  `insets.bottom + layout.scrollFooter`; a screen inside `ScreenScroll` must not. Its `+` disappears
  while something is recording, because `getActiveMovementActivity` will not let a second journey start
  and a `+` beside a live one would be a control that lies about what it does.
- **Loading and "no route" are told apart on The Retelling.** Both used to render "No route available
  for replay", so the half-second before the points arrived looked like a permanent failure.

**One decision worth not re-deciding:** the four figures on The March and The Chronicle are laid out
**2×2 as two `bare` `StatStrip`s with a `Divider` between them** — the idiom `StatStrip`'s own doc
comment prescribes, and the same arrangement The Stele uses. Four display numbers across a phone give
each about 80pt.

**A fourth ESLint rule surfaced during this module: `react-hooks/purity`.** `Date.now()` in a render
body is *"Cannot call impure function during render"*. The house fix, already present in five screens,
is `useState(() => Date.now())` plus `setNowMs(Date.now())` inside the focus effect after an `await`.
[`08-verification.md`](08-verification.md) carries it with the other three.

---

## Stage 2 — The Call and The Oracle

The last two screens of Stage 2, restyled 2026-08-20. Both are pushed from The Citadel's Outer Ward, so
both take an `AppBar` with `onBack`; neither is a module and neither gained a `_layout.tsx`.

| File | Lines | Screen |
|---|---|---|
| `app/(tabs)/alarms.tsx` | 430 | The Call |
| `app/(tabs)/wallpaper.tsx` | 312 | The Oracle |

**No domain vocabulary was added, and that is the point of difference from the five module passes.** Both
screens already had their wording in the domain: `describeRepeat` / `formatTimeOfDay` / `formatTimeInput`
in `src/domain/reminders.ts`, and `quoteForDate` in `src/domain/motivation.ts`. Nothing on either screen
formats a figure at the call site, so there was nothing to pull down. `motivation.ts` gained two doc
comments instead — see below. **Test count is unchanged at 494 across 20 suites**, which is the expected
result: no behaviour changed.

The Call keeps its `FlatList` (a standing-call list has no natural ceiling) and therefore reads
`useSafeAreaInsets` itself; the whole form sits in `ListHeaderComponent`. The Oracle is `ScreenScroll` and
reads no insets. Both conventions as written in
[`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md).

**The Call — departures:**

- **No in-content display title.** `5.22_the_call` draws "THE CALL" in the top bar *and* again as a
  display-md heading beneath it. `AppBar` says it once; the tagline that sat under the duplicate ("Kairo
  speaks at the hour you name") moved inside the form card, where it describes something rather than
  repeating it.
- **The seven weekday toggles are `Chip shape="circle"`**, not the screen's own 46pt `Pressable`s. Same
  44pt round control, same accent-fill selected state, and the accessibility contract now comes from the
  primitive. It is the control the New Rite's "On these days" row already uses — two screens that ask for
  weekdays now ask with one control.
- **The resolved schedule is printed rather than the design's rule.** The design hints "No day selected
  repeats every day"; `describeRepeat([])` already answers "Every day", so the line leads with the answer
  and explains the mechanism only in the one case where it is not self-evident. **This is not the New
  Rite's rejected hint** (§*Where the design and the app's data disagree*): the Rite has an explicit
  cadence selector, where an empty custom day set contradicts the cadence chosen above it. Here
  empty-means-daily is `reminderTriggers`' documented contract.
- **Delete stays a visible `IconButton`.** The design's footer caption offers "Long-press to delete" as
  the only way out; a destructive action reachable only through a gesture with no affordance is one
  nobody finds. The caption goes with it.
- **The time field is not set in display-md.** `Field` owns its `TextInput` and its `style` prop targets
  the wrapper, so the design's large tabular clock would need a new prop on the primitive and would leave
  one form's input unlike every other input in the app. The *row's* time is `headlineSm` with
  `fontVariant: ['tabular-nums']`.
- **A row being edited is tinted `accentSoft`, without the accent left rule.** That rule means "the one
  thing in play" and is reserved for The Anvil's active lift and The Expedition's live recording; an edit
  is a selection, not a live process. `accessibilityState={{ selected }}` carries it to a screen reader.
  The tint is paired with `marginHorizontal: -spacing.md` / `paddingHorizontal: spacing.md` so it reaches
  past the text without shifting the row 12px sideways when an edit starts.

Kept from the old screen, and worth not undoing: the runtime `Notice` sits **above** the form, because
whether a call can actually sound depends on the build (Expo Go on Android cannot deliver remote
notifications) and that has to be read before a call is summoned rather than after it fails to arrive.
A row saved with no `notificationId` says **"Saved, not scheduled"** on its face. And the blank-name
fallback is still the literal `'Kairo reminder'`, because it has to match `src/services/notifications.ts`
— the row and the notification that sounds from it must not disagree about what the call is called.

**The Oracle — departures:**

- **No helmet mark under the inscription.** `5.23_the_oracle` centres a 16px `sports_mma` glyph at the
  foot of the hero and repeats it on the preview. A boxing glove under a Delphic quotation is sample
  content of the same class as the designs' remote hero photographs, and the app's own mark cannot stand
  in: **`KairoMark`'s interior is opaque `colors.background`**, so it reads on `background` and never
  inside a `Card`. The two `Meander` frets are the ornament instead.
- **The inscription is `headlineSm`, mixed case.** The design sets its twelve-character sample in
  uppercase display-md; the real quotations are sentences of 40–70 characters, which at 28/34 with 3.4pt
  tracking and no lowercase runs to five or six lines and overruns its block.
- **The hero's 260pt height is a floor, not a fixed height**, for the same reason.
- **The preview is 160pt wide, not the design's 112.** At 112 the inscription rendered *into* the image is
  illegible, and checking what you are about to save is the whole purpose of a preview. Nor is it the old
  screen's full-width 9:16 — at 327pt across that stands 581pt tall and pushes both actions below the
  fold.
- **"Forge another" appears only on a failure.** The design shows it under "Take the standard" as a
  permanent pair, but the render is deterministic from the day's inscription: forging again on success
  returns the identical image, which is a button that appears to do nothing.

Kept and worth not undoing: the four states of the standard — unconfigured, in flight, failed, ready —
are told apart and each one that a person can act on offers the action. The status is **derived** from
`result?.attempt === attempt`, not stored alongside the result, which is what let the old screen show a
spinner and "connect sync settings" at the same time. The `frame` placeholder is `colors.background`, not
`surface`, for the `KairoMark` reason above.

**`src/domain/motivation.ts` gained two doc comments** and no code change. It was the only domain module
without one, and the two things a reader needs are not visible from the code: that the quote is chosen
**by the date rather than at random** so the screen can be opened five times in an evening without the
inscription changing under the reader; and that `Date.UTC` is fed the date's **local** Y/M/D on purpose —
it turns a local calendar date into a timezone-free day count, so the line changes at local midnight and
a DST shift cannot move it. The double modulo is for pre-1970 dates, where the day count is negative and
JavaScript's `%` keeps the sign.

**One bug found and fixed outside the two-screen scope: `app/(tabs)/tasks/new.tsx`.** Checking the
`shape="circle"` precedent showed the same latent overflow in a screen already shipped. Seven fixed-44pt
circles need 308pt (332 with the 4pt gaps) and the screen margin leaves 327 on a 375pt phone, 312 on a
360pt one — and **React Native's `flexShrink` defaults to 0**, unlike the web, so the row does not
tighten: the last day runs off the edge. `dayChip: { flexShrink: 1 }` in both The Call and the New Rite.
Anything else that lays a fixed-width control out seven-across wants the same line.

## Stage 3 — The Envoy and The Gates

The first two of the five new screens, built 2026-08-21 against
[`12-stage-3-brief.md`](12-stage-3-brief.md), which decided all five before any code and holds the
reasoning. This section records what landed and the departures; the brief holds why each figure has the
rule it has.

| File | Lines | What |
|---|---|---|
| `app/_layout.tsx` | +12 | registers `gates` and the three modal routes, `headerShown: false` |
| `src/components/LaunchRouter.tsx` | 56 | **new** — the onboarding redirect |
| `app/(tabs)/envoy.tsx` | 386 | The Envoy |
| `src/domain/envoy.ts` | 206 | **new** — the sync vocabulary |
| `src/domain/__tests__/envoy.test.ts` | 225 | **new** — 20 cases |
| `app/gates.tsx` | 533 | The Gates |
| `src/domain/dates.ts` | +71 | `startOfWeek`, `WeekStartDay`, `relativeTimeLabel`, `untilTimeLabel` |
| `src/db/preferences.ts` | +125 | four keys and their accessors |

**The current measured count is 554 tests across 24 suites**, measured 2026-08-22 — see
[`08-verification.md`](08-verification.md), which owns it. Added coverage includes Pantheon, Annals, and
Sanctum maintenance/domain cases, the four workout-set sync cases added the same day, and the fifteen
that took the Annals ledger suite from 3 cases to 18.

**The redirect is its own component, not code in `_layout.tsx`.** `LaunchRouter` reads
`ONBOARDING_COMPLETE` and redirects; `_layout` stays a route registry. It has to be a child of
`SQLiteProvider` to read a preference at all, which is the mechanical reason, but the readable one is
that a layout that also makes decisions is where two unrelated concerns end up sharing a file.

**The Envoy — departures**, all one reason: *the design shows figures the app has no source for, and
inventing a source for a diagnostics screen defeats the point of it.*

- **No DELIVERED count.** `markSucceeded` deletes the row it succeeded on, so a delivered intent leaves
  nothing behind by construction. "214 items delivered" needs a ledger table that does not exist. The
  strip is two cells.
- **No token row, and no "Forget Credentials".** `SyncClient` holds its token pair in a private field
  and `createSyncClient` builds a fresh instance per run, so nothing outlives a sync to report an
  expiry against. The device key is a build-time constant from `EXPO_PUBLIC_KAIRO_DEVICE_KEY`, not
  something stored on the device — a "forget" button would be a no-op implying the app holds a secret
  it could drop.
- **The retry cap is stated as one hour, not the design's ten minutes.** `MAX_BACKOFF_MS` is
  3,600,000, and the screen reads the constant rather than repeating the caption. `describeRetryPolicy`
  is tested against the code, and its test says so.
- **No SENDING state.** It exists only inside one pass of `syncOutbox`'s loop and is never written
  down. `outboxState` distinguishes the three a query can actually answer: due, waiting, failed.
- **"Last delivered", not "Last ran".** `LAST_SYNC_AT` is written only by a run that delivered
  something. `SyncBootstrap` calls in every 60 seconds, so "the loop ran" is almost always true and
  says nothing.
- **"Send now" is the `AppBar` action**, not a docked footer button — the convention that dropped every
  full-width footer slab in the rebuild.

**It reads on focus, not on mount** (`useFocusEffect`, as The Citadel does). The satchel is filled by
every other screen and drained by `SyncBootstrap`'s own timer, so what the queue held when the tab
first mounted is stale by the time anyone returns to it. This was also a **lint fix**: a plain
`useEffect` calling a `useCallback` that sets state trips `react-hooks/set-state-in-effect`, because the
rule follows the call and sees the setState without seeing that every one is behind an `await`. The
`cancelled` flag is not ceremony either — with focus-refetch, a slow read in flight when the tab loses
focus really can land after the fresh one.

**The Envoy has no Outer Ward entry by design.** It is pushed from The Sanctum only. The Outer Ward row
the brief originally planned was dropped: the Outer Ward
holds things you go and *look at*, and a queue you visit when something looks wrong belongs behind
settings rather than advertised on the dashboard.

**The Gates — departures:**

- **Two Measures rows, not three.** One `UNIT_SYSTEM` covers weight *and* distance; the design's
  separate KG/LB and KM/MI toggles would mean auditing every `toKg` and `formatMovementDistance` call
  site to enable kilograms-with-miles, which nobody asked for. The locked plan resolved it the same way.
- **The Gatekeepers have no checkboxes.** An OS grant cannot be switched back off from inside the app,
  so a checkbox would be a control that does not control its thing. Kairo requests each permission at
  the point of first use, deliberately, so the request arrives with a reason attached. The three rows
  are informational, and each **reports what this runtime can actually do** — `notificationsMode`,
  `IS_EXPO_GO`, `mediaLibraryAvailable` — in the wording `alarms.tsx` and `movement/new.tsx` already
  use, rather than promising Expo Go what it lacks.
- **A degraded row is `warning`-toned, never dimmed.** Dimming the row that carries the caveat is the
  readability problem this rebuild exists to fix — the same call the Citadel's at-risk rite makes.
- **`pagingEnabled`, not scroll-snap.** React Native has no CSS snap.
- **The full-width buttons stay.** The rebuild dropped every *docked* footer slab; these are in the
  content flow, and advancing is the whole purpose of each panel — as with "Set out" in
  `movement/new.tsx`.
- **"altered in the Citadel later" → "in The Sanctum later."** The Sanctum is where the two settings
  live; the Citadel is only the door to it.

**Two layout traps caught in the first draft, both worth not reintroducing:**

- **A panel cannot be `flex: 1`.** Inside a horizontal `ScrollView` the content container is a *row*,
  so `flex: 1` on a child sizes it along the scroll axis and collapses all three panels onto one page.
  Both dimensions are set explicitly, and the height explicitly too — a percentage against a container
  sized by its own children resolves to nothing.
- **Paging measures the scroll view, not the window.** `pagingEnabled` snaps to multiples of the
  scroll view's own frame width, which is not `useWindowDimensions().width` in landscape on a notched
  phone; using the window would drift one inset per swipe. The page size comes from `onLayout`,
  seeded from the window, with an equality guard because `onLayout` re-fires.

**Two things The Gates does that are behaviour, not style:** a failed `ONBOARDING_COMPLETE` write keeps
the user at The Gates rather than letting them through to a Citadel that will bounce them next launch;
and the three dots are one `accessible` element labelled "Step 2 of 3", not three announced views.

`IntroOverlay` plays over the whole stack on the first launch of a JS context, so on a genuine first
install it plays *over* The Gates. That is what being above the stack means, and it is written in the
file so nobody reads it as a bug and removes one of the two ceremonies.

## Stage 3 — The Pantheon, The Annals and The Sanctum

The three remaining screens are implemented. Pantheon has all-history records and tested movement
calculations; Annals has calendar-week navigation, macro range reads and tested verdict wording; Sanctum
has system details, measure controls, Herald/Envoy/Record navigation, export/sharing, and raze maintenance
with notification cancellation and exercise reseeding.

One correction it forced in a **project** doc: `docs/09-ui-rebuild-plan.md` justified "greatest climb"
as *"a `MAX`"* over `elevation_gain_meters`, which nothing writes — it would return 0 for every
activity on record. The claim is struck in place there, with a pointer, rather than silently edited,
because it was acted on once.
