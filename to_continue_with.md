# Continue with

Handoff for the Kairo v1 sessions so far: Phase 0 scaffold, then Workouts, Weight, Tasks
and Macros. Read before continuing.

Last updated: **2026-08-18**, mid-way through the Greek-themed UI rebuild. Stages 0 and 1
(foundations and the app shell) are **complete**; Stage 2 (restyling the 22 existing screens) is
**4 of 22 done** — The Citadel and the whole tasks module. **The rebuild is the current work and it
supersedes the partial restyle described further down — read the next three sections before touching
any screen.** The resume point is *"Stage 2, next up: the workouts module"* below.

## UI rebuild, Greek theme — 2026-08-18 (CURRENT WORK)

The brief: *"i want to rebuild the ui completely … dark masculine greek themed app for Kairo
maintaining the same logo and accent color of the logo"*. Every screen is renamed on a Greek lexicon
— The Citadel (dashboard), The Rites (tasks), The Forge (workouts), The Feast (macros), The Scales
(weight), The Expedition (movement), The Call (reminders), The Oracle (wallpaper).

**`docs/09-ui-rebuild-plan.md` is the locked scope.** It holds the screen lexicon, the screen → route
map, the colour/spacing substitution table, the token changes, the five new screens, and the delivery
gates. This section holds only what a session needs before opening that file, plus the things that
will bite.

### Where the work actually is — 2026-08-18

Typecheck and lint were **both clean at handoff** (`npx tsc --noEmit` and `npx eslint .` from
`apps/mobile`, silent, exit 0). `npm test` has **not** been run and now must be: this pass edited
`src/domain/__tests__/tasks.test.ts`. Nothing is committed — correctly, the user has not asked.

| Stage | State |
|---|---|
| **Stage 0 — foundations** | **Done.** Theme tokens, Cinzel, all Layout primitives, `Button`, `Checkbox`, `Logo`. |
| **Stage 1 — shell** | **Done.** `app/(tabs)/_layout.tsx` is the six-tab Canon bar. |
| **Stage 2 — 22 screens** | **4 of 22.** The Citadel + the tasks module (3 screens and its `_layout`). |
| **Stage 3 — 5 new screens** | Not started. |

**Stage 0, in detail — all of it landed and verified:**

- `src/theme/index.ts` (223 lines): `colors.border` `#2A2F38` → **`#504535`**; `layout` on the 8px
  grid (`screenPadding` 24, `sectionGap` 24, `cardPadding` 16, `cardGap` 16, `rowPadding` 16,
  `scrollFooter` still 40); `fontSize.xxl = 40` / `lineHeight.xxl = 48`; and the new **`type`**
  export with six roles — `displayLg`, `displayMd`, `headlineSm` (the three Cinzel ones), `eyebrow`,
  `label`, `timer`. Screens import it aliased — `import { type as typeScale } from '@/theme'` — and
  should keep doing so: a bare `type` in an import list reads as TypeScript's type-only import
  modifier, so the alias is what keeps the line unambiguous to both the compiler and the reader.
- **`type` is declared `satisfies Record<string, TextStyle>`, not `as const`.** This matters and it
  will be re-broken by anyone who "tidies" it: `as const` freezes `fontVariant` as a *readonly*
  tuple, which `StyleSheet.create` will not accept, and the error surfaces at the call site rather
  than here. `satisfies` also checks every role against what React Native really takes, so a typo in
  `fontWeight` or `fontVariant` fails in the theme file.
- **Cinzel is installed and loading.** `@expo-google-fonts/cinzel ^0.4.2` is in
  `apps/mobile/package.json` and `node_modules` is restored (that install also fixed the
  "`node_modules` is absent" blocker recorded further down — every command below runs now).
  `app/_layout.tsx` calls `useFonts({ Cinzel_600SemiBold, Cinzel_700Bold })` above the provider and
  gates first paint on `fontsLoaded || fontError !== null` behind the same `AppLoader` as the SQLite
  migration. A **font error is deliberately not fatal** — it degrades to the platform serif rather
  than hanging on a loader forever.
- **`src/components/Layout.tsx` is now 1014 lines and owns 25 exports.** This is the file to read
  before writing any screen; nothing below should be rebuilt per-screen:

  `Screen` · `ScreenScroll` · `ScreenHeader` (tab roots) · `AppBar` (pushed/modal screens) ·
  `Eyebrow` · `Section` · `Card` · `CardHeader` · `CardAction` · `RowGroup` · `NavRow` · `Notice` ·
  `EmptyState` · `IconButton` · `StatStrip` · `Pill` · `Chip` · `Field` · `Divider` · `Stat` ·
  `StatCard` · `Timer` · `ProgressBar` · `Meander` · `Fluting`

  Notes on the ones with contracts worth not re-deriving: `ScreenScroll` owns the
  `insets.bottom + layout.scrollFooter` footer inset, so a screen inside it must **not** also read
  `useSafeAreaInsets`. `RowGroup` draws the rules between its children, so its rows must not carry
  their own `borderBottomWidth`, and it takes a `style` prop for group-level dimming. `StatStrip`
  takes `size?: 'md' | 'lg'` and a per-item `progress?: number` that draws a bar pinned to the
  bottom of that cell. `Chip` takes `role?: 'radio' | 'checkbox'` — that picks the accessibility
  contract (`selected` vs `checked`), so a screen cannot pair them wrongly — and `shape?: 'block' |
  'circle'`. `Pill` takes `tone?: 'accent' | 'danger' | 'muted' | 'success'`; its border is always
  `colors.border` because the designs draw it as the tone colour at 30% alpha, which would mean
  inventing four rgba values.
- `Button`: labels are uppercase + `type.label`, and **`danger` is outlined** (transparent fill).
  `Checkbox`: `SIZE = 28`. `Logo`: `KairoWordmark` is `Cinzel_700Bold` with its optical-centring
  `paddingLeft` re-measured.

**Stage 1, in detail:** `app/(tabs)/_layout.tsx` keeps six visible tabs plus `href: null` on
`alarms`/`wallpaper`, labelled `CITADEL · RITES · FORGE · FEAST · SCALES · MOVE` at 10px/700/1pt
tracking. The bar is `TAB_BAR_HEIGHT = 80` **plus `insets.bottom` added by hand** — with an explicit
`height` the navigator treats it as the whole bar and still pads by the inset, which left 46 points
of usable bar. The 2pt active accent rule is an absolutely-positioned `View`, not a
`borderTopWidth`, which would add height to the active tab and jog the icons on every switch. A
local `TabButton` replaces the default (which packs icon and label to the top of an 80pt item); its
props type is declared **structurally** rather than imported, because `BottomTabBarButtonProps`
lives inside expo-router's vendored react-navigation. `aria-selected` is the only source of focus
state for a replaced button.

**Stage 2, done so far.** `app/(tabs)/index.tsx` — The Citadel: fluted header with `KairoMark` +
wordmark on `colors.background` (never a card), a `Meander` under it, four `DashboardCard`s named
The Rites / The Feast / The Scales / The Forge, and a `Section title="The Outer Ward"` `RowGroup`
holding The Oracle and The Call. Then the tasks module, all four files rewritten:

| File | Lines | Screen |
|---|---|---|
| `app/(tabs)/tasks/_layout.tsx` | 28 | `headerShown: false`; `new` stays `presentation: 'modal'` |
| `app/(tabs)/tasks/index.tsx` | 357 | The Rites |
| `app/(tabs)/tasks/new.tsx` | 168 | The New Rite |
| `app/(tabs)/tasks/[taskId].tsx` | 364 | The Flame |

Plus `src/domain/tasks.ts`: `formatProgress` now returns `"3 of 4 kept"` / `"nothing due"` and
`formatStreak` returns a bare number or `''`. The Greek wording lives in the domain rather than at
the call site so the screen and its unit tests cannot disagree — **that is why
`src/domain/__tests__/tasks.test.ts` changed and why `npm test` must be re-run.**

Four visual decisions on those screens that look like mistakes and are not, so they don't get
"corrected": The Flame's history window went from 8 weeks to **13** (a quarter, rounded to whole
weeks because the grid is week-aligned) and its heatmap **scrolls horizontally** rather than shrinking
its cells — thirteen 14pt columns fit a modern phone and not a small one, and squares that shrink to
fit stop being readable before they stop being drawable. A missed day is **tinted red** rather than
left empty, because the point of a quarter of history is seeing where it broke and an empty square
looks identical to a day off. The cell `borderRadius` is a literal **2**, not `radius.sm` — at 14
points the smallest token in the scale (8) rounds the square into a circle. And on The Rites, the
"not due today" and archived groups dim at the **`RowGroup`** level, not per row, because the rules
between rows are drawn by the group and fading one row makes the rules look misaligned.

### The conventions Stage 2 established — follow these for the remaining 18 screens

Each of these was a decision made once on the tasks module; re-deciding them per module is how the
app ends up looking assembled rather than designed.

- **Every module `_layout.tsx` sets `headerShown: false`** and keeps
  `contentStyle: { backgroundColor: colors.background }` (it is what paints behind a push
  transition). Drop the `title` from each `Stack.Screen` — nothing renders it any more.
- **A tab root renders `ScreenHeader` as the first child of its `ScreenScroll`; a pushed or modal
  screen renders `AppBar`.** `AppBar` takes `onBack` for a push and **omits it for a modal** — the
  way out of a modal is its own dismiss, and a back chevron there claims a screen underneath that
  does not exist. A modal's escape is an `IconButton icon="close"` in the `AppBar`'s `action` slot.
  **Exception: `movement/active.tsx` keeps no back affordance at all** — it currently sets
  `headerBackVisible: false` deliberately, and that must survive the restyle.
- **One action per tab root, as an outlined `IconButton` in `ScreenHeader`'s `action` slot.** The
  designs' docked full-width footer button is dropped: a 56pt slab above an 80pt tab bar was eating
  a fifth of the screen.
- **Aggregate strips render only when there is something to aggregate.** Three zeroes above an empty
  list is chrome describing nothing.
- **Fold the carried-over items in as you go** — the `.catch` → `<Notice tone="danger">` guard, the
  density pass, `LogoLoader`. The list is under *"What was left when this pass stopped"* below, and
  `tasks/index.tsx` is already ticked off it.
- **Where the design and the app's data disagree, the tested domain wins and the deviation gets a
  comment.** Precedents set on the tasks module: The Flame's heatmap day labels stay Sunday-first
  because `dayOfWeek` is `getDay()` order (re-basing a tested grid to match a label column is the
  wrong trade); The New Rite drops the design's "OR / Every N days" numeric field because nothing in
  the app creates an `interval:` rule and two live ways to express one cadence with no apply step
  leaves "which wins" to be inferred; and its *"Selecting no day repeats every day"* hint was
  rejected in favour of refusing to save an empty custom selection, because a sheet that silently
  converts your choice into a different rule is the harder thing to notice.

### Stage 2, next up: the workouts module

