# UI Rebuild — The Greek Theme

The interface is rebuilt once, completely, as a dark Greek-themed app: obsidian surfaces,
bronze accents, inscriptional display type, and a screen lexicon drawn from a citadel.
Same logo, same accent colour. This is not a restyle of a restyle — it replaces the
partial pass recorded under Phase 3 in `06-roadmap.md`.

## Why

The first run on a physical device through Expo Go exposed the real problem. Text was
packed at React Native's default ~1.15× leading, nothing established vertical hierarchy,
and status text read as body copy that happened to be orange. Two screens had never
picked up the dark palette at all. The first three screens were fixed in place; at the
fourth it was clear that patching one screen at a time produced fourteen slightly
different card paddings and no coherent whole.

The theme is not decoration applied afterwards. `00-overview.md` opens on the name —
Greek *kairos*, "the right/opportune moment". A citadel of named halls is that idea made
visible: each module is a place you go to do one thing at the right time.

## Locked scope

- The existing 22 screens are **restyled, not rewritten**. Data loading, domain calls,
  mutations, and navigation are unchanged; copy, structure, and type change.
- Five new screens are built: The Gates, The Sanctum, The Envoy, The Pantheon, The Annals.
- Two designed screens are deferred: The Agoge, The Scrolls. See "Deferred" below.
- The palette stays ours. Only `colors.border` changes.
- One font is added — **Cinzel**, for display and headline roles only. Body text keeps the
  platform font stack; no Inter payload ships.
- Density moves onto a rigid 8px grid: 24px screen margin, 16px card padding.
- No new native dependency. No gradients, no blur, no shadows.
- Six visible tabs are kept, including movement. This is a deliberate deviation from the
  designs — see "The tab bar" below.

## The design handoff

30 screen designs live in `media/stitch/`, one folder per screen, each with a complete
`code.html` and a preview `screen.png`, plus the project theme in `media/stitch/kairo/DESIGN.md`.

Two properties of the handoff govern how it is read.

**`code.html` is authoritative; the PNGs are lossy previews.** All are capped at 1600px.
Seven are viewport screenshots that crop content away — the Citadel preview stops mid
"74.8 kg" although its code continues through The Scales, The Forge, and The Outer Ward.
The rest are downscaled to 273–575px wide, so their text is soft. Read the markup, not
the picture, and don't diff against the PNGs.

**The exported palette drifted from ours.** The Material-3 frontmatter carries `#101418`
background, `#e1e2e9` text, and `#f9bc4a` primary, while the prose in the same file
correctly cites the app's real tokens (`#15181D` surface, `#2A2F38` border, `#D79E2D`
bronze). Across the 30 exports `#F9BC4A` appears 92 times and our `#F2F4F7` twice. So
every screen is transcribed **through the substitution table below**, never literally —
including `5.1_the_canon`, the design-system sheet, whose own swatch grid renders the
drifted values and labels them with our token names.

The logo shipped with the designs is unchanged art. It and `apps/mobile/assets/source/kairo-mark.png`
differ by SHA but are both 1216×1294 with the same measured mean gold and the same sampled
pixel count — a re-encode, not a redraw. `scripts/generate-icons.py` does not need re-running
and `colors.accent` stays `#D79E2D`.

## The lexicon

| Display name | Route | Module |
|---|---|---|
| The Citadel | `app/(tabs)/index.tsx` | dashboard |
| The Rites, The Flame | `app/(tabs)/tasks/` | tasks and streaks |
| The Forge, The Anvil, The Armory, The Stele | `app/(tabs)/workouts/` | workout logging |
| The Feast, The Offering, The Decree | `app/(tabs)/macros/` | macros |
| The Scales, The Weighing, The Vow | `app/(tabs)/weight/` | weight |
| The Expedition, The Threshold, The March, The Chronicle, The Retelling, The Compass | `app/(tabs)/movement/` | GPS movement |
| The Call | `app/(tabs)/alarms.tsx` | reminders |
| The Oracle | `app/(tabs)/wallpaper.tsx` | wallpapers |
| The Gates | `app/gates.tsx` | onboarding — new |
| The Sanctum | `app/sanctum.tsx` | settings — new |
| The Envoy | `app/(tabs)/envoy.tsx` | sync outbox — new |
| The Pantheon | `app/pantheon.tsx` | personal records — new |
| The Annals | `app/annals.tsx` | weekly review — new |
| The Agoge, The Scrolls | — | programs, article library — deferred |

