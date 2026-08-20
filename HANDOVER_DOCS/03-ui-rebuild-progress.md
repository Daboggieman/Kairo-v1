# The rebuild so far — what landed, and the departures that are deliberate

Stages 0 and 1 are complete; Stage 2 is 15 of 22. Every "departure from the design" below is commented
in the file that makes it. **Do not "fix" them** — each one is a decision about the app's real data, and
several were made twice because the first record of them was too thin to trust.

Verified after all of it, on **2026-08-19**: `npm test` 481 passed across 20 suites, `npx tsc --noEmit`
clean, `npm run lint` clean. No module has been run on a device yet.

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
- **The Anvil's set rows carry the estimated 1RM; The Stele's carry RPE and/or rest.** Nothing writes RPE
  yet while `logSet` records rest, so the design's RPE-only column would be blanks.
- **The Armory drops the muscle-group filter chips.** `seed.ts` stores **eleven** raw groups, not the
  design's six, and a custom lift has `muscleGroup: null` — mapping ours onto theirs is a taxonomy
  decision hiding inside a UI pass, on a library of thirty rows the search box already filters. It also
  drops the per-row last-time, which is thirty queries on open; The Anvil prints it for the lift you
  actually picked.
- **The Stele lays its four figures out 2×2, not 1×4.** `5.9_the_stele` is a `max-w-4xl` desktop layout;
  four display numbers across a phone gives each ~80pt.
- **The Stele has no EDIT/DELETE footer.** Set edit and delete are deferred work, and the plan locks this
  pass to copy, structure and type.

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