Four screens, in this order: `§5.6 forge → workouts/index.tsx` (140 lines),
`§5.7 anvil → workouts/active.tsx` (315), `§5.8 armory → workouts/exercises.tsx` (170),
`§5.9 stele → workouts/[sessionId].tsx` (136), plus `workouts/_layout.tsx` (22). Then macros
(`add.tsx` 238, `index.tsx` 306, `targets.tsx` 107), weight (`index.tsx` 334, `log.tsx` 184,
`goal.tsx` 170), movement (`index.tsx` 111, `new.tsx` 112, `active.tsx` 158, `[activityId].tsx` 206,
`replay.tsx` 103, `settings.tsx` 79), and finally `alarms.tsx` (391) and `wallpaper.tsx` (211).

Those last two already import `Layout.tsx` — from the **2026-08-17** pass, not the rebuild. They
still need §5.22 / §5.23 transcribing; do not read the import as "already done".

**§5.6 The Forge is already read.** What it asks for:

- A fixed header: `THE FORGE` in accent display, subtitle *"16 sessions · 84,120 kg lifted"* — so
  `ScreenHeader` with that aggregate as its `subtitle`.
- An **active-session card**: fill `#2B2110` (= `colors.accentSoft`), a 4px accent left border, the
  eyebrow `AT THE ANVIL`, a pulsing green dot, `In progress · 24m 10s`, `3 exercises · 11 strikes`,
  and a full-width *Return to the anvil* button. Its `bg-gradient-to-r from-primary/10` overlay is
  one of the five gradients to flatten.
- `THE ANNALS OF THE FORGE` — a section title with a hairline running off to the right — then one
  card per session: a ruled header row (`Sat 16 Aug` / `1h 04m`), a three-column grid divided by
  `border-l` reading **STRIKES** (accent) / **TONNAGE** (`5,240 kg`, tabular) / **LIFTS**, and a
  wrapped row of exercise-name chips ending in a `+2` overflow chip in accent. That maps onto
  `CardHeader` + a three-cell `StatStrip` + `Pill`s.
- **Vocabulary to carry through the module**: sets → **strikes**, volume → **tonnage**, exercises →
  **lifts**. Same treatment as `formatProgress` — if a formatter is tested, move the wording into
  `src/domain/workouts.ts` rather than writing it at the call site.

`workouts/index.tsx` is a `FlatList` today and should stay one: a session log genuinely grows
without limit, unlike the rites list.

### The design dumper, and the glyph table — both already worked out

Reading `code.html` raw is unpleasant. This script flattens one to tag-plus-class-plus-text, which
is how all the designs above were read. It lives in `/tmp` and **`/tmp` does not survive a reboot**,
so it is reproduced here rather than referenced:

```python
# /tmp/dump_design.py — usage: python3 /tmp/dump_design.py media/stitch/5.7_the_anvil/code.html
import re, sys
for path in sys.argv[1:]:
    h = open(path).read()
    body = h[h.index('<body'):]
    body = re.sub(r'<(script|style)[\s\S]*?</\1>', '', body)
    print('\n########', path)
    out = []
    for m in re.finditer(r'<(/?)(\w+)([^>]*)>|([^<]+)', body):
        if m.group(4):
            t = ' '.join(m.group(4).split())
            if t and t != '-->': out.append('    TEXT: ' + t)
        else:
            close, tag, attrs = m.group(1), m.group(2), m.group(3) or ''
            cls = re.search(r'class="([^"]*)"', attrs)
            out.append(('</' + tag) if close else ('<' + tag + (' ' + cls.group(1) if cls else '')))
    print('\n'.join(out))
```

**Note the folder is `media/stitch/5.4_new_rite`, not `5.4_the_new_rite`** — every other one takes
the `the`.

**All 61 Material Symbols names in the 30 exports are now mapped and verified against the installed
`MaterialCommunityIcons` glyphmap.** Use this table; do not re-guess, and do not trust a name that
merely sounds right — a wrong one renders as a box, not an error.

| Design | Ours | Design | Ours |
|---|---|---|---|
| `accessibility_new` | `human` | `local_fire_department`, `whatshot` | `fire` |
| `add` | `plus` | `location_on` | `map-marker` |
| `architecture` | `ruler-square-compass` | `lock` | `lock-outline` |
| `arrow_back` | `arrow-left` | `my_location` | `crosshairs-gps` |
| `arrow_back_ios`, `arrow_back_ios_new` | `chevron-left` | `notifications` | `bell-outline` |
| `arrow_downward` | `arrow-down` | `pause` | `pause` |
| `arrow_forward` | `arrow-right` | `photo_camera` | `camera-outline` |
| `balance` | `scale-balance` | `play_circle` | `play-circle-outline` |
| `broken_image` | `image-broken-variant` | `remove` | `minus` |
| `check` | `check` | `replay` | `replay` |
| `check_circle` | `check-circle` | `restaurant` | `silverware-fork-knife` |
| `chevron_left` / `chevron_right` | `chevron-left` / `chevron-right` | `restaurant_menu` | `silverware-variant` |
| `dark_mode`, `nights_stay` | `weather-night` | `schedule` | `clock-outline` |
| `delete` | `trash-can-outline` | `search` | `magnify` |
| `directions_bike`, `pedal_bike` | `bike` | `security` | `shield-outline` |
| `directions_run` | `run` | `shield_person` | `shield-account-outline` |
| `directions_walk` | `walk` | `shield_with_heart` | **`shield-crown-outline`** (see below) |
| `edit` | `pencil-outline` | `speed` | `speedometer` |
| `emoji_events` | `trophy-outline` | `sports_martial_arts` | `karate` |
| `error` | `alert-circle-outline` | `sports_mma` | `boxing-glove` |
| `expand_more` | `chevron-down` | `sprint` | `run-fast` |
| `fitness_center` | `dumbbell` | `star` | `star-outline` |
| `flag` | `flag-outline` | `swords` | `sword-cross` |
| `fort` | `castle` | `task_alt` | `checkbox-marked-circle-outline` |
| `hiking` | `hiking` | `terrain` | `terrain` |
| `light_mode` | `weather-sunny` | `timer` | `timer-outline` |
| `trending_down` | `trending-down` | `warning` | `alert-outline` |
| `wb_twilight` | `weather-sunset` | | |

**Two names that do not exist and will waste a session if trusted:** `flame` (use `fire` — this one
was caught mid-build) and `shield-heart-outline` (the family has `shield-cross-outline`,
`shield-check-outline`, `shield-crown-outline`, no heart; `shield_with_heart` appears once, in The
Sanctum, and `shield-crown-outline` suits the theme). Re-verify any glyph not in the table with:

```sh
cd apps/mobile && node -e "const m=require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'); console.log('NAME' in m)"
```

### The design handoff — read the markup, not the pictures

30 designs are in `media/stitch/`, one folder per screen, each with `code.html` and `screen.png`,
plus `media/stitch/kairo/DESIGN.md`.

- **`code.html` is authoritative. The PNGs are lossy.** All are capped at 1600px; seven are viewport
  screenshots that crop content away (the Citadel preview stops mid "74.8 kg" although its code
  continues through three more cards), and the rest are downscaled to 273–575px so the text is soft.
  Nothing needs re-exporting — just don't diff against the PNGs.
- **The exported palette drifted from ours and must be substituted, never copied.** The Material-3
  frontmatter carries `#101418` background, `#e1e2e9` text, `#f9bc4a` primary, while the prose in the
  same file correctly cites our real tokens. Across the 30 exports `#F9BC4A` appears 92 times and our
  `#F2F4F7` twice. `5.1_the_canon` is the design-system sheet and is drifted too — its swatch grid
  renders the wrong values under our token names, so it cannot be transcribed literally either. The
  substitution table is in `docs/09-ui-rebuild-plan.md`.
- **`DESIGN.md` has a split personality.** Its frontmatter is the drifted M3 theme; its prose cites
  the app's real hexes and prescribes 12px radii, 56px buttons, a 24px outer margin, an 8px grid,
  tonal layering instead of shadows, and **Material Community Icons** — which is the icon set the app
  already has. When the two disagree, the prose is right.
- The logo shipped with the designs is **unchanged art** — same 1216×1294, same measured mean gold,
  same sampled-pixel count as `assets/source/kairo-mark.png`, differing only by SHA. A re-encode.
  Do not re-run `generate-icons.py`; `colors.accent` stays `#D79E2D`.

### The five decisions already taken

| | |
|---|---|
| Palette | Ours, plus the handoff's warm bronze-brown border. **Only `colors.border` changes**, `#2A2F38` → `#504535`. |
| Display font | Install **Cinzel** only (`@expo-google-fonts/cinzel`). Body text keeps the platform font — no Inter payload. |
| Density | Adopt the 8px grid: `screenPadding` 24, `cardPadding`/`cardGap`/`rowPadding` 16, `sectionGap` 24. |
| New screens | Build 5 — Gates, Sanctum, Envoy, Pantheon, Annals. Defer 2 — Agoge (new feature + table), Scrolls (needs editorial content, overlaps Phase 4). |
| Tab bar | **Six tabs kept, movement labelled `MOVE`.** |

### The tab-bar deviation — say so if it's wrong

All 30 designs ship a five-tab bar (`CITADEL | RITES | FORGE | FEAST | SCALES`) with **no movement
entry anywhere**, and the Citadel's Outer Ward row group doesn't list it either. Following that would
strand the whole of Phase 3 two taps deep. So the implementation keeps six visible tabs with movement
labelled `MOVE` — short enough to fit at six across, and already what it reads today; the screen
itself is titled THE EXPEDITION. This is the one knowing divergence from the designs.

### Things that will go wrong

- **`letterSpacing` is in points in React Native, not `em`.** The design's `0.15em` / `0.12em` /
  `0.1em` are resolved against their own font size once, in the `type` export in
  `src/theme/index.ts`. Do not put an `em` value or a raw `fontFamily` string at a call site.
- **A missing font falls back silently.** Cinzel absent looks like a slightly wrong serif, not an
  error. It has to be confirmed on a device. The loader deliberately does not gate on a font error,
  so a failed fetch reaches the user as slightly-wrong type rather than a stuck splash.
- **The exports' 61 Material Symbols names are a different vocabulary** from
  `MaterialCommunityIcons`. **They are all mapped and verified now — use the table above** rather
  than guessing by name. A wrong name renders as a box, not an error.
- **`node_modules` is installed again.** `@expo-google-fonts/cinzel` went in with `npx expo install`,
  which restored the whole tree, so lint, typecheck, tests and the glyphmap check all run. (Historic
  note: earlier in this file the absent tree is described as a blocker. It no longer is.)
- Do not port the designs' gradients (5), `backdrop-blur-sm` (8), or shadows. Flatten them. No
  `expo-linear-gradient`, no `expo-blur`. `DESIGN.md` itself says the system avoids soft shadows.
- Six remote `lh3.googleusercontent.com` `<img>` tags in the exports are placeholders — use the local
  mark or nothing.

### Docs written for this, 2026-08-18

`docs/09-ui-rebuild-plan.md` is new. `docs/README.md` lists it as item 10. `docs/00-overview.md`
gained a "Voice and visual identity" section. `docs/04-feature-specs.md` gained a note that its
screen names are functional rather than display copy, plus a spec block for the five new app-shell
screens. `docs/06-roadmap.md`'s "Pulled forward from Phase 6" section now records the partial restyle
as superseded. `docs/07-repo-structure.md` gained `media/` in the tree, the new Layout primitives, a
convention for the `type` token group, and the English-identifiers rule.