**Routes, tables, types, and functions keep their plain English names. Only user-facing
copy is Greek.** A `pantheon.ts` domain module is named for a screen that exists, which is
different; renaming `tasks.ts` to `rites.ts` would make `02-data-model.md`, `03-api-design.md`,
`04-feature-specs.md`, and the backend's matching router all wrong at once, for no gain.
The lexicon lives here and nowhere else — a second copy is a copy that drifts.

## Screen map

Sections `5.2`–`5.23` of the handoff map one-to-one onto existing routes:

```text
5.2  citadel     -> (tabs)/index.tsx          5.13 scales     -> weight/index.tsx
5.3  rites       -> tasks/index.tsx           5.14 weighing   -> weight/log.tsx
5.4  new_rite    -> tasks/new.tsx             5.15 vow        -> weight/goal.tsx
5.5  flame       -> tasks/[taskId].tsx        5.16 expedition -> movement/index.tsx
5.6  forge       -> workouts/index.tsx        5.17 threshold  -> movement/new.tsx
5.7  anvil       -> workouts/active.tsx       5.18 march      -> movement/active.tsx
5.8  armory      -> workouts/exercises.tsx    5.19 chronicle  -> movement/[activityId].tsx
5.9  stele       -> workouts/[sessionId].tsx  5.20 retelling  -> movement/replay.tsx
5.10 feast       -> macros/index.tsx          5.21 compass    -> movement/settings.tsx
5.11 offering    -> macros/add.tsx            5.22 call       -> alarms.tsx
5.12 decree      -> macros/targets.tsx        5.23 oracle     -> wallpaper.tsx
```

Work module by module — tasks, workouts, macros, weight, movement, then the two hidden
screens — so each module is independently runnable on a device rather than the whole app
being half-converted at once.

## Foundations

### Tokens

`src/theme/index.ts` takes four changes and nothing else:

- `colors.border` moves from `#2A2F38` to **`#504535`** — the handoff's `outline-variant`, a
  warm bronze-brown that reads as weathered metal against the obsidian surfaces where the
  old cool slate read as generic dark-mode chrome. Everything else in `colors` and
  `chartColors` is unchanged.
- `layout` moves onto the 8px grid in one edit: `screenPadding` 20 → 24, `sectionGap`
  18 → 24, `cardPadding` 18 → 16, `cardGap` 14 → 16, `rowPadding` 14 → 16. `scrollFooter`
  stays 40.
- `fontSize.xxl` / `lineHeight.xxl` are added at 40/48 for the largest display role.
- A new **`type`** export holds the composed display roles.

`radius.md` is already 12 and `TAP_TARGET` is already 56, both of which match the design
prose. Where the exports use Tailwind's `rounded` (4px) for cards, follow the prose (12px)
— which is what the app already does.

### Why `type` exists as a token group

The design specifies letter-spacing in `em`; React Native's `letterSpacing` is in points.
Resolving `0.15em` against its own 40px size is arithmetic that must happen exactly once,
not at every call site. The same export is where the Cinzel family names live, so no screen
ever writes a `fontFamily` string — a typo in one would silently fall back to the platform
serif and look almost right.

Roles: `displayLg` (Cinzel 700, 40/48), `displayMd` (Cinzel 700, 28/34), `headlineSm`
(Cinzel 600, 20/28), `eyebrow` (12/16 uppercase), `label` (14/20 semibold uppercase),
`timer` (56/56, tabular figures).

### Cinzel

`expo-font` is already a dependency; the family is added with
`npx expo install @expo-google-fonts/cinzel` and loaded with `useFonts` in `app/_layout.tsx`,
gated behind the `AppLoader` fallback that already covers the SQLite migration — one loading
state, not two. Cinzel is uppercase-only in use, per the design prose: inscriptional serifs
at generous tracking, never for running text.

### Primitives

Per the convention in `07-repo-structure.md`, screen structure comes from
`src/components/Layout.tsx`. The design-system sheet maps almost one-to-one onto the existing
`Screen` / `ScreenScroll` / `ScreenHeader` / `Section` / `Card` / `Notice` / `EmptyState` /
`Field` / `Divider` / `Stat`. What the theme adds:

- **`AppBar`** — the 64px detail-screen bar: back chevron, Cinzel accent title, 4px accent
  bottom rule. `ScreenHeader` stays, for tab roots.
- **`Eyebrow`** — 12px uppercase label. The single most repeated element in the handoff.
- **`Meander`** — the Greek-key hairline, 4px tall, tiled. Drawn with `react-native-svg`,
  already a dependency. Used under `AppBar` and between major sections only; the design says
  sparingly and means it.