`ui_rebuild_stitch_prompt.md` at the repo root — the prompt the 30 designs were generated from, added
in `e164a93` — is **deleted in the working tree and that deletion is unstaged**. It is superseded by
`docs/09-ui-rebuild-plan.md`. Restore it with `git checkout -- ui_rebuild_stitch_prompt.md` if that
was not intended; otherwise it goes with the next commit.

## UI restructure and branding — 2026-08-17 (SUPERSEDED by the rebuild above)

**Read this for the facts it established, not for its plan.** Its screen-by-screen resume point is no
longer the resume point — the three restyled screens are being re-done along with the other nineteen,
and its outstanding items are folded into the rebuild's per-module work. The constraints, the lint
rules, and the reasoning below are all still binding.

The brief, in the user's words: *"fix other and every issue that was found, or that stopped the app
from running, also the reminder section has bad ui, i think we should restructure the whole app ui
to be less congested and more, as well as an intro logo and a loader logo"*, then *"how about i go
and find a new png icon that would be the icon we would use, and also the base theme color of the
icon … and then u could convert the png icon to a animated loader"* — followed by the artwork
itself (a gold Spartan helmet, transparent background). So: the user's art is the app icon, the
app's accent is **sampled from** that art, and the art is the loader.

This pass is committed (see "Working tree" below). Typecheck and lint were clean at handoff;
`npm test` has not been run since. The expectation was **426 passed (20 suites)** — the previous 394
plus 32 new reminder-helper cases — but **that has never been measured, so do not write it anywhere
as fact.** The rebuild adds `pantheon.ts` and `annals.ts` suites on top, so the number will move
again; the only trustworthy count is one the user returns from a real run.

### The mark, and the accent that comes from it

- `apps/mobile/assets/source/kairo-mark.png` is the user's original file, kept for provenance.
- `apps/mobile/scripts/generate-icons.py` derives every rendered asset from it: trims to the alpha
  bounding box, recolours near-black interior pixels to `#0B0D10` so no OLED seam shows, and fits
  the art by its longest side. It writes `assets/logo.png` (296×512, in-app), `assets/icon.png`
  (opaque field, `ICON_FIT = 0.80`), and `assets/adaptive-icon.png` (transparent,
  `ADAPTIVE_FIT = 0.56` for Android's 108dp canvas where only the central 72dp is visible).
  Re-run it if the artwork ever changes; do not hand-edit the outputs.
- `colors.accent = '#D79E2D'` is the **measured mean gold** of that art, not a guess. The first
  attempt at automatic extraction picked `#080000` — a near-black artifact with saturation 1.0 —
  so the heuristic also requires HSV value > 0.45.
- `colors.accentText = '#0B0D10'`. White on this gold is **2.38:1** and fails WCAG AA; near-black
  is 8.17:1. That flip is why every primary `Button` label and the `Checkbox` tick is now dark on
  gold. `colors.warning` moved to amber `#E07B39` because gold *is* the accent now, and
  `chartColors.fat` moved to violet for the same reason.
- Verified visually at 48/72/96 px and under a simulated circular launcher mask — nothing clips.

`app.json` gained `icon`, `backgroundColor`, and `android.adaptiveIcon`, and
`userInterfaceStyle` changed `automatic` → `dark`: the app has no light palette, so `automatic`
only made native alerts and the keyboard clash with it.

### Two hard constraints on `src/components/Logo.tsx`

1. **The helmet must never rotate.** It is a figure with a top and a bottom; a spinning logo reads
   as a rendering fault. `LogoLoader` holds the mark still and turns an SVG ring around it
   (`react-native-svg` 15.15.4, already installed).
2. **These components must sit on `colors.background`.** The mark's interior is opaque
   background-coloured pixels, not transparency, so on a lighter surface it shows as dark patches.
   `wallpaper.tsx`'s loading placeholder has a comment about exactly this.

Exports: `KairoMark`, `KairoWordmark`, `LogoLoader`, `AppLoader` (the `Suspense` fallback in
`app/_layout.tsx`), `IntroOverlay`. The intro renders **over** a mounted app rather than gating it,
so the database opens behind it and dismissing it reveals data instead of a spinner. A module-scope
`introPlayed` flag in `app/_layout.tsx` stops it replaying on Fast Refresh or an ErrorBoundary
retry. `expo-splash-screen` is **not** installed — the intro is JS, not a native splash.

### The shared shell

`src/components/Layout.tsx` is new and is where screen structure now lives: `Screen`,
`ScreenScroll` (owns the `insets.bottom + layout.scrollFooter` footer every screen was computing
differently), `ScreenHeader`, `Section`, `Card`, `Notice` (tones `info`/`warning`/`danger`/`accent`,
tinted fill plus a left rule), `EmptyState`, `Field`, `Divider`, `Stat`.

Three token groups in `src/theme/index.ts` back it: `layout` (screen/card/section rhythm — absolute
values, because `spacing` was being used for both "gap between two icons" and "screen margin" and
everything ended up 16px from everything else), `lineHeight` (React Native leaves it unset at
~1.15×, which was the single largest cause of the cramped feel), and `chartColors`.

The rebuild keeps all of this and extends it: a fourth token group (`type`), new primitives
(`AppBar`, `Eyebrow`, `Meander`, `Fluting`, `StatCard`, `Timer`, `ProgressBar`), and three changes to
existing ones — `Field` gains a focus state, `Notice` moves from a full border to a 3px left rule over
a 10% tint, `Divider` gains a vertical orientation, and `Button`'s danger variant becomes outlined.
Details in `docs/09-ui-rebuild-plan.md`.

### Screens rewritten in that pass — 3 of 16, all three now being re-done

Their **defects** are the useful part of this list: each one is a mistake the rebuild must not
reintroduce on 22 screens.

- **`app/(tabs)/alarms.tsx`** — the "bad ui" the user named. It had light-theme hex on a dark
  scene, so the title and every reminder's time rendered **black on near-black**; it duplicated the
  native header's title; and its time field used `keyboardType="numbers-and-punctuation"`, which is
  iOS-only, so on Android there was no colon key and the field could not be filled. Now: one
  `FlatList` with the runtime notice and form as its header, a day-of-week picker, a per-row
  `isActive` Switch (the DB layer already supported it), a delete confirmation, "Saved, not
  scheduled" on any row the OS never took, and digit-only time entry.
- **`app/(tabs)/wallpaper.tsx`** — same invisible-text problem, plus it spun forever when sync was
  unconfigured *while* showing a line of text saying sync was unconfigured, and swallowed every
  failure into that same spinner. Now four explicit states (`unconfigured`/`loading`/`ready`/
  `error`), a retry, and errors that name the step that failed.
- **`app/(tabs)/index.tsx`** (Home) — was six cards of equal weight, so a one-line navigation
  shortcut looked as important as the day's macros. Now four data cards plus a compact "More" row
  group, `chartColors` instead of hardcoded hex, `LogoLoader`, and a `Notice` when the load fails.

New pure helpers in `src/domain/reminders.ts`, all tested: `describeRepeat` (agrees with
`reminderTriggers` on the ugly case — a non-empty list with no valid day says "Never", not "Every
day"), `weekdayInitials`, `formatTimeOfDay`, `formatTimeInput`, `parseTimeOfDay`.

### Two lint rules that will bite

The repo gate is **0 errors and 0 warnings**, and this ESLint config is React-Compiler-era:

- `react-hooks/refs` rejects `useRef(new Animated.Value(0)).current` — reading a ref during render.
  `Logo.tsx` has a local `useAnimatedValue()` (`useState` with an initialiser) for this; reuse it
  rather than reinventing it. This will hit any new animated component.
- `react-hooks/set-state-in-effect` rejects calling `setState` *synchronously* inside an effect.
  That is why `wallpaper.tsx` derives its status from a result tagged with its attempt number
  instead of storing a status and setting it to `'loading'` at the top of the fetch. Setting state
  after an `await` is fine.

### What was left when this pass stopped — now folded into the rebuild

These are no longer a separate pass. Items 1–4 happen **while each module is being restyled** for the
Greek rebuild, because every one of these files is being opened anyway and a second sweep over the
same 13 files would be wasted. The lists themselves are still the checklist — keep ticking them off.
**Struck-through entries are done as of 2026-08-18.**

1. **`app/(tabs)/macros/index.tsx`**: replace its local `MACRO_COLORS` (`carbs: '#58A6FF'`,
   `fat: '#D29922'`) with `chartColors`, keeping `calories: colors.accent`. This was the file open
   when that session ended; nothing in it has been changed yet.
2. **Unguarded loaders — 13 screens, 12 left.** Every one loads with an async IIFE and no `.catch`,
   which is why one dead SQLite connection printed ~57 unhandled rejections instead of one visible
   error. Each needs the `catch` → `Notice tone="danger"` treatment now used in `index.tsx`,
   `alarms.tsx`, `wallpaper.tsx` and `tasks/index.tsx`:
   `macros/index.tsx`, ~~`tasks/index.tsx`~~, `weight/index.tsx`, `weight/goal.tsx`,
   `workouts/index.tsx`, `workouts/active.tsx`, `workouts/exercises.tsx`,
   `workouts/[sessionId].tsx`, `movement/index.tsx`, `movement/active.tsx`,
   `movement/settings.tsx`, `movement/replay.tsx`, `movement/[activityId].tsx`.
   (`tasks/[taskId].tsx` was not on the list but got the same guard, since it was open anyway.)
   (Their `requestSync(db).catch(() => {})` calls are deliberate and unrelated — sync is
   best-effort.)
3. **Full-screen `ActivityIndicator` → `LogoLoader`**: `movement/[activityId].tsx:87`,
   `movement/active.tsx:87` and `:116`. Keep `ActivityIndicator` inside `Button`, where it has to
   fit a 56px control. Neither file is touched yet — the line numbers predate the rebuild, so
   re-grep rather than trusting them.
4. **Density pass on the 12 screens still setting their own screen padding, 9 left**:
   `padding: spacing.lg` → `layout.screenPadding`, gaps → `layout.cardGap`/`layout.sectionGap`, and
   `lineHeight` on body text. `macros/index.tsx`, `macros/add.tsx`, `macros/targets.tsx`,
   ~~`tasks/index.tsx`~~, ~~`tasks/new.tsx`~~, ~~`tasks/[taskId].tsx`~~, `weight/log.tsx`,
   `weight/goal.tsx`, `workouts/active.tsx`, `workouts/[sessionId].tsx`, `movement/new.tsx`,
   `movement/settings.tsx`.
   Adopt `Layout.tsx` primitives where a screen's own container adds nothing. **Note the values
   moved** — the rebuild put `layout` on an 8px grid, so read them from the theme rather than from
   this list.
5. Re-run `npm run typecheck` and `npm run lint` after every module, then have the user run
   `npm test`.

Two things the tab bar does **not** need: `alarms` and `wallpaper` are already `href: null` with
six visible tabs, and both are reachable from Home's "More" rows. No navigation restructure. (The
rebuild renames that row group THE OUTER WARD and hangs the Pantheon and Annals off it.)

### Working tree — branch `phase_3`, that pass is now committed

All of the 2026-08-17 work is committed (`791a588`, `493da42`, `e78fcea`), including
`apps/mobile/assets/`, `apps/mobile/scripts/`, `apps/mobile/types/assets.d.ts` (declares `*.png` as
`number`, without which the asset imports fail typecheck — nothing in `node_modules` provides it),
`src/components/Layout.tsx`, and `src/components/Logo.tsx`. The 30 Stitch designs under `media/`
landed separately in `e164a93`. HEAD was `92c21da` on 2026-08-18. The "nothing is committed"
warning that used to be here no longer applies.

As of 2026-08-18, **nothing from the rebuild is committed** and the working tree carries all of it.
Two things about its shape, both worth knowing before running any git command:

- **Part of it is already in the index** (`git add` was run at some point, not by a commit): the
  rebuild's docs, `apps/mobile/package.json` + `package-lock.json`, `src/theme/index.ts`,
  `src/components/{Button,Checkbox,Logo}.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, and
  `app/(tabs)/index.tsx`. `src/components/Layout.tsx` is **`MM`** — staged *and* further modified
  since. The tasks module, `src/domain/tasks.ts` and its test are unstaged, as is the
  `ui_rebuild_stitch_prompt.md` deletion. `git status --short` is the only trustworthy account;
  `git diff` alone hides the staged half (use `git diff HEAD`).
- **Do not commit or amend unless the user asks.** That includes not "tidying" the index.

One question is still open from before this work: `npx expo install --check` reported four packages a
patch behind (`expo-location`, `expo-notifications`, `expo-router`, `expo-task-manager`). The
recommendation was to leave them — nothing observed traces to those versions — and the user has not
decided. `node_modules` has since been reinstalled from scratch by the Cinzel install, so it is worth
re-running `--check` to see whether the drift is still the same four.

## Shared SQLite connection — 2026-08-17

Once the app rendered, a second physical run produced ~57 identical unhandled rejections:

```
Call to function 'NativeDatabase.prepareAsync' has been rejected.
→ Caused by: java.lang.NullPointerException
```

**Read that signature precisely: it means the native database peer was destroyed while JS still
believed the connection was open.** Proven from `node_modules/expo-sqlite`'s Android source rather
than inferred:

- `SQLiteModule.closeDatabase` sets `isClosed = true`, and every entry point calls
  `maybeThrowForClosedDatabase` first. An ordinary close therefore reports
  `AccessClosedResourceException`, **never** an NPE.
- `NativeDatabaseBinding.close()` is `mHybridData.resetNative()`, which destroys the C++ peer.
  fbjni then throws a bare `NullPointerException` for any later call on that object.
- The only path that resets the peer *without* setting `isClosed` is
  `NativeDatabase.sharedObjectDidRelease()` → `this.ref.close()`, which fires when a **JS handle
  is garbage-collected**.
- `SQLiteModule.kt`'s `NativeDatabase` constructor returns a **cached** native database for a
  matching path + options (`findCachedDatabase { … && !options.useNewConnection }`), bumping a
  reference count. So two JS handles can share one native peer, and the reference count guards
  `closeAsync` but cannot guard the garbage collector.

Kairo's trigger was `src/services/movementTracking.ts`: `processLocationBatch` opened
`openDatabaseAsync(DATABASE_NAME)` and closed it in a `finally` **on every GPS batch**. That open
returned the `SQLiteProvider`'s own native database; when the extra JS handle was later collected,
it destroyed the peer every screen was still using, and the whole app's SQLite access died at an
unpredictable moment shortly after tracking started — permanently, with no error surfaced to the
user. The same call also re-ran the entire `migrate()` roughly every three seconds.

It now opens **one** connection per process, with `useNewConnection: true` so the cache is bypassed
and the handle owns its own peer, held at module scope so it is never collected, migrated once, and
never closed. WAL (set by `migrate`) is what makes a second writer safe, and calling `migrate` on
it also applies the per-connection `PRAGMA foreign_keys = ON`.

The rule: **never call `openDatabaseAsync(DATABASE_NAME)` with default options.** Screens take the
handle from `useSQLiteContext()`; anything outside the React tree opens with
`useNewConnection: true` and does not close it.

Related: every screen loaded with `query().then(setState)` and no `.catch`, which is why one dead
connection printed ~57 unhandled rejections instead of one visible error. Fixed on Home, reminders,
wallpaper and both tasks screens; **12 screens still unguarded** — the list is item 2 under "What was
left when this pass stopped" above, and the fix happens as each module is restyled for the rebuild.

## Expo Go runtime gate — 2026-08-17

The first Expo Go LAN run on a physical Android device never rendered a single screen. The ~22
Metro lines the user reported came from **three** app-level root causes plus two environment
items; everything else was downstream noise.

**1. `expo-notifications` cannot be imported in Expo Go on Android — and it took the whole app
down.** Its barrel entry has a module-scope side effect (`DevicePushTokenAutoRegistration.fx`)
that registers a device-push-token listener as the module evaluates, and that listener *throws*
on Android in Expo Go because SDK 53 removed remote notifications from it. `app/_layout.tsx`
imported it at line 12, so the root layout never finished evaluating. Expo Router reported the
casualty as `Route "./_layout.tsx" is missing the required default export`, and rendering died on
`Cannot read property 'ErrorBoundary' of undefined` — the exported `ErrorBoundary` cannot catch a
throw in its own module. `src/db/alarms.ts` imported it too, which is why `./(tabs)/alarms.tsx`
warned as well. Read the repeated identical errors as *one* failure re-thrown from Metro's module
cache, not eight.

**2. `expo-media-library`'s default entry is wrong twice over.** It resolves the
`ExpoMediaLibraryNext` native module at module scope, which Expo Go does not ship — hence
`Cannot find native module 'ExpoMediaLibraryNext'` and a dead `wallpaper.tsx` route. In SDK 57
that entry's `saveToLibraryAsync` is also a deprecated stub that *throws* and tells you to import
from `expo-media-library/legacy`, so Save to Photos could not have worked in a development build
either. The legacy entry needs only the older `ExpoMediaLibrary` module and is where
`saveToLibraryAsync` still lives.

**3. Two smaller defects found in the same code.** `deleteAlarm` awaited
`cancelScheduledNotificationAsync` without a catch, so a schedule the OS had already dropped
would reject and abort the `DELETE`, leaving a row the user could not remove. And the alarms
screen validated `hour > 23` without a lower bound, so `-1:00` passed the screen and hit the
`alarms` CHECK constraint as an unhandled rejection.

**Environment, not app**: the React Native DevTools `chrome-sandbox` SUID error (affects only the
`j` debugger; `chown root` + `chmod 4755` fixes it) and one `npm ETIMEDOUT` fetching
`expo-doctor`, which passed 21/21 on the retry. Both are documented in `personal_test.txt`.

### The fix: capability tiers, required lazily

The rule this establishes, and the reason `src/services/runtime.ts` exists: **a native package
Expo Go may lack is never imported at module scope.** A static import is hoisted past every
guard, and its failure is not a degraded feature — it is a dead route, reported as a missing
default export.

| File | Role |
|---|---|
| `src/services/runtime.ts` | `IS_EXPO_GO` (`Constants.executionEnvironment === 'storeClient'`), moved out of `movementTracking.ts` and re-exported from it so `movement/new.tsx` is untouched |
| `src/services/notifications.ts` | `notificationsMode()` → `full` \| `local-only` \| `unavailable`, plus `configureNotificationHandler`, `scheduleReminder`, `cancelReminder` |
| `src/services/mediaLibrary.ts` | `mediaLibraryAvailable()` and `saveImageToLibrary()` over `expo-media-library/legacy` |
| `src/domain/reminders.ts` | pure `reminderTriggers` — the daily-versus-weekly decision and weekday validation |

`notificationsMode()` resolves once, lazily, through three tiers: the public barrel (development
builds, production, and Expo Go on **iOS**, where it only warns); the deep local-only modules
(`expo-notifications/build/{NotificationPermissions,scheduleNotificationAsync,cancelScheduledNotificationAsync,NotificationsHandler}`)
for Expo Go on Android, which do not pull the push side effect in and still schedule local
reminders; then `unavailable`. The deep paths are private API reached through a try/catch
`tryRequire`, so a future SDK restructuring `build/` degrades to a banner rather than a crash —
the exact failure this module exists to prevent. `expo-notifications` has no `exports` map today,
which is what makes the subpaths resolvable.

**Metro resolves `require()` at build time, so the path must be a literal.** The first version of
this module passed the path as a parameter (`require(request)`), which is not a runtime failure but
a *bundling* failure — `Invalid call at line 70: require(request)`, thrown by
`metro-transform-worker`, taking down the whole bundle rather than one route. Each path is now
written out at its own call site and handed over as a thunk (`tryRequire(() => require('…'))`);
the laziness was always in the closure, never in the dynamic path, so the tiers are unaffected.
Anything added here must keep the literal, and the five deliberate requires sit inside one scoped
`eslint-disable @typescript-eslint/no-require-imports` pair (that rule is `warn`, and the repo gate
is zero warnings).

Behaviour that follows from it:

- **Rows always save.** `scheduleReminder` returns `null` for an unavailable runtime, a denied
  permission, or a row whose time/weekdays do not describe a schedule; `createAlarm` stores
  `notification_id = NULL` and keeps the row, so the reminder starts working once the missing
  piece is in place. `src/db/alarms.ts` no longer mentions `expo-notifications`.
- **The reminders screen states the runtime.** A muted line for `local-only`, an amber notice for
  `unavailable`, and "Saved, but not scheduled" when a working runtime denied permission — the
  case that otherwise looks like a silent no-op.
- **The wallpaper screen offers Save to Photos only when it can.** Otherwise "Preview only".
  `saveImageToLibrary` returns `saved` / `permission-denied` / `unavailable` instead of throwing,
  because those are three different messages to the user.
- **An empty `repeatDays` means daily** (the screen's contract). A non-empty list whose weekdays
  are all invalid schedules *nothing* rather than falling back to daily — firing seven times a
  week is a worse answer than not firing. Weekdays here are `1`–`7` (Sunday first), which is
  `getDay() + 1`, **not** the `getDay()` numbering `src/domain/tasks.ts` uses.

Verified this session: `npm run typecheck` clean, `npm run lint` clean, and
`npm test -- --runInBand` → **394 passed across 20 suites** (up from 376/18; new suites
`src/domain/__tests__/reminders.test.ts` and `src/db/__tests__/alarms.test.ts`, the latter
mocking `@/services/notifications` to pin that rows persist when scheduling is unavailable and
that deletion works for a row that was never scheduled). The Android/iOS exports and
`expo-doctor` were **not** re-run after these edits, and no physical-device result has been
returned yet — the user is running the checks themselves.

**Expo Go now bundles and launches.** `npx expo start --go --lan -c` reached
`Android Bundled 68023ms node_modules/expo-router/entry.js (1741 modules)` with no
`expo-notifications` error, no missing-default-export warning, and no `ExpoMediaLibraryNext`
error. The one remaining `WARN` — Expo Go "can no longer provide full access to the media
library" — is emitted by the **Expo Go client's own native code** (the string appears nowhere in
`node_modules`), which is positive evidence that `expo-media-library/legacy` bound to a native
module that is actually present. `mediaLibraryAvailable()` therefore returns true in Expo Go and
the Save button renders; whether the file reaches the gallery is still the device check.

Still device-gated, unchanged: everything in the Phase 3 native list below, plus reminder
delivery and Save to Photos, which now need a development build to be *proven* rather than a
development build to avoid crashing.

## Phase 3 implementation checkpoint — 2026-08-16

Phase 3 is now explicitly Kairo-owned GPS tracking, not Strava or another provider import.
The locked plan is in `docs/08-phase-3-movement-plan.md`: run/walk/ride, Android-first native
spike with iOS designed in, live map, background tracking, pause/autopause, default-on time
and distance voice cues, shared units, indefinite raw-point retention with edit revisions,
route replay, and Kairo backend upload only after completion.

Implementation is complete through the executable mobile/backend layers. Mobile schemas v7–v9
cover activities, raw points, lifecycle events, durable engine state, and reversible raw-point
edit exclusion. Expo Location, Task Manager, Speech, and React Native Maps are installed at
SDK-compatible versions. The module-scope background task opens/migrates the same SQLite
database, recovers active state, processes location batches, and persists points atomically
with summaries. Expo Go has a foreground `watchPositionAsync` fallback for today's UI testing;
background/screen-lock behavior still requires a custom Android development build.

Schema v8 stores autopause candidate timestamps and next voice-cue thresholds per active
activity. Movement settings expose metric/imperial units, default-on voice cues with separate
distance/time toggles, and autopause. The background task evaluates those settings, persists
autopause/voice events in order, and invokes local speech. Native voice behavior still needs
physical Android testing, especially with the screen locked and Bluetooth audio.

The first Movement UI is also wired: a sixth bottom tab, run/walk/ride readiness and
permission flow, live map with persistent recording, pause/resume and finish, completed
history/detail, and offline animated route replay with normalized 1x/2x/4x/8x speeds. The
live view now respects the shared metric/imperial preference, shows run/walk pace or ride
speed, separates moving and elapsed time, displays autopause explicitly, and lets the user
pan before recentering. Replay uses the same unit preference and a responsive scrubber.
Schema v8 recovery and default-on preference behavior have direct SQLite-backed tests. Schema
v9 adds trim/recompute persistence without deleting raw points. Completed activities enqueue a
movement aggregate only after completion; later edits enqueue higher revisions and deletes enqueue
idempotent removal. Backend migration `7e3b9a1c2d44` provides authenticated movement upload,
list/detail, revision replacement, ownership isolation, and replay-safe deletion.

Automated verification is green: mobile typecheck/lint, **376 tests across 18 suites** at this
checkpoint (**394 across 20** after the 2026-08-17 Expo Go fix above), backend
Ruff, **28 backend tests**, Alembic at head, Expo Doctor **21/21**, and Android/iOS exports.
Physical-device results have not yet been provided by the user. Background location, screen lock,
foreground-service notification, force-kill recovery, Bluetooth speech, battery use, and iOS
native behavior remain acceptance gates. `personal_test.txt` is the current Phase 2/3 runbook.

## Status

Phase 0 (monorepo scaffold) and all four Phase 1/P0 modules — **workout logging**,
**weight/progress charts**, **daily tasks & streaks**, and **macro/nutrition tracking** —
are implemented and verified.

Phase 1/P0 is now complete as a coherent daily app: Home aggregates all four local modules.
The full manual device smoke test is complete, including the Today/tasks workflow, locale
decimal inputs, and real bottom-tab icons. **Phase 2 is complete**: authenticated replay for
workouts, weight, tasks, and nutrition; deterministic motivation; Pillow wallpapers; and
local daily/weekly reminders are implemented and verified.
Sync is opt-in through Expo public configuration; without it the app stays fully offline.

**Git branch strategy**: `phase_1` preserves the completed Phase 1 snapshot at `ea80c37`;
`phase_2` preserves the Phase 2 slice. Active work lives on **`phase_3`**, and `master` is
**no longer** at the Phase 1 snapshot — it has been advanced through pull requests (`origin/master`
was at `1df12bc`, "Merge pull request #12 from Daboggieman/phase_3", on 2026-08-18). Two branches
of the same name can therefore disagree: local `master` lagged `origin/master` at that point.
Confirm the real state with `git status --short`, `git log --oneline -5`, and
`git rev-list --left-right --count origin/master...HEAD` rather than trusting this paragraph —
the user pushes and merges outside these sessions, so any commit list here dates the moment it
was written.

The last recorded commits, newest first — the top three are the 2026-08-18 rebuild groundwork,
the rest are Phase 1/2 history:

| Commit | What |
|---|---|
| `92c21da` | Merge `phase_3` from the remote into local `phase_3` — HEAD on 2026-08-18 |
| `e164a93` | The 30 Stitch UI/UX designs under `media/stitch/` |
| `e78fcea`, `493da42`, `791a588` | The partial restyle, frontend remodel, and database-schema fixes |
| `af5b2da` | Complete workout replay, quotes, Pillow wallpapers, local reminders, tests, and docs |
| `ea80c37` | Confirm physical-device retest for locale decimals and final tab icons |
| `77d4016` | Locale-safe numeric parsing, real tab icons, regression tests and manual findings |
| `b08aabf` | Macro/nutrition v4 storage and UI, Home dashboard composition, tests, and handoff |
| `44c140d` | `refactor(dates)` — extract `src/domain/dates.ts`, fix two UTC/local window bugs in weight |
| `9d641d3` | `feat(tasks)` — the whole tasks module, migration v3, three screens, 97 new tests |
| `984901c` | `docs` — tasks-module handoff |

Two corrections that were made to this file during the Phase 2 session, kept because the second
one is still in force:

- The "Unpushed / credential helper has no usable credentials" paragraph was **resolved**:
  `origin/master` and `HEAD` were level at the start of *that* session, so the earlier work had
  been pushed. Do not read it as current — on 2026-08-18 the two had diverged (1 behind, 3 ahead).
- Git identity is configured **repo-local** as `Daboggieman` / `adaraph722@gmail.com`
  because this environment could not see the previous global identity when creating the
  Phase 2 commit.

## What is done and verified

### Backend — Phase 2 auth, replay, and motivation
`apps/backend/`, FastAPI + SQLModel + Alembic. Portability decision from an earlier
session: models use portable SQLAlchemy types so everything runs on SQLite locally, with
Postgres as the deployment target.

- Alembic migrations through `4d91e2f7c3ab` apply cleanly against SQLite. Workout and
  motivation endpoints use the existing reference schema; mobile reminder state is local
  schema v6 rather than a server migration.
- `pytest -q` → **24 passed** (auth, health/OpenAPI, authenticated workout lifecycle,
  cross-user isolation, weight/task/nutrition sync).
- `ruff check .` → **All checks passed!** (select E, F, I, UP, B; B008 `Depends`/`Query`
  exempted via `extend-immutable-calls`).
- `POST /auth/token` exchanges the configured device key for access/refresh JWTs;
  `POST /auth/refresh` rotates the pair. PyJWT performs HS256 claim/signature validation.
- All workout endpoints now require bearer auth. Workout creation derives `user_id` from the
  token, and list/detail/update/set writes hide rows belonging to another user.
- Body weight has authenticated create/list/delete endpoints. POST preserves the client UUID,
  treats identical replay as success, returns `409` for conflicting reuse, and normalizes
  offset timestamps to UTC before comparison/persistence.
- Tasks and completions have authenticated create/list/update/delete endpoints. Task POST replay
  preserves the client UUID; completion replay is idempotent by `(task_id, completed_date)`;
  archive/restore and clear operations are replay-safe. Streaks remain derived.
- Nutrition has authenticated owned-food, entry, and target endpoints. Food and entry UUIDs
  replay idempotently; target PUT updates the effective-date row; entry deletion is idempotent.
- `alembic/env.py` reads `DATABASE_URL` from `app.core.config` (single source of truth).
- Workout sessions accept client UUIDs; sets preserve client UUIDs, resolve mobile seeded
  exercise IDs, return success for exact replay, and return `409` for conflicting reuse.
- `GET /api/v1/quotes/today?day=` returns a stable deterministic quote. The mobile app has
  an offline quote catalogue and Home widget. `POST /api/v1/wallpapers/generate` returns a
  validated 1080x1920 PNG as base64; the mobile wallpaper screen previews and saves it.

Workout, weight, task, and nutrition sync are implemented end to end when configured. Quotes,
Pillow wallpapers, and local daily/weekly reminders are also complete.

## Final Phase 2 verification (historical, commit `af5b2da`)

- Backend: `ruff check .` clean; `pytest -q` **24 passed**; `alembic upgrade head` reaches head.
- Mobile: `npm run typecheck` clean; `npm run lint` clean; `npm test -- --runInBand`
  **350 passed across 16 suites** at the Phase 2 commit. The current Phase 3 count is recorded
  at the top of this handover.
- Workout replay preserves client session/set IDs, accepts mobile seeded exercise IDs, and
  rejects conflicting ID reuse with `409`.
- Quotes are deterministic by calendar day; wallpaper tests decode a nonblank 1080x1920 PNG.
- Reminders persist in mobile schema v6 and schedule daily or selected-weekday notifications.

### Phase 2 implementation map

| Area | Backend | Mobile | Verification |
|---|---|---|---|
| Workout replay | `app/api/workouts.py`, workout schemas | `db/workouts.ts`, `db/outbox.ts`, `sync/outbox.ts` | `test_workouts.py`, outbox suite |
| Quotes | `app/api/motivation.py` | `domain/motivation.ts`, Home | `test_motivation.py`, motivation suite |
| Wallpapers | Pillow route in `app/api/motivation.py` | `app/(tabs)/wallpaper.tsx`, `src/services/mediaLibrary.ts` (legacy media-library entry), file system package | PNG decode test, Android export |
| Reminders | Deliberately device-local | `db/alarms.ts`, `src/services/notifications.ts`, `src/domain/reminders.ts`, schema/migration v6, `app/(tabs)/alarms.tsx` | `src/db/__tests__/alarms.test.ts`, `src/domain/__tests__/reminders.test.ts`; delivery still requires a device |

The Android `dist/` directory is a generated, ignored build artifact and is not part of the
source commit. Re-run the export when validating a fresh checkout.

### Mobile — implemented and verified
`apps/mobile/`, Expo SDK 57 + Expo Router (file-based) + expo-sqlite + Zustand.

Verified after the completed Phase 2 implementation:

- `npm run typecheck` (`tsc --noEmit`) → **0 errors**.
- `npm run lint` (`eslint .`) → **clean**, 0 errors 0 warnings.
- `npm test` → **350 passed across 16 suites**. The new suites cover durable outbox storage,
  atomic rollback, weight/task/nutrition wire payloads, auth refresh, ordered replay, backoff,
  and terminal errors.
- `npx expo-doctor` started all 21 checks, but this runner did not return its final summary;
  rerun it in an interactive shell before treating Doctor as a release gate.
- `npx expo export --platform android` → successful; the generated `dist/` bundle is present
  for inspection.

Module flows that work:

- **Home**: one focus-time load reads tasks, nutrition, weight, workout history, and any
  active session together. It shows unfinished tasks in priority order, macro progress,
  the smoothed weight trend and 30-day change, and active/recent workout status. Each section
  opens its owning module; an active workout goes straight to Resume.
- **Workouts**: Home → Workouts history → Start/Resume → pick exercise (modal library,
  seeded 30 exercises, search + add-custom) → weight/reps pre-filled from last time
  (`suggestNextSet`) → log sets (writes through to SQLite immediately) → rest timer
  (derives from a stored epoch-ms start) → Finish → detail screen. Force-kill survival:
  `hydrate()` on History focus re-reads an unfinished session so "Resume" appears instead
  of starting a duplicate.
- **Weight**: Home → Weight → trend chart (7-day moving average in accent over raw daily
  readings in grey, optional dashed goal line, 90-day window) → "Log weight" modal
  (pre-filled from the last entry so the unit cannot silently switch) → back to the trend,
  which reloads on focus. Goal weight is a second modal; long-press a history row to
  delete. No Zustand store — the screens read SQLite directly, since there is no
  cross-screen in-progress state the way an active workout has.
- **Tasks**: Home → Today tab → tick habits off, or open one for its streak history.
  Detail below.
- **Macros** (new): Home → Macros → browse the day log, move backward through previous days,
  inspect calorie/protein/carbs/fat progress, add a saved or custom food with a serving
  quantity and meal, or edit effective-dated targets. Entries are grouped by meal and can be
  deleted with a long press. Detail below.
- **Motivation**: Home shows the deterministic local quote for the current calendar day.
  The Wallpaper action authenticates when sync configuration exists, asks the Pillow API for
  a 1080x1920 PNG, writes it to cache, previews it, and saves it after Photos permission.
- **Reminders**: Home → Reminders → add or edit a label/time and optional weekday selection.
  Empty weekday selection means daily. Rows can be reopened for editing or deleted; updates
  cancel old native schedule IDs before creating replacements.

## Manual findings resolved after the first device run

The device run reported two defects outside the fully passing Today/tasks workflow:

- **Locale decimal input**: `Number.parseFloat` treated `1,5` as `1`, silently changing
  macro quantities and decimal weight values. `src/domain/numbers.ts` now parses dot, comma,
  and Arabic decimal separators with strict validation. Macro add/target fields, weight log,
  weight goal, and active-workout weight all use it. Mixed or malformed values are rejected
  instead of partially saved.
- **Bottom-tab icons**: the tab layout now uses Material Community Icons for Home, Today,
  Macros, Workouts, and Weight. `@expo/vector-icons` and its required `expo-font` peer/config
  plugin are declared directly.

The focused device retest passed:

1. Create Chicken breast (165 kcal, 31 g protein, 0 g carbs, 3.6 g fat per 100 g), enter
   quantity `1,5` (or the device's decimal separator), and verify the underlying `247.5 kcal`
   contribution (displayed as approximately `248 kcal`), `46.5 g` protein, `0.0 g` carbs,
   `5.4 g` fat, plus a `1.5 × 100 g` serving row.
2. Log weight `75,5` and verify the stored/displayed value is `75.5`, then compare Home's
   value with the smoothed Weight trend after multiple dated entries.
3. Log an active-workout set at `62,5` and verify the set displays/stores `62.5`.
4. Enter decimal values in macro targets and the weight goal and verify save, reload, and
   validation behaviour.
5. Confirm all five bottom tabs show real icons rather than placeholder rectangles.

All five checks passed on the physical device. The decimal-input and icon findings are closed.

The physical migration scenario was not available on this device because it had no prior
Kairo data; the populated v3-to-v4 migration remains covered by the automated SQLite suite.

## The tasks module

### Files

| Path | Role |
|---|---|
| `src/db/schema.ts` | `CREATE_TASKS`, `CREATE_TASK_COMPLETIONS`, `CREATE_TASK_INDEXES`; introduced by schema v3 |
| `src/db/migrations.ts` | migration `version: 3` appended |
| `src/db/types.ts` | `TaskRow`/`Task`, `TaskCompletionRow`/`TaskCompletion`, `toTask`, `toTaskCompletion` |
| `src/domain/dates.ts` | shared calendar-day helpers (extracted, see below) |
| `src/domain/tasks.ts` | 434 lines, pure — recurrence parsing, streak walks, history grid |
| `src/db/tasks.ts` | 204 lines, 11 query functions |
| `src/components/Checkbox.tsx` | presentational tick box |
| `app/(tabs)/tasks/_layout.tsx` | Stack: `index`, `new` (modal), `[taskId]`; `headerShown: false` since the rebuild |
| `app/(tabs)/tasks/index.tsx` | the Today list — **The Rites** since the rebuild |
| `app/(tabs)/tasks/new.tsx` | add-task modal — **The New Rite** |
| `app/(tabs)/tasks/[taskId].tsx` | streak detail + history grid — **The Flame** |
| `app/(tabs)/_layout.tsx` | `Tabs.Screen name="tasks"` added between Home and Workouts |
| `app/(tabs)/index.tsx` | Home gained a "Today" card |

Tests: `src/domain/__tests__/tasks.test.ts` (606 lines, 68 cases),
`src/db/__tests__/tasks.test.ts` (461 lines, 29 cases),
`src/domain/__tests__/dates.test.ts` (115 lines, 12 cases).

### Schema (migration v3)

```sql
tasks(id PK, user_id, title, recurrence_rule DEFAULT 'daily', created_at, archived DEFAULT 0)
task_completions(id PK, task_id → tasks(id) ON DELETE CASCADE,
                 completed_date, completed_at, UNIQUE (task_id, completed_date))
```

Decisions embedded there, each of which a future change should argue with rather than
quietly reverse:

- **No materialised `Streak` table**, though `02-data-model.md` floats one. Streaks are
  derived from the completion rows. For one user with tens of habits the walk is trivial,
  and a stored counter is a second source of truth that drifts the moment a completion is
  deleted or arrives out of order over sync.
- **The UNIQUE constraint is the point of the table.** A habit is either done today or it
  is not, so a double-tap must not log it twice and inflate a count. That is what lets
  `setCompletion` be a plain `INSERT OR IGNORE`, makes `toggleCompletion` idempotent, and
  makes a replayed Phase 2 sync event harmless.
- **`completed_date` (local `YYYY-MM-DD`) and `completed_at` (the instant) are separate** —
  the same split as `body_weight_entries`, for the same reason: the day is what the streak
  counts, the instant is worth keeping.
- **`recurrence_rule` is stored as opaque text**, not normalised into flag columns, so
  Phase 2 sync moves one value rather than reconciling a set.

### The recurrence rule

A compact hand-rolled string, not an RRULE:

```
daily | weekdays | weekends | weekly:1,3,5 | interval:3
```

(`weekly:` takes `getDay()` numbers, Sunday `0`. `interval:n` counts from the task's
creation day.) `02-data-model.md` suggests "daily/weekdays/custom RRULE", but a full RRULE
parser is a dependency and a large surface for a habit list whose realistic vocabulary is
those five shapes. **`parseRecurrence` is the contract**: an unrecognised, malformed or
empty rule falls back to `daily` rather than throwing, because a corrupt row should not take
the Today list down with it. The add-task screen builds custom rules through
`formatRecurrence` so it cannot invent a rule the parser rejects — that round trip is tested.

### Streak semantics — read this before changing the walks

One function, `isScheduledOn(recurrence, day, anchorDay)`, decides whether a task was due on
a day, and **both** streak walks obey it. It returns false for any `day < anchorDay`. The
consequences are deliberate:

- **Completions on unscheduled days are bonus work.** Ticking a weekdays habit off on a
  Sunday does not extend the streak and cannot bridge Friday→Monday, because the walk only
  ever looks at scheduled days. There is a test that asserts the with-bonus and without-bonus
  answers are identical.
- **A completion dated before the task existed is ignored** by both walks — reachable from an
  edited row or a clock change. `longestStreak` used to start its walk at
  `Math.min(anchorDay, min(completedDays))`, which was dead code (`isScheduledOn` rejects
  those days anyway) and read as though it did something. It now starts at `anchorDay`, and
  the test asserts both walks agree at 0 rather than blessing a special case.
- **`currentStreak` grants today a grace day**: if today is scheduled and not yet done, the
  walk starts from yesterday, so an unfinished today neither counts nor breaks. A weekdays
  streak therefore survives the weekend — the case `04-feature-specs.md` names explicitly,
  and it is tested.
- **`longestStreak` grants no grace day.** An open today simply ends the run being measured;
  the best already recorded stands.

`HistoryState` has five values on purpose: `done | missed | pending | unscheduled | future`.
`pending` exists so an unfinished *today* does not render as a rest day or as a miss.
`[taskId].tsx` keys its cell colours with `Record<HistoryState, ViewStyle>`, so adding a
sixth state fails to compile until it has a colour.

### Query layer notes

`completionDatesByTask(db, userId)` is **deliberately unbounded** — no `LIMIT`. A row limit
would spend the whole budget on whichever task sorted first and report every other task as
streakless, which looks exactly like lost data. If it ever does need bounding, bound it by
*date* (`completed_date >= ?`), never by row count. The same comment is in the source.

`toggleCompletion` is `clearCompletion` then `setCompletion`, returning the state it landed
in (`true` = now complete). `clearCompletion` reports `result.changes > 0` so the toggle can
branch on it.

`listTasks(db, userId, includeArchived = false)` orders `created_at ASC`. Archived tasks keep
their completions and their `created_at`, so restoring one restores its streak — tested.

### Screen notes

- The Today list is a `ScrollView`, not a `FlatList`. The list is bounded by how many habits
  a person keeps; virtualisation would cost more than it saves.
- `index.tsx` loads `listTasks` + `listArchivedTasks` + `completionDatesByTask` in one
  `Promise.all` inside `useFocusEffect`, and **refreshes `nowMs` in the same `load()`** so
  the list and the data always describe the same day. A phone left open overnight otherwise
  renders yesterday's schedule against today's completions.
- Toggling reads the **wall clock** (`new Date()`), not the captured `nowMs`, so a tick at
  00:01 lands on the correct day even if the screen was loaded before midnight.
- `[taskId].tsx` is a one-shot `useEffect` load rather than a focus effect (the screen is
  pushed fresh each time); `load()` *returns* its data instead of setting state, so a late
  result can be dropped by the cancelled flag.
- Three stats on the detail screen — current, longest, and last-30-days as a rate — because
  a current streak alone is brittle to be judged on. 27 of 30 with yesterday missed reads as
  a streak of 1, and only the other two numbers say the user is doing well.

## The macros module (new this session)

### Files and shape

| Path | Role |
|---|---|
| `src/db/schema.ts` | `food_items`, `nutrition_entries`, `macro_targets`, indexes; `SCHEMA_VERSION = 4` |
| `src/db/migrations.ts` | append-only migration `version: 4` |
| `src/db/types.ts` | food, entry, target row/domain types and mappers |
| `src/domain/macros.ts` | pure serving math, daily totals, target comparison, meal grouping |
| `src/db/macros.ts` | food search/create, day log CRUD, effective target queries |
| `app/(tabs)/macros/index.tsx` | day navigation, progress bars, meal groups, entry deletion |
| `app/(tabs)/macros/add.tsx` | food search, custom food creation, quantity and meal selection |
| `app/(tabs)/macros/targets.tsx` | effective-dated calorie/protein/carbs/fat targets |

Tests: `src/domain/__tests__/macros.test.ts` (14 cases) and
`src/db/__tests__/macros.test.ts` (20 cases), including a populated v3→v4 migration test
and a real-query-output-to-domain-summary integration case.

### Decisions embedded in migration v4

- **Personal food library, no licensed nutrition dataset.** `food_items` belongs to a user
  and stores nutrition per a human-readable serving (`100 g`, `one scoop`, etc.). Search is
  case-insensitive substring matching over saved foods; `%` and `_` are literal because the
  query uses `instr`, not `LIKE`.
- **Quantity is a serving multiplier.** The food definition remains reusable, while each
  `nutrition_entry.quantity` records `0.5`, `1`, `1.5`, etc. Pure domain math multiplies all
  four nutrients by it.
- **`logged_date` and `logged_at` are separate.** The day log reads the local `YYYY-MM-DD`;
  the instant records when the entry was added. This follows tasks and weight rather than
  deriving a local date inside SQL.
- **Targets are effective-dated.** Saving on a new date creates a new target; saving again on
  the same date updates that row. A historical day uses the newest target whose
  `effective_date <= logged_date`, so changing today's plan does not rewrite old progress.
- **Food deletion is deliberately absent.** Entries reference a food definition without a
  cascade. The v1 UI can delete a mistaken day entry, but it cannot orphan years of history
  by removing a library item.
- **Progress uses bars rather than rings.** `04-feature-specs.md` explicitly permits
  ring/bar. Bars render all four metrics legibly in a compact mobile panel with no further
  chart dependency. The drawn fill caps at 100%, while consumed totals and negative
  remaining values still preserve over-target information.
- **User ownership is enforced on writes.** `addNutritionEntry` uses `INSERT … SELECT` from
  a food row scoped to the same `user_id`; a guessed food id from another future account
  cannot be attached to the current user's log.

## The Home dashboard (new this session)

### Files and shape

| Path | Role |
|---|---|
| `src/domain/dashboard.ts` | pure cross-module composition; delegates calculations to each module |
| `src/domain/__tests__/dashboard.test.ts` | 10 cases covering schedules, streak risk, macros, trend weight, workout priority, empty state |
| `app/(tabs)/index.tsx` | the actual daily dashboard, replacing the launcher and `UPCOMING` list |

No schema, store, or dashboard-specific persisted state was added. Home is a read model over
the module tables, so it cannot drift from the screens it summarizes.

Decisions worth keeping:

- **One focus-time `Promise.all`.** The dashboard captures `nowMs`, derives the local day,
  and reads all modules together. Returning from a logging modal updates Home immediately,
  and a phone left open across midnight moves every section to the new day together.
- **Existing domain functions remain authoritative.** Tasks route through
  `splitByDueToday`, macros through `summariseMacros`, and weight through
  `dailyWeights`/`movingAverage`/`summarise`. Home does not carry simplified copies of
  streak, target, or calendar-window logic.
- **Unfinished tasks only in the preview.** At most three are shown, in the exact priority
  order the Today screen uses. Due/done/at-risk counts still cover the whole day.
- **Trend weight, not the latest raw reading.** The dashboard follows the weight module's
  product decision instead of reintroducing daily scale noise on the first screen.
- **Active workout wins.** An open session changes the card action to Resume and routes
  directly to the active screen; otherwise the most recent completed session is summarized.
- **Late reads are dropped.** The focus effect applies its result only if Home is still
  focused, so navigating away during a SQLite load cannot set stale screen state.

## Decisions to know (whole project)

- **Expo Router over React Navigation** (deviation from the planning docs): routes live in
  `app/(tabs)/<module>/`, no `src/screens/` or `src/navigation/`. Documented in
  `docs/07-repo-structure.md` — keep new modules under `app/(tabs)/`.
- **Offline-first**: local writes remain authoritative. When sync configuration is present,
  weight creates/deletes are recorded in the outbox and replayed; without it the app remains
  fully offline. Seeded exercises use deterministic `seed-*` ids so sync will not duplicate
  them.
- **Single user for now**: `LOCAL_USER_ID = 'local-user'` in `src/constants.ts`, re-exported
  from `src/store/workoutStore.ts` so the existing workout screens kept working. Grep the
  constant to find everything Phase 2 auth has to touch; every row carries `user_id` from
  day one per the data model, and the queries honour it (there are tests for that, in a
  single-user app, on purpose — the filters must not be missing when sync arrives).
- **Calendar-day arithmetic lives in `src/domain/dates.ts`** (extracted
  from `domain/weight.ts` when tasks needed the same helpers — the same move `LOCAL_USER_ID`
  made). `dayKeyFromDate` is the single place the host timezone is read; `toDayKey` and
  `todayNumber` both route through it, so "the day this timestamp belongs to" and "the day
  it is now" cannot be computed two different ways. **A day is always a local calendar day**;
  a day *key* (`YYYY-MM-DD`) is parsed as UTC midnight because the timezone has already been
  resolved out of it, and re-applying an offset would shift days across a DST boundary.
- **Charting is hand-rolled** on `react-native-svg` (the only added dependency, and Expo
  bundles it). `react-native-svg-charts` peers on svg `^6||^7` against the 15.15.4 the SDK
  ships and is unmaintained since 2019; `victory-native@41` pulls Skia, Reanimated and
  gesture-handler as native deps for one line chart. Geometry lives in `src/domain/chart.ts`
  as pure functions (`seriesBounds`, `niceRange`, `project`, `linePath`, `yTicks`) — the
  degenerate cases that actually ship (one point, flat series, empty series) produce `NaN` in
  an SVG `d` attribute, which React Native reports as a render warning rather than a crash.
  Reach for the same split before adding any further chart.
- **Weight is stored as logged, normalised on read**: the row keeps the unit the user typed
  and the domain layer converts to kg, same as `workout_sets`. Derived values (goal, trend,
  deltas) are kg throughout, converted once at the display boundary. `LB_PER_KG` has one
  definition, in `src/domain/workouts.ts`.
- **Preferences are a generic key-value table** (`user_preferences`, PK `(user_id, key)`,
  upsert via `ON CONFLICT DO UPDATE`) rather than a column per setting, so the deferred
  unit-preference decision needs no further migration. `getGoalWeightKg` treats an
  unparseable value as unset rather than throwing — a corrupt preference should not break
  the screen it decorates.
- **Unit preference**: movement has one shared metric/imperial preference in
  `user_preferences`, and live/replay displays read it. Strength sets still carry their own
  logged unit, and `suggestNextSet` falls back to kg with no history.
- **A native package Expo Go may lack is never imported at module scope.** Import it lazily
  behind a capability check in `src/services/`, expose a mode/availability function, and have the
  screen say which tier it is in. A static import is hoisted past every guard, and in Expo Router
  its failure presents as "Route ... is missing the required default export" rather than as the
  native error it is — see the 2026-08-17 section above for the day that cost.
- **Greek display copy, English identifiers.** Every screen has a Greek display name — the dashboard
  is THE CITADEL, workouts THE FORGE, macros THE FEAST — but routes, tables, columns, types, stores,
  and functions keep their plain English names, because `docs/02-data-model.md`,
  `docs/03-api-design.md`, and the backend's matching routers all use them. A `domain/pantheon.ts` is
  fine — it is named after a screen that exists. Renaming `domain/tasks.ts` to `rites.ts` is not. The
  lexicon lives in `docs/09-ui-rebuild-plan.md` and nowhere else.
- **The app is dark-only and its accent is measured, not chosen.** `userInterfaceStyle` is pinned
  `dark` in `app.json` because there is no light palette; a screen that assumes a light default
  renders black on near-black, which has happened twice. `colors.accent` is the mean gold of the
  user's own artwork, computed by `scripts/generate-icons.py` — it cannot be re-picked without
  re-deriving the whole icon set.
- **Infra/CI written, not fully exercised**: Docker/Postgres and GitHub CI remain optional
  follow-up checks; they are not prerequisites for the current local movement work.

## Next session: Phase 3 physical acceptance and handoff

**Before any of this, finish the Greek UI rebuild at the top of this file.** A device run against a
half-rebuilt app produces findings that have to be re-collected afterwards. Its locked scope is
`docs/09-ui-rebuild-plan.md`; Phase 3 acceptance below is the step after it.

Do not restart the provider/integration decision. It is locked: Kairo records and owns its
movement data; there is no Strava connection, import, segment competition, social feature,
or third-party activity upload. Read `docs/08-phase-3-movement-plan.md` first for the complete
product and technical contract. Do not create or amend commits unless the user asks. Inspect
`git status --short --branch` first — as of 2026-08-18 the tree carries the rebuild's documentation
**plus the Stage 0/1 foundations and its first four rebuilt screens**, about half of it already sitting
in the index; everything else is committed. Preserve any pre-existing user changes,
especially `.devcontainer/setup.sh`.

The most useful code entry points are:

- `apps/mobile/src/domain/movement.ts` — pure GPS filtering, state transitions, timing,
  distance/pace/speed formatting, autopause, cue scheduling, and replay interpolation.
- `apps/mobile/src/db/schema.ts` and `src/db/migrations.ts` — append-only schemas v7, v8, and v9.
  v9 is defensive/idempotent because migration tests can rewind `user_version` on a current DB.
- `apps/mobile/src/db/movement.ts` — activity/point/event/history/edit queries and durable
  engine-state recovery. Point plus summary writes and event sequence allocation are
  transactional.
- `apps/mobile/src/services/movementTracking.ts` — module-scope Expo background task and
  start/stop APIs. Local SQLite is authoritative throughout an active recording.
- `apps/mobile/app/(tabs)/movement/` — readiness, active tracking, history/detail, replay,
  and settings screens.
- `apps/mobile/src/db/__tests__/movement.test.ts` and
  `src/domain/__tests__/movement.test.ts` — executable persistence and domain contracts.

The implementation is ready for a physical test run. Offer to check readiness, then direct the
user to run `personal_test.txt` themselves. Do not claim the native gate passed until the user
returns the completed checklist and device evidence. Continue in this order:

0. Relaunch Expo Go and confirm the app now renders: no `expo-notifications` error, no
   "missing the required default export" warning, no `ExpoMediaLibraryNext` error, and all six
   tabs reachable. That is the 2026-08-17 fix above, verified only by typecheck/lint/tests so
   far. Confirm too that the intro plays once, the reminders and wallpaper screens are legible
   (they were black-on-black), and no `NativeDatabase … NullPointerException` appears after a
   movement recording starts. Then run the Expo Go foreground sections of the runbook.
1. Run the Android development-build physical spike. Verify foreground/background permission
   flows, the foreground-service notification, screen-lock collection, manual and automatic
   pause/resume, force-kill recovery of already persisted points, map tiles, voice cues through
   speaker and Bluetooth, and representative battery consumption. Continued collection after
   force-kill is explicitly not guaranteed; persisted activity recovery is required.
2. Record the user's Android development-build results. Expo Go is not sufficient evidence for
   the background-service contract; use a development build on a physical Android device. Keep
   iOS compatibility in the API and schema design, but Android remains the first native target.
3. Fix any native issues exposed by that spike and rerun all automated checks. Continued
   collection after force-kill is explicitly not guaranteed; persisted activity recovery is
   required.
4. Run backend sync acceptance when API credentials are configured: offline completion, exact
   replay, higher-revision edit, delete, and cross-user isolation.
5. Perform later iOS native integration and physical validation using the same product contract.

Native reminder delivery/permission prompts and Wallpaper Save-to-Photos also still deserve
a physical-device smoke test, but they are Phase 2 follow-up checks rather than Phase 3
movement blockers. Workout polish items (RPE, set edit/delete, finish notes, rest-timer
threshold) remain explicitly deferred.

## Verification commands

```sh
# Backend
cd apps/backend && source .venv/bin/activate
ruff check .            # All checks passed!
pytest -q               # 28 passed
alembic upgrade head    # reaches head (idempotent)

# Mobile
cd apps/mobile
npm run typecheck       # tsc --noEmit, 0 errors
npm run lint            # eslint ., clean
npm test -- --runInBand # 394 passed (20 suites) as of the last full run. Every number since is
                        # an expectation, not a measurement — the 2026-08-17 reminder-helper cases
                        # and the rebuild's pantheon/annals suites both add to it.
EXPO_NO_TELEMETRY=1 npx expo-doctor # 21/21
EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir /tmp/kairo-phase3-android-export
EXPO_NO_TELEMETRY=1 npx expo export --platform ios --output-dir /tmp/kairo-phase3-ios-export
                        # both successful; telemetry disabled because the sandbox cannot write ~/.expo
```

`typecheck` and `lint` were last run clean on **2026-08-18**, after The Citadel and the whole tasks
module — both silent, exit 0. `npm test`, `expo-doctor`, and both `expo export` runs all predate the
rebuild, and `npm test` in particular is now **known stale**: `src/domain/__tests__/tasks.test.ts`
changed with `formatProgress`/`formatStreak`. The user runs the test suite, the exports, and every
device check personally — their words: *"i will run all the tests myself and return their output"*.
Offer to check readiness; do not run those yourself.

Two things about this machine that cost time if rediscovered:

- **Node is not on the non-interactive shell's `PATH`.** Every shell call that runs `npm`/`npx`/`node`
  needs `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" &&` in front of it.
- **The shell is zsh, where an unmatched glob is a hard error**, not a literal. `grep -rn foo
  --include=*.ts .` dies with `no matches found: --include=*.ts`, and any unquoted route path breaks:
  write `app/'(tabs)'/workouts/index.tsx` or reach for `find`.

To regenerate the app icons after an artwork change (needs Pillow):

```sh
cd apps/mobile && python3 scripts/generate-icons.py
```

If `node_modules` or `.venv` are missing (a fresh clone, or a cleaned machine):
`npm install` in `apps/mobile`; `python3 -m venv .venv && source .venv/bin/activate &&
pip install -e '.[dev]'` in `apps/backend`.

## Test harness (mobile)

`src/db/__tests__/testDb.ts` exposes `createTestDb()`: a thin adapter presenting Node's
built-in `node:sqlite` through the subset of the `SQLiteDatabase` interface the query layer
uses (`execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `prepareAsync`). Tests get the
real schema from `migrations.ts` and the real seed data, so SQL is exercised as written
rather than mocked. The movement query suite uses it alongside the existing module suites.

Four harness details to know before extending it:

- `jest.testMatch` in `package.json` is narrowed to `**/*.test.[jt]s?(x)`. jest-expo's
  default treats every file under `__tests__/` as a suite, which made the shared `testDb.ts`
  helper fail as an empty test file. Colocated helpers are fine now.
- Because the harness runs the app's own `migrate()`, it inherits its
  `PRAGMA foreign_keys = ON` — so tests catch FK violations the app would hit. But note
  `node:sqlite` enables foreign keys **by default**, so a passing cascade test does not by
  itself prove that pragma is doing its job on a real device, where SQLite defaults it off.
  The tasks delete-cascade test says so in a comment.
- The store is a zustand module singleton: reset its state in `beforeEach`, or a `sessionId`
  from the previous test leaks into a fresh database and surfaces as a confusing FK error.
- `expo-crypto`'s `randomUUID` has no jest implementation; the store suite mocks it with a
  counter. `Date.now()` is pinned with `jest.useFakeTimers()`. The tasks suites avoid both by
  passing explicit ids and an injected `nowMs`.

### Timezone pinning — use `globalSetup`, not `setupFiles`

The weight domain buckets weigh-ins by **local** calendar day on purpose (a 22:00 weigh-in
should land on the date shown beside it), and the tasks domain counts a habit ticked off at
23:30 for that day. That makes both timezone-sensitive: a fixture at `23:59:59Z` is the 11th
in London and the 12th in Berlin. `jest.globalSetup.js` pins `TZ=UTC` for the run.

It has to be `globalSetup`. A setup file runs *inside* the jest environment, whose `process`
is a sandboxed copy — assigning `TZ` there never reaches the ICU timezone cache, so `Date`
quietly keeps using the host zone. This was confirmed the slow way: `jest --showConfig`
proved the setup file was resolved and loading, and separate Node probes proved Node does
honour a runtime `TZ` mutation, leaving the sandboxed `process` as the only explanation.
`globalSetup` runs in the real Node process before workers fork, so they inherit the zone at
spawn. Don't "fix" a future timezone failure by editing the assertion to match the machine.

## Bugs found and fixed by tests

**In `listSessions()`** (`src/db/workouts.ts`, the History screen's query) — neither was
reachable from the domain tests, which is what made the SQLite-backed pass worth doing:

- **`exercise_names` was silently truncated.** `GROUP_CONCAT(DISTINCT e.name)` ignores a
  custom separator (SQLite rejects a second argument alongside `DISTINCT`), so the query
  emitted comma-joined names while the mapper split on `'|'` — every session collapsed to one
  long pseudo-name. Fixed by moving the `DISTINCT` into a subquery so the two-argument
  `GROUP_CONCAT(name, '|')` can run outside it.
- **`total_volume` mixed lb and kg.** The SQL summed `reps * weight` raw while the detail
  screen's `setVolume()` normalises lb to kg — so a session logged in lb reported ~2.2× the
  volume of the same session's detail view. The SQL now applies the same conversion.

**In `summarise()` and `withinDays()`** (`src/domain/weight.ts`), found while extracting
`dates.ts` this session: both derived today with `Math.floor(nowMs / MS_PER_DAY)`, which
answers in **UTC**, while the points they filter were bucketed by **local** day. Off-UTC the
window compared two different calendars and could shift by a day. Both now call
`todayNumber(nowMs)`. Not caught earlier because the suite pins `TZ=UTC`, where the two agree
— worth remembering when reading a green run as proof of timezone correctness.

## Pattern for future modules

Four modules have now taken the same shape. Copy it:

1. **Migration** — append to `MIGRATIONS` in `src/db/migrations.ts` and bump
   `SCHEMA_VERSION` in `src/db/schema.ts`. Never edit an existing entry: installs in the wild
   have already run it. v1 workouts, v2 weight (`body_weight_entries`, `user_preferences`),
   v3 tasks (`tasks`, `task_completions`), v4 macros (`food_items`,
   `nutrition_entries`, `macro_targets`).
2. **Types** — a row type and a domain type in `src/db/types.ts` plus a `to*` mapper. The
   split is what keeps `snake_case` SQL out of the screens. Don't add a join type
   speculatively — the tasks pass deleted a `TaskWithCompletion` that no query ended up
   wanting.
3. **Domain** — pure functions in `src/domain/<module>.ts`, no `db` or React import, and
   `nowMs` always injected rather than read. That is the whole testability seam; anything
   interesting should be reachable from here. Use `src/domain/dates.ts` for day math instead
   of dividing by `86_400_000`.
4. **Queries** — `src/db/<module>.ts`, one function per query, plus a `__tests__/` suite using
   `createTestDb()`. Include a migration test that upgrades a database holding the *previous*
   modules' rows, which is what a real install does on update — the tasks one seeds both a
   workout and a weight row, rewinds `user_version`, re-migrates, and asserts both survive.
   Finish with one integration case that feeds real query output through the domain layer, so
   a disagreement between the two shows in CI rather than on a phone.
5. **Screens** — `app/(tabs)/<module>/`, reloading with `useFocusEffect` rather than on mount
   so a modal dismissal shows the row just written. Refresh `nowMs` in the same load as the
   data. Add the tab in `app/(tabs)/_layout.tsx` and a card in `app/(tabs)/index.tsx`, and
   remove the module from that file's `UPCOMING` list.

Mistakes earlier modules' tests deliberately guard, worth repeating:

- **`ORDER BY … ASC LIMIT n` returns the oldest n.** For a chart you want the newest n, then
  sorted ascending — otherwise a user with years of history sees their first few entries and
  nothing since. `listEntriesAscending` does the limit in a subquery.
- **A rolling average must window by date, not by sample count.** Three weigh-ins in July and
  one in August would otherwise report a "7-day average" spanning six weeks.
- **Never derive "today" from `nowMs / MS_PER_DAY`** if the data was bucketed locally. See the
  `summarise` bug above.
- **Don't bound a per-entity history query with a row `LIMIT`.** It starves whichever entities
  sort last and reports them as empty, which is indistinguishable from data loss. Bound by
  date.

## Repo hygiene notes

- `.gitignore` is intentionally left as-is. It already covers `.claude/`, `*.db` /
  `*.db-shm` / `*.db-wal`, `node_modules/`, `.venv/` and `dist/`.
- `apps/backend/kairo.db` had been committed by mistake. It was untracked (`git rm --cached`,
  file kept on disk) and `*.db` / `*.db-shm` / `*.db-wal` added to `.gitignore`. It held only
  the Alembic version row
  and empty tables, so nothing was lost. Recreate with `alembic upgrade head`.
- `kairo_backend.egg-info/` and `.venv/` are untracked (fine).
- `expo` had been floating on `"latest"` in `apps/mobile/package.json` and is now pinned to
  the SDK 57 range like everything else. Expo-managed packages use a **tilde** range by
  convention here; `react-native-svg` went in with a caret and was corrected.
- `expo-doctor` drifts to 19/20 on its own as the SDK publishes patch releases — the four it
  flagged were upstream, not local. `npx expo install --fix` is the remedy, run from
  `apps/mobile` (from the repo root, `npx` bootstraps a throwaway `expo` instead of using the
  local one). It cannot take `--check` and `--fix` together. On a slow link it can die
  mid-install and leave `package-lock.json` half-rewritten; a plain `npm install` afterwards
  reconciles it.
- `.claude/` at the repo root is machine-local tool config holding settings from other
  projects in this workspace. It was staged accidentally by a `git add` once, unstaged before
  committing, and is now gitignored so it cannot happen again.