- **`Fluting`** — the 1px vertical hairline pair, the Doric groove used instead of a
  horizontal rule.
- **`StatCard`** — centred eyebrow over a large accent number.
- **`Timer`** — tabular figures at display size, for rest and session clocks.
- **`ProgressBar`** — raised track, accent fill, **square caps**. The design is explicit that
  a rounded cap breaks the chiselled look.

Three existing primitives change: `Field` gains a focus state (border and label go accent),
`Notice` moves from a full border to a 3px left rule over a 10% tint — the `*Soft` fills
already in `colors` are exactly those tints — and `Divider` gains a vertical orientation.
`Button` keeps its three variants but takes uppercase letterspaced labels, and **danger
becomes outlined**: transparent fill, danger border and text.

Icons stay `@expo/vector-icons`' `MaterialCommunityIcons`. The design prose specifies
Material Community Icons outline at 24px, so the app's existing set is the intended one and
no icon package is added — but the exports were built against Material Symbols, whose 61
distinct glyph names are a different vocabulary. Each is remapped and **verified against the
installed glyphmap**, not matched by name; several have no counterpart and need a substitute.

## The substitution table

Applied to every export during transcription.

| Handoff | Ours |
|---|---|
| `#101418` `background` / `surface-dim` | `colors.background` |
| `#1d2025` `surface-container` | `colors.surface` |
| `#272a2f` / `#32353a` `-high` / `-highest` | `colors.surfaceRaised` |
| `#e1e2e9` `on-surface` | `colors.text` |
| `#d4c4af` `on-surface-variant`, `#c4c7ca` `secondary` | `colors.textMuted` |
| `#9c8f7c` `outline` | `colors.border` as a border, `colors.textMuted` as text |
| `#504535` `outline-variant` | `colors.border` |
| `#f9bc4a` `primary`, `#d79e2d` `primary-container` | `colors.accent` |
| `#422c00` `on-primary` | `colors.accentText` |
| `#ffb4ab` `error`, `#93000a` `error-container` | `colors.danger`, `colors.dangerSoft` |
| `#9fcaff` / `#6dacf3` `tertiary` | `colors.info` |
| the sheet's `#2E7D32` / `#F57C00` / `#0288D1` | `colors.success` / `.warning` / `.info` |
| the Citadel's `#4ade80` / `#60a5fa` / `#a78bfa` | `chartColors.protein` / `.carbs` / `.fat` |
| the Annals' `#3F4552` sparkline | `colors.border` |
| `px-container-padding` (24) | `layout.screenPadding` |
| `p-4` / `gap-4` (16) | `layout.cardPadding` / `layout.cardGap` |
| `space-y-6` (24) | `layout.sectionGap` |
| `h-16` / `h-20` / `h-[56px]` | `AppBar` 64 / tab bar 80 / `TAP_TARGET` |

Four things are dropped rather than ported:

- **Gradients** (5 utilities across the 30 screens) — flattened to a solid. No
  `expo-linear-gradient`.
- **`backdrop-blur-sm`** (8 occurrences) — flattened to `surfaceRaised`. No `expo-blur`.
- **Shadows** — the design prose states the system avoids soft shadows and communicates depth
  through tonal layering and outlines. Seven of the ten occurrences are already `shadow-none`.
- **Remote placeholder images** (6 `lh3.googleusercontent.com` `<img>` tags) — substituted with
  the local mark from `assets/`, or nothing.

## The tab bar

Every one of the 30 designs ships a five-tab bar — `CITADEL | RITES | FORGE | FEAST | SCALES`
— with no movement entry anywhere, and the Citadel's Outer Ward row group doesn't list it
either. Following that would strand the whole of Phase 3 two taps deep in a submenu.

So the app keeps **six visible tabs**, with movement labelled `MOVE`: short enough to fit at
six across, and already what it reads today. The screen itself is titled THE EXPEDITION. The
bar takes the rest of the design: 80px tall, raised surface, 1px top border, and a 2px accent
top rule on the active tab. `alarms` and `wallpaper` stay `href: null`, reachable from the
Citadel.

This is the one place the implementation knowingly diverges from the designs.

## New screens

Ordered cheapest first. Each is additive; none changes an existing contract.

**The Envoy** (`5.26`) — the sync outbox, made visible. `src/db/outbox.ts` already stores every
field the design shows: `entity_type`, `operation`, `attempts`, `last_error`, `next_attempt_at`.
It needs a `listAll()` alongside the existing `listDue`/`pendingCount`, and a retry that resets
`next_attempt_at`. Hidden tab.

**The Gates** (`5.24`) — onboarding, outside the tab group. `src/db/preferences.ts` is key-value
TEXT, so an `ONBOARDING_COMPLETE` key needs **no migration**; `app/_layout.tsx` redirects to it
while unset.

**The Sanctum** (`5.25`) — settings, reached from the Citadel header. Sections for measures,
reminders, sync, the local record, and the foundations (runtime, schema version, app version),
plus an outlined-danger local wipe behind a confirmation. `IS_EXPO_GO` from
`src/services/runtime.ts` supplies the runtime row; the schema version comes from the migration
module. Two new preference keys (`WEEK_START`, `FIRST_SCREEN`) and a JSON export of every table.
The design's square 48×24 toggle is a `Pressable`, not React Native's `Switch`, which cannot be
squared off.

> **Resolved divergence.** `preferences.ts` has one `UNIT_SYSTEM` (`metric` | `imperial`)
> covering both weight and distance; the design shows two independent toggles (kg/lb, km/mi).
> Keep the single key and render one Units row. Splitting it means auditing every
> `formatMovementDistance` and `toKg` call site for which of the two it now reads, to enable a
> combination (kilograms with miles) nobody asked for. `08-phase-3-movement-plan.md` locked
> "one explicit shared metric/imperial preference" for the same reason.

**The Pantheon** (`5.27`) — personal records, in a new `src/domain/pantheon.ts`. Every number is
already in the database. It reuses `bestOneRepMax`, `sessionVolume`, `estimateOneRepMax`, and
`toKg` from `src/domain/workouts.ts`, and `formatPace`, `formatMovementDistance`, and
`haversineMeters` from `src/domain/movement.ts`. `elevation_gain_meters` is already stored, so
"greatest climb" is a `MAX`. Two genuinely new pure functions: elevation gain from sample
altitudes, and a rolling-window split for "fastest 5 km". Both unit-tested alongside the other
domain suites. The design's footnote is kept verbatim — *"Feats are derived from your own
records. Nothing here is a target."* — because it is the honest description of the screen and
stops it becoming a goals feature.

**The Annals** (`5.28`) — the weekly reckoning, in a new `src/domain/annals.ts`. A week
navigator, a verdict block, four per-module aggregate cards with seven-cell day strips, a
current-versus-previous weight chart, and a "what slipped" list. The chart reuses
`src/components/LineChart.tsx` rather than adding a second charting path: it already takes
`points` (thin, muted) and `trend` (accent), which is exactly previous-versus-current. Two
optional props (`showAxis`, `pointsDashArray`) keep all the geometry in the tested
`src/domain/chart.ts`. The day strips are plain views, not SVG.

The Pantheon and the Annals hang off the Citadel's Outer Ward row group, which the design
already lists alongside The Oracle and The Call.

## Deferred

- **The Agoge** (`5.29`) — training programs with weeks, levels, and progress. That is a new
  feature with a new table, in no roadmap phase. It is not a restyle, and building it here
  would hide a feature decision inside a UI pass.
- **The Scrolls** (`5.30`) — an article library with doctrine and reflection categories and
  read-time estimates. It needs editorial content that does not exist, and overlaps the Phase 4
  Bible reader.

Both designs stay in `media/stitch/` for whenever their phase arrives.

## Delivery gates

1. Cinzel installed and rendering — a silent fallback to the platform serif looks almost right,
   so this is checked on a device, not in a simulator screenshot.
2. Tokens and primitives landed; `npm run lint` at its 0-error, 0-warning gate and
   `npx tsc --noEmit` clean.
3. The shell: six tabs, correct labels, active rule.
4. Each of the six modules restyled and run on a device before the next is started.
5. The five new screens, with `pantheon.ts` and `annals.ts` unit-tested.
6. `npx expo export --platform android` — catches a module-scope import of a package Expo Go
   lacks, the failure mode `src/services/runtime.ts` exists to prevent.
7. On device in Expo Go, per module: does the display type render, is every icon a glyph rather
   than a box, does accent-on-`#504535` read at low screen brightness, does the tab bar fit six
   labels without truncating.
8. A wipe-and-reinstall to walk The Gates once, and a Sanctum export/raze round-trip.

Absorbed into gate 4, from the superseded partial restyle: the 13 screens whose loader `.catch`
is missing and which need the error surfaced as a `Notice`, the local `MACRO_COLORS` constant
that should be `chartColors`, and the remaining full-screen `ActivityIndicator`s that should be
`LogoLoader`. `to_continue_with.md` carries the file-by-file lists.
