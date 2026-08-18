# Kairo — Greek UI Rebuild: Google Stitch Prompt Pack

A complete, copy-paste prompt set for regenerating Kairo's entire interface in Google Stitch as a
dark, masculine, Greek-themed app — keeping the existing Spartan-helmet mark and the gold accent
sampled from it.

Written against the real app: every screen below corresponds to a route that exists in
`apps/mobile/app/`, or to a new route this pack proposes. Every metric, label, and state named in a
prompt is one the code actually produces. Sample values are realistic, not placeholder lorem.

---

## 0. How to use this pack

**Stitch generates one screen per prompt well, and degrades badly when asked for six at once.** So:

1. **Upload the mark first.** Give Stitch `apps/mobile/assets/source/kairo-mark.png` as a style
   reference image on your first generation, and say *"this is the app's existing logo — match its
   gold, do not redraw it, reserve it for the brand and loader only."*
2. **Paste BLOCK A (design system) at the top of every single prompt.** Stitch does not reliably
   carry a theme between generations. If your Stitch project has a theme/design-system field, put
   BLOCK A there as well — but still paste it. It is the single thing that keeps 26 screens looking
   like one app.
3. **Generate in this order.** Prompt 1 (design-system sheet) → Prompt 2 (Citadel) → then whatever
   you like. The first two set the vocabulary Stitch reuses; generating a modal before its parent
   screen produces two unrelated styles.
4. **Iterate with small follow-ups**, not rewrites: *"keep everything, change only the stat row —
   make the numerals tabular and the captions uppercase 12px."*
5. **Reject anything on the DO-NOT list (§7).** Regenerate rather than accept-and-fix; a wrong
   texture or a glow gets copied into every later screen you generate from it.

**Sequence for the 26 prompts:** §5.1 design system → §5.2 Citadel → §5.3–5.5 Rites →
§5.6–5.9 Forge → §5.10–5.12 Feast → §5.13–5.15 Scales → §5.16–5.21 Expedition → §5.22 Call →
§5.23 Oracle → §5.24–5.30 new and future screens → §6 states pack.

---

## 1. BLOCK A — Master design system (paste at the top of EVERY prompt)

```
You are designing screens for "Kairo", an existing dark-mode Android/iOS fitness and discipline app
built in React Native. This is a visual rebuild of a working app, not a new product. Follow this
design system exactly. Do not introduce colours or spacing values that are not
listed here.

THEME: dark, masculine, ancient-Greek/Spartan. Cold black stone and bronze. Restrained and
military — a warrior's equipment, not a mythology poster. Everything is legible at 6am in a gym.

COLOUR (exact hex, no substitutions):
- Background (app canvas): #0B0D10
- Surface (cards): #15181D
- Surface raised (inputs, tracks, chips): #1D2128
- Border / hairline: #2A2F38
- Primary text: #F2F4F7
- Muted text: #98A2B3
- ACCENT (bronze-gold, the brand colour): #D79E2D
- Text/icons ON the accent: #0B0D10  (near-black — NEVER white on gold, it fails contrast)
- Success: #3FB950   Danger: #E5484D   Warning (amber): #E07B39   Info: #58A6FF
- Tinted status fills: accent #2B2110, warning #2E1B0F, danger #2E1416, info #12233A
- Chart series: protein #3FB950, carbs #58A6FF, fat #B78AF7, calories/primary #D79E2D
There is no light theme. Every surface is one of the four dark values above.

TYPE:
- Display/titles: "" — classical inscriptional serif, uppercase, letter-spacing +1.5 to +2.
  Used ONLY for screen titles, the wordmark, and section eyebrows. Never for body copy or numbers.
- UI/body: "Inter" — regular 400, semibold 600, bold 700.
- Numerals in stats, timers, and tables: Inter with TABULAR figures, so a running timer does not
  shift width digit to digit.
- Sizes / line-heights (px, fixed): 12/18, 14/20, 16/24, 20/28, 28/34, and 56/56 for the single
  giant timer readout. Nothing between these values.
- Section eyebrows: 12px  uppercase, letter-spacing 1.2, colour #98A2B3.

SPACING & SHAPE (fixed tokens):
- Screen outer padding: 20
- Gap between major sections: 18
- Card inner padding: 14
- Gap between rows inside a card: 14
- Clearance below the last element of a scroll: 40
- Small gaps: 4, 8, 12, 16, 24, 32
- Radii: 8 (chips, inputs' small siblings), 12 (cards, inputs, buttons), 999 (pills, dots, tracks)
- Every card: background #15181D, 1px border #2A2F38, radius 12, padding 18. One card shape only.
- Every tappable control is at least 56px tall. Icon-only buttons are 44x44 minimum.

GREEK VISUAL LANGUAGE — structural, Greek accented:
- A "Greek key" / meander fret line, 2px tall, in #2A2F38 (or #D79E2D at 30% for an active state),
  used as a section divider or under a screen title. Maximum one per screen region.
- Column fluting: 2–3 vertical 1px hairlines in #2A2F38 at the left edge of a header block.
- Bronze rules: a 3px left-edge rule on status blocks, coloured by tone.
- Laurel: permitted ONLY on the Pantheon (records) screen and nowhere else.
- The Spartan helmet mark: brand and loader only — app header, intro, loading state. Never inside a
  data card, never as a bullet, never repeated.
- Stone/marble texture: at most one very subtle (<4% opacity) noise or fine-grain overlay on a
  screen's header block. No photographic marble, no statues, no temples behind text.

BUILDABILITY — this must be implementable in React Native, so:
- No CSS grid, no sticky positioning, no pseudo-elements, no SVG filters.
- Icons must be Material Community Icons (the app already ships them) — outline weight, 22px in
  rows, 24px in tab bars. Do not invent custom icon art.
- Charts are hand-drawn SVG: permitted forms are a line with an optional flat area fill, horizontal
  or vertical bars, a dot/square heatmap grid, a stroke-dash progress ring, and a sparkline.

VOICE:
- Screen names and section headings are Greek-themed (given per screen).
- Destructive and utility verbs stay plain and unambiguous: Save, Cancel, Delete, Edit, Retry.
  ONLY the single primary action of a screen may take a themed label (e.g. "Begin the march").
  Never rename a verb in a way that makes the action unclear.
- Copy is terse and declarative. No emoji. No exclamation marks. No motivational filler.

OUTPUT: a single mobile screen, 390x844, portrait, dark. Show real sample data as specified —
never lorem ipsum, never empty boxes. Include the bottom tab bar only where the prompt says to.
```

---

## 2. BLOCK B — The naming lexicon

**Critical: every rename below is display-only.** Database values, route folder names, sync payload
fields, and `MealType`/`MovementType` strings stay in English (`breakfast`, `run`, …). Renaming a
stored value would break migrations and the replay-safe sync contract. Stitch designs the label;
the code keeps the identifier.

| Current | Greek name | Route |
|---|---|---|
| Home / Dashboard | **The Citadel** | `app/(tabs)/index.tsx` |
| Today / Tasks | **The Rites** | `app/(tabs)/tasks/index.tsx` |
| Add task | **New Rite** | `tasks/new.tsx` |
| Task streak detail | **The Flame** | `tasks/[taskId].tsx` |
| Workouts history | **The Forge** | `app/(tabs)/workouts/index.tsx` |
| Active workout | **The Anvil** | `workouts/active.tsx` |
| Exercise library | **The Armory** | `workouts/exercises.tsx` |
| Session detail | **The Stele** | `workouts/[sessionId].tsx` |
| Macros day log | **The Feast** | `app/(tabs)/macros/index.tsx` |
| Add food | **The Offering** | `macros/add.tsx` |
| Macro targets | **The Decree** | `macros/targets.tsx` |
| Weight trend | **The Scales** | `app/(tabs)/weight/index.tsx` |
| Log weight | **The Weighing** | `weight/log.tsx` |
| Goal weight | **The Vow** | `weight/goal.tsx` |
| Movement history | **The Expedition** | `app/(tabs)/movement/index.tsx` |
| Readiness / start | **The Threshold** | `movement/new.tsx` |
| Live tracking | **The March** | `movement/active.tsx` |
| Activity detail | **The Chronicle** | `movement/[activityId].tsx` |
| Route replay | **The Retelling** | `movement/replay.tsx` |
| Movement settings | **The Compass** | `movement/settings.tsx` |
| Reminders | **The Call** | `app/(tabs)/alarms.tsx` |
| Quote + wallpaper | **The Oracle** | `app/(tabs)/wallpaper.tsx` |
| *(new)* Onboarding | **The Gates** | `app/gates.tsx` |
| *(new)* Settings hub | **The Sanctum** | `app/sanctum/index.tsx` |
| *(new)* Sync status | **The Envoy** | `app/sanctum/envoy.tsx` |
| *(new)* Personal records | **The Pantheon** | `app/pantheon.tsx` |
| *(new)* Weekly review | **The Annals** | `app/annals.tsx` |
| *(new, future)* Programs | **The Agoge** | `app/agoge.tsx` |
| *(future, Phase 4)* Bible | **The Scrolls** | — |
| *(future, Phase 5)* Music | **The Lyre** | — |

**Sub-vocabulary**

| Concept | Greek label |
|---|---|
| Calories | **Caloric Forge** |
| Protein | **Protein Den** |
| Carbs | **The Granary** |
| Fat | **The Fat Pool** |
| Breakfast / lunch / dinner / snack | **Dawn / Zenith / Dusk / Embers** |
| Streak (current) | **The Flame** ("kept 14 days") |
| Streak broken | **Flame out** |
| Streak at risk | **Guttering** |
| Run / walk / ride | **Dromos / March / Chariot** (keep the plain word as a subtitle) |
| A logged set | **A strike** |
| Total volume | **Tonnage** |
| Personal record | **A feat** |
| Rest timer | **The Breath** |
| Sync outbox | **The Envoy's satchel** |
| Autopause | **Held** |

---

## 3. BLOCK C — Navigation map (paste into any prompt that shows the tab bar)

```
BOTTOM TAB BAR — 6 tabs, background #15181D, 1px top border #2A2F38, active icon+label #D79E2D,
inactive #98A2B3, labels 12px  uppercase letter-spacing 0.8, icons 24px Material Community
Icons outline:
1. CITADEL   — icon: "castle" or "bank-outline"
2. RITES     — icon: "checkbox-marked-circle-outline"
3. FORGE     — icon: "dumbbell"
4. FEAST     — icon: "food-drumstick-outline"
5. SCALES    — icon: "scale-balance"
6. MARCH     — icon: "map-marker-path"
The active tab additionally shows a 2px #D79E2D Greek-key fret segment directly above its icon.
Reminders (The Call), The Oracle, The Sanctum, The Pantheon and The Annals are NOT tabs — they are
reached from the Citadel.
```

---

## 4. Global states every screen must define

Include the relevant ones in each screen prompt; the full pack is §6.

- **Loading** — the helmet mark, still, with a thin gold arc rotating around it. *The helmet itself
  never rotates* (it has a top and a bottom; a spinning helmet reads as a rendering bug).
- **Empty** — a title, one line of body copy, and the primary action. Never a bare blank list.
- **Error** — a tinted status block (danger tone) that names the step that failed and offers Retry.
- **Degraded runtime** — an amber block for "this device cannot do this" (Expo Go cannot fire
  reminders; Save-to-Photos needs a development build).
- **Permission denied** — a distinct state from error: says what is blocked and how to grant it.

---

## 5. Screen prompts

> Each block below is the **screen-specific half**. Paste BLOCK A first, then the block. Add BLOCK C
> when the screen is a tab root.

### 5.1 — Design-system sheet (generate this FIRST)

```
Generate a single dark design-system reference sheet for Kairo, 390x844 scrolling, titled "THE
CANON" uppercase.

Show, stacked and labelled with 12px muted captions:
1. Colour swatches in rows of four: background, surface, surface raised, border / text, muted,
   accent, accent-text / success, danger, warning, info / the four tinted status fills.
2. Type specimens: title 28px, eyebrow 12px, Inter body 16/24, Inter muted
   14/20, Inter caption 12/18, and a 56px tabular timer reading 12:04.
3. Buttons at full width, 56px tall, radius 12: primary (solid #D79E2D with #0B0D10 label),
   secondary (transparent, 1px #2A2F38 border, #F2F4F7 label), danger (transparent, 1px #E5484D
   border, #E5484D label), and a disabled primary at 40% opacity.
4. A text input at rest and focused (focus = 1px #D79E2D border), with a 12px uppercase label above
   and a 12px muted hint below.
5. The one card shape, containing a stat: value 28px, caption 12px uppercase muted.
6. Four status blocks (info, warning, danger, accent), each a tinted fill with a 3px left rule, a
   bold 14px coloured title, and 14/20 body text.
7. A 6px-tall progress track (#1D2128) with a 60% gold fill, and the same in green, blue, violet.
8. A list row: 22px outline icon, title 16px, muted detail 12px, chevron right, 56px tall, hairline
   divider below.
9. A toggle switch on and off, a checkbox ticked (near-black tick on gold) and unticked, and a
   segmented control of three options with the middle one active.
10. The Greek-key fret divider in border grey and in gold.
11. The bottom tab bar, Citadel active.
Lay these out as a clean spec sheet on #0B0D10 with generous 18px section gaps. No decoration.
```

### 5.2 — The Citadel (tab 1, Home)

```
Screen: "THE CITADEL" — the daily dashboard. Scrolling. Include the bottom tab bar (Citadel active).

Top: a header block with 2–3 vertical 1px fluting hairlines at its left edge. Inside it:
- The Spartan helmet mark at 28px on the left of one line, and beside it "KAIRO" in 
  uppercase 20px, letter-spacing 2, colour #F2F4F7.
- Below: "Good evening" in Inter 28/34 bold #F2F4F7.
- Below: "Monday, 18 August" in 14px #98A2B3.
- Far right of the first line: a 22px "cog-outline" icon (opens The Sanctum) and a 22px
  "trophy-outline" icon (opens The Pantheon), both #98A2B3.
- A gold Greek-key fret line, 2px, spanning the header's width beneath it.

Then FOUR data cards, in this order, each with a header row of the  uppercase 12px eyebrow on
the left and a gold 12px "OPEN ›" on the right:

1. "THE RITES" — a big "4 / 6" (28px tabular) with the caption "kept today"; then three preview
   rows, each an 8px dot + task title + a right-aligned bold "14d": a gold dot with "Cold shower",
   a gold dot with "Read 20 pages", a RED dot with "Stretch" ; then a 12px bold red line
   "1 flame guttering".
2. "THE FEAST" — "1,540 kcal" 28px with muted "of 2,600" beside it; then three labelled progress
   lines, each with a 12px label left, "112 g / 180 g" muted right, and a 6px track below:
   Protein Den in green (62%), The Granary in blue (48%), The Fat Pool in violet (71%).
3. "THE SCALES" — left: "74.8 kg" 28px with caption "7-day trend"; right-aligned: caption "30 DAYS"
   above a green "−1.4 kg".
4. "THE FORGE" — a 10px green dot, then "In progress" 28px with the caption "24m 10s", and the
   card's action reads "RESUME ›" in gold instead of "OPEN ›".

Then a section eyebrow "THE OUTER WARD" over one card containing three 56px list rows separated by
hairlines, each: 22px gold outline icon, title 16px, 12px muted detail, chevron:
- "image-filter-hdr" — "The Oracle" — "Know thyself. — Delphi"
- "bell-outline" — "The Call" — "3 reminders, 1 not scheduled"
- "book-open-page-variant-outline" — "The Annals" — "Week 34 · 5 rites, 2 marches"

Also produce, as a second frame, the same screen in its loading state: header only, then the helmet
mark centred with a thin gold arc around it in a 260px-tall region.
```

### 5.3 — The Rites (tab 2, Tasks/Today)

```
Screen: "THE RITES" — today's habits with streaks. A list screen. Include the bottom tab bar
(Rites active).

Header: "THE RITES" in  uppercase 28px; below it "Monday, 18 August · 4 of 6 kept" in 14px
muted; a gold fret line under it. Top-right: a 44x44 gold-outlined "plus" button (New Rite).

A horizontal summary strip of three stats separated by 1px vertical hairlines, inside one card:
"4/6 KEPT", "12 DAY BEST FLAME", "1 GUTTERING" — values 20px tabular, captions 12px uppercase
muted. Colour the guttering value #E5484D.

Then a section eyebrow "DUE TODAY" and rows in a card, each row 56px+:
- Left: a 28px checkbox — unchecked is a 2px #2A2F38 square, radius 8; checked is a solid #D79E2D
  square with a near-black (#0B0D10) tick.
- Middle: task title 16px #F2F4F7 (struck through and muted #98A2B3 when done); beneath it a 12px
  muted line combining recurrence and flame, e.g. "Every day · flame 14" or "Weekdays · flame 0".
- Right: a small flame pill — rounded 999, background #2B2110, gold 12px bold text "14", with a
  tiny "fire" icon. When the streak is at risk the pill is #2E1416 with #E5484D text.
Rows to show: "Cold shower" (done, flame 14), "Read 20 pages" (done, flame 31), "Train" (done,
flame 6), "Stretch" (not done, flame 0, at-risk red pill), "Journal" (not done, flame 3),
"No screens after 22:00" (not done, flame 9).

Then a section eyebrow "NOT DUE TODAY" with two muted rows, no checkbox, 14px: "Long run —
Sundays", "Deep clean — every 3 days".

Then a collapsed row "ARCHIVED RITES (2)" with a chevron.

Second frame: the empty state — the helmet mark small and muted, "No rites yet" 16px, "A rite is a
promise you keep daily. Add the first one." 14/20 muted centred, and a full-width primary button
"Swear a new rite".
```

### 5.4 — New Rite (modal over The Rites)

```
Screen: "NEW RITE" — a modal sheet, dark, presented over a dimmed Citadel. Radius 12 on the top
corners only, background #15181D, a 40px-wide grab handle in #2A2F38 centred at the top.

Contents, 20px padding, 18px section gaps:
- Title "NEW RITE" in  uppercase 20px, with a "Cancel" text button in gold 14px at the right.
- Field "TITLE" (12px uppercase muted label) with a 56px input, radius 12, background #1D2128,
  1px #2A2F38 border, placeholder "Stretch for ten minutes" in #98A2B3.
- Field "CADENCE": a 4-option segmented control, each 56px tall, radius 12, in a row that wraps —
  "Every day", "Weekdays", "Weekends", "Custom". The active option is a solid #D79E2D fill with
  #0B0D10 bold text; the others are #1D2128 with #F2F4F7 text and a 1px border.
- When "Custom" is active, reveal beneath it a row of seven 44x44 day chips, radius 999, labelled
  S M T W T F S; selected chips are solid gold with near-black text, unselected are #1D2128 with
  muted text. Show M, W, F selected.
- Below that a 12px muted hint: "Selecting no day repeats every day."
- Alternative custom mode: a row reading "Every" + a 72px numeric input showing "3" + "days".
- Bottom: a full-width 56px primary gold button "Swear the rite", and beneath it a 14px muted
  centred "Cancel".
```

### 5.5 — The Flame (task detail / streak history)

```
Screen: "THE FLAME" — one habit's streak history. Scrolling, with a native-style back chevron and
the title "THE FLAME" in  uppercase 20px in a top bar.

- A hero block: the task title "Cold shower" in 28/34 bold; beneath it "Every day · started 12 June"
  in 14px muted; a gold fret line under it.
- A card with three stats in a row, separated by vertical hairlines: "14" / "CURRENT" in gold 28px,
  "31" / "LONGEST" in #F2F4F7 28px, "27/30" / "LAST 30 DAYS" 28px with a 6px gold track beneath
  showing 90%.
- A section eyebrow "THE LAST NINETY DAYS" over a card containing a heatmap: a grid of 7 rows by
  13 columns of 14px rounded-2 squares, 4px gaps, with weekday initials down the left in 12px
  muted. Cell colours: done = #D79E2D, missed = #2E1416 with a 1px #E5484D border, pending today =
  1px gold dashed border on #1D2128, not due = #1D2128, future = transparent with a 1px #2A2F38
  border. Below the grid a legend of five 12px labelled dots: Kept, Missed, Today, Not due, Ahead.
- A card of two rows: "Completed days" → "63", "Last kept" → "Today, 06:12" — label 14px muted
  left, value 16px right, hairline between.
- Bottom: a secondary button "Archive rite", then a danger-outline button "Delete rite".
```

### 5.6 — The Forge (tab 3, workout history)

```
Screen: "THE FORGE" — workout history. Include the bottom tab bar (Forge active).

Header: "THE FORGE"  uppercase 28px, "16 sessions · 84,120 kg lifted" 14px muted, gold fret
line.

If a session is open, a prominent card at the top with an accent tint (#2B2110 fill, 3px gold left
rule): eyebrow "AT THE ANVIL", a 10px pulsing green dot with "In progress · 24m 10s" 20px, the
muted line "3 exercises · 11 strikes", and a full-width 56px gold button "Return to the anvil".
Otherwise, in that position: a full-width 56px gold primary button "Light the forge".

Then a section eyebrow "THE ANNALS OF THE FORGE" over a list of session cards, each:
- Top row: date "Sat 16 Aug" 16px semibold left, duration "1h 04m" 14px muted right.
- A stat row of three: "18" / "STRIKES", "5,240 kg" / "TONNAGE", "6" / "LIFTS" — 20px tabular
  values, 12px uppercase muted captions.
- A wrapped row of exercise chips, radius 999, #1D2128, 12px muted text: "Bench press", "Squat",
  "Row", "Overhead press", "+2".
Show four such cards with varied numbers.

Second frame: the empty state — "The forge is cold" 16px, "Log a session and Kairo keeps the
record." 14/20 muted, and the "Light the forge" primary button.
```

### 5.7 — The Anvil (active workout session)

```
Screen: "THE ANVIL" — the live workout logger. This is used with weights in hand: the largest tap
targets in the app, nothing smaller than 56px, no cramped rows.

Top bar: back chevron, "THE ANVIL"  uppercase 20px, and on the right a live elapsed timer
"24:10" in 20px tabular gold.

- A rest-timer band (THE BREATH) directly under the top bar when a rest is running: full-width
  #1D2128 block, 96px tall, containing "01:12" in 56px tabular gold centred, a 12px uppercase muted
  caption "THE BREATH", and a thin 4px gold progress track along the very bottom edge of the band
  that depletes left to right.
- A card: eyebrow "CURRENT LIFT", the exercise name "Bench press" 20px bold, and a 14px muted line
  "Last time: 4 × 8 @ 80 kg". A gold 14px "Change" text button on the right of the eyebrow row
  (opens The Armory).
- The entry row: two side-by-side fields, each with a 12px uppercase label — "REPS" and
  "WEIGHT (KG)" — 56px inputs, numeric, showing "8" and "82.5". To the right of the weight field, a
  small 44x44 "−" and "+" stepper pair, radius 8.
- A full-width 64px primary gold button "Strike — log set 5" with near-black text.
- A section eyebrow "STRIKES THIS SESSION" over a card grouped by exercise: an exercise sub-header
  in 12px uppercase gold, then rows of "SET 4 · 8 reps · 82.5 kg" — set number in a 28px gold
  circle chip on the left, reps and weight 16px, a right-aligned muted "1RM 103 kg", hairlines
  between rows. Show two exercise groups, four sets each.
- Bottom, pinned above the safe area: a secondary "Add another lift" and a danger-outline
  "Finish session".

Second frame: the same screen with the rest band absent and a "Choose an exercise" empty prompt in
place of the current-lift card, with a gold primary "Open the armory".
```

### 5.8 — The Armory (exercise library, modal)

```
Screen: "THE ARMORY" — exercise picker, presented as a full-height modal sheet.

- Top: grab handle, "THE ARMORY"  uppercase 20px, "Cancel" in gold 14px right.
- A 56px search input with a 22px "magnify" icon inside on the left, placeholder "Search the
  armory".
- A horizontal scrolling row of filter chips, radius 999, 44px tall: "All" (active, solid gold,
  near-black text), "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Custom".
- A list of rows, 56px each, hairline separated: left a 22px outline icon suggesting the equipment
  ("dumbbell", "weight-lifter", "kettlebell"), then the exercise name 16px, beneath it a 12px muted
  "Chest · Barbell", and on the right a 12px muted "4 × 8 @ 80 kg" showing the last performance.
  Custom exercises carry a small gold-outlined "CUSTOM" pill instead.
  Rows: Bench press, Incline bench press, Barbell row, Pull-up, Squat, Romanian deadlift,
  Overhead press, Lateral raise.
- Pinned at the bottom: a secondary full-width button "Forge a custom lift".

Second frame: the "Forge a custom lift" state — fields "NAME" (placeholder "Landmine press"),
"MUSCLE GROUP" as a wrapping chip selector, "EQUIPMENT" as a chip selector, and a primary
"Add to the armory".
```

### 5.9 — The Stele (completed session detail)

```
Screen: "THE STELE" — the inscribed record of one finished session. Scrolling, back chevron, title
"THE STELE" in  uppercase 20px.

- A hero block styled like an inscribed stone slab: #15181D with a 1px #2A2F38 border, a 2px gold
  fret line across the top inside edge, and 2–3 fluting hairlines at the left. Inside: "Saturday
  16 August" 20px  uppercase, "18:04 – 19:08" 14px muted.
- A stat row of four, inside that block, values 28px tabular and captions 12px uppercase muted:
  "1h 04m" / DURATION, "18" / STRIKES, "5,240 kg" / TONNAGE, "6" / LIFTS.
- A section eyebrow "THE STRIKES" over a card, grouped by exercise. Each group: a sub-header row
  with the exercise name in 16px semibold and a right-aligned muted "1,640 kg"; then set rows —
  a gold 24px circled set number, "8 reps" 16px, "82.5 kg" 16px right-aligned, and a muted "RPE 8"
  where present. Hairlines between sets, an 18px gap between groups.
  Show: Bench press (4 sets), Barbell row (4 sets), Overhead press (3 sets).
- A card with a "NOTES" eyebrow and the body text "Left shoulder felt tight on the last set." in
  16/24; muted italic "No notes" if empty.
- A footer row of two secondary buttons side by side: "Edit" and "Delete", the second in danger
  outline.
```

### 5.10 — The Feast (tab 4, macros day log)

```
Screen: "THE FEAST" — the day's food log against targets. Include the bottom tab bar (Feast
active).

Header: a day navigator row — a 44x44 "chevron-left" button, the centred title "THE FEAST" in
 uppercase 20px with "Today · Monday 18 August" 12px muted beneath it, and a 44x44
"chevron-right" button (dimmed to 40% when the day is today). Gold fret line beneath.

Then the four-metric block, as one card, eyebrow "THE FOUR STORES":
- "CALORIC FORGE" — the hero: "1,540" in 28px tabular gold with a muted "/ 2,600 kcal" beside it,
  a 10px-tall track (#1D2128, radius 999) with a 59% gold fill, and a right-aligned 12px muted
  "1,060 left".
- Then three compact rows, each a 12px uppercase label, a right-aligned "112 / 180 g" in 12px, and
  a 6px track: "PROTEIN DEN" green 62%, "THE GRANARY" blue 48%, "THE FAT POOL" violet 71%.
- The eyebrow row carries a gold 12px "THE DECREE ›" on the right (edit targets).
- Over-target case: show a second frame where the Granary fill is full and its numbers are amber
  #E07B39 with "+24 g over" in place of "left".

Then one section per meal, in order, each an eyebrow with the Greek name, the plain name in muted
parentheses, and the meal's calories right-aligned in 12px:
"DAWN (BREAKFAST) — 420 kcal", "ZENITH (LUNCH) — 610 kcal", "DUSK (DINNER) — 380 kcal",
"EMBERS (SNACKS) — 130 kcal".
Each contains a card of entry rows, 56px: food name 16px, beneath it a 12px muted
"1.5 × 100 g · 31 g P · 0 g C · 4 g F", and a right-aligned "248 kcal" 16px tabular. Hairlines
between rows. Beneath each card, a 44px ghost row with a gold "plus" icon and the 14px gold text
"Add an offering".
Show 2 entries under Dawn, 3 under Zenith, 2 under Dusk, 1 under Embers.

A 12px muted footnote at the very bottom: "Long-press an entry to remove it."

Third frame: the no-targets state — the four-store card shows consumed values with no tracks and no
"/ target", plus an accent-tinted status block titled "No decree set" reading "Set calorie and macro
targets so Kairo can measure the day." with a gold "Set the decree" button.
```

### 5.11 — The Offering (add food, modal)

```
Screen: "THE OFFERING" — add a food to a meal. Full-height modal sheet.

Stage 1 (search):
- Grab handle, "THE OFFERING"  uppercase 20px, "Cancel" gold 14px right.
- A 56px search input, "magnify" icon, placeholder "Search your foods".
- A section eyebrow "YOUR STORES" over rows, 56px: food name 16px, beneath it 12px muted
  "100 g · 165 kcal · 31 P / 0 C / 3.6 F", and a right chevron. Rows: Chicken breast, Whey scoop,
  White rice, Olive oil, Greek yoghurt, Almonds.
- Pinned bottom: secondary full-width "Forge a new food".

Stage 2 (quantity — a second frame): the chosen food's name as a 20px title with its per-serving
line beneath; a "QUANTITY (SERVINGS)" field 56px showing "1.5" with 44x44 "−"/"+" steppers and a
row of quick chips "0.5 / 1 / 1.5 / 2"; a "MEAL" segmented control of four 56px options
Dawn / Zenith / Dusk / Embers with Zenith active; then a computed-preview card, accent-tinted, with
four stats in a row: "248 kcal", "46.5 g P", "0 g C", "5.4 g F"; and a full-width gold primary
"Make the offering".

Stage 3 (custom food — a third frame): fields "NAME" (placeholder "Chicken breast"), "SERVING
LABEL" (placeholder "100 g"), then a 2x2 grid of numeric fields "CALORIES", "PROTEIN (G)",
"CARBS (G)", "FAT (G)", a 12px muted hint "Both , and . work as the decimal separator.", and a
primary "Add to your stores".
```

### 5.12 — The Decree (macro targets, modal)

```
Screen: "THE DECREE" — set macro targets. Modal sheet.

- Grab handle, "THE DECREE"  uppercase 20px, "Cancel" gold right.
- A 14/20 muted paragraph: "A decree applies from today forward. Past days keep the decree they
  were measured against."
- Four fields, each 56px with a 12px uppercase label and a unit suffix inside the input's right
  edge in muted 14px: "CALORIC FORGE" 2600 kcal, "PROTEIN DEN" 180 g, "THE GRANARY" 260 g,
  "THE FAT POOL" 80 g.
- A derived read-out card, accent-tinted: "2,600 kcal from these macros" with a 12px muted
  breakdown "720 P · 1,040 C · 720 F", plus an amber warning variant in a second frame reading
  "Macros total 2,480 kcal — 120 short of the forge."
- A row showing "EFFECTIVE FROM" with the value "Today, 18 August" and a gold "Change" text button.
- Full-width gold primary "Issue the decree", then a muted centred "Cancel".
```

### 5.13 — The Scales (tab 5, weight trend)

```
Screen: "THE SCALES" — body-weight trend. Include the bottom tab bar (Scales active).

Header: "THE SCALES"  uppercase 28px, "Last 90 days" 14px muted, gold fret line.

- A stat row inside one card, three across, separated by vertical hairlines: "74.8 kg" / "TREND"
  (28px, gold), "−1.4 kg" / "30 DAYS" (28px, green), "72.0 kg" / "THE VOW" (28px, #F2F4F7). Beneath
  the vow stat a 12px muted "2.8 kg to go".
- A chart card, 240px tall: a hand-drawn line chart on #15181D. Raw daily readings as small 3px
  #98A2B3 dots; the 7-day moving average as a 2px #D79E2D line with a subtle flat gold area fill
  beneath it at 8% opacity; the goal as a 1px dashed #3FB950 horizontal line labelled "VOW 72.0" in
  10px green at its right end. Y-axis: three 12px muted labels on the left (78, 75, 72). X-axis:
  three 12px muted month labels. A 1px #2A2F38 baseline. No gridlines beyond that.
- A range segmented control beneath the chart: "30 D", "90 D", "1 Y", "ALL" — 44px tall, 90 D
  active in gold.
- A section eyebrow "THE WEIGHINGS" over rows, 56px, hairline separated: the date "Sun 17 Aug" 16px
  left; the weight "74.6 kg" 16px tabular right; beneath the date a 12px muted note where present
  ("Fasted"); and a right-aligned 12px delta in green or red ("−0.2").
  Show six rows.
- A 12px muted footnote: "Long-press a weighing to remove it."
- Pinned bottom: a full-width gold primary "Step on the scales" and a secondary "Set the vow".

Second frame: the empty state — "Nothing weighed yet" with "One weighing a day, at the same hour,
is enough." and the primary button.
```

### 5.14 — The Weighing (log weight, modal)

```
Screen: "THE WEIGHING" — log today's weight. A short modal sheet, not full height.

- Grab handle, "THE WEIGHING"  uppercase 20px, "Cancel" gold right.
- The main field: a 96px-tall input with the value "74.6" in 56px tabular #F2F4F7, centred, and a
  unit toggle to its right — two 44px pill segments "KG" (active, solid gold, near-black) and "LB"
  (#1D2128, muted).
- A 12px muted hint centred: "Pre-filled from your last weighing so the unit cannot silently
  change."
- A "NOTE" field, 56px, placeholder "Fasted, post-workout, …".
- A row "WHEN" with the value "Today, 07:12" and a gold "Change" text button.
- Full-width gold primary "Record it", then a muted centred "Cancel".
```

### 5.15 — The Vow (goal weight, modal)

```
Screen: "THE VOW" — set or clear the goal weight. A short modal sheet.

- Grab handle, "THE VOW"  uppercase 20px, "Cancel" gold right.
- A 14/20 muted line: "A vow draws a line on the chart. It changes nothing else."
- One 96px numeric field showing "72.0" in 56px tabular with the KG/LB pill toggle beside it.
- An accent-tinted block: "2.8 kg from your current trend of 74.8 kg" with a 12px muted second line
  "At 0.4 kg a week, about seven weeks."
- Full-width gold primary "Swear the vow"; beneath it a danger-outline "Break the vow" (clears it);
  beneath that a muted centred "Cancel".
```

### 5.16 — The Expedition (tab 6, movement history)

```
Screen: "THE EXPEDITION" — GPS activity history. Include the bottom tab bar (March active).

Header: "THE EXPEDITION"  uppercase 28px, "42 marches · 318 km" 14px muted, gold fret line.
Top-right: a 44x44 "cog-outline" button (The Compass).

- If a recording is live: an accent-tinted card at the top, 3px gold left rule, eyebrow "ON THE
  MARCH", a pulsing green dot with "Recording · 4.812 km" 20px, muted "28:04 moving", and a
  full-width gold button "Rejoin the march".
- Otherwise in that slot: a full-width 56px gold primary "Cross the threshold".
- A weekly summary card, eyebrow "THIS WEEK": three stats across with vertical hairlines —
  "3" / MARCHES, "24.6 km" / DISTANCE, "2h 18m" / MOVING. Beneath them a 7-column mini bar chart of
  the week's daily distance in gold on #1D2128, with weekday initials in 12px muted below.
- A section eyebrow "THE CHRONICLES" over activity cards, each:
  - A 64px-tall dark route thumbnail on the left (a stylised gold polyline on #1D2128, rounded 8),
  - Right of it: the activity name "Evening dromos" 16px semibold, a 12px muted "Sat 16 Aug ·
    18:12", and a stat line in 14px "8.42 km · 42:10 · 5:00 /km".
  - A type pill at the top-right, radius 999, #1D2128 with a 12px gold label: "DROMOS", "MARCH" or
    "CHARIOT", each with a matching 12px icon (run, walk, bike).
  Show four cards, mixing all three types, one showing "5.2 km · 58:20 · 11:12 /km" for a walk and
  one showing "24.1 km · 1h 02m · 23.2 km/h" for a ride.

Second frame: the empty state — "No ground covered yet" with "Record a dromos, a march or a chariot
and Kairo keeps the route." and the primary button.
```

### 5.17 — The Threshold (movement readiness)

```
Screen: "THE THRESHOLD" — choose an activity and clear permissions before recording. Back chevron,
title "THE THRESHOLD" in  uppercase 20px.

- A 14/20 muted intro: "Kairo records the route on this device. Nothing leaves it until the march
  is finished."
- Three large selection cards, stacked, each 96px tall, radius 12: a 32px outline icon on the left
  ("run", "walk", "bike"), the Greek name in 20px  uppercase, the plain word beneath in 12px
  muted, and a 24px radio circle on the right. Cards: "DROMOS / Run", "MARCH / Walk",
  "CHARIOT / Ride". The selected card has a 1px #D79E2D border, a #2B2110 fill and a filled gold
  radio; the others have a #2A2F38 border on #15181D.
- A section eyebrow "READINESS" over a card of three check rows, each 56px: a 22px status icon, a
  16px label, a 12px muted detail, hairlines between.
  - green "check-circle" — "Location while in use" — "Granted"
  - amber "alert-circle-outline" — "Location in the background" — "Needed to keep recording with
    the screen locked" with a gold 14px "Grant" text button on the right
  - green "check-circle" — "GPS signal" — "Strong · ±4 m"
- An amber status block (3px left rule, #2E1B0F fill) titled "Expo Go test mode" reading
  "Background recording needs a development build. Recording here stops when the app leaves the
  foreground."
- A "UNITS" row showing "Metric (km)" with a gold "Change" text button.
- Pinned bottom: a full-width 64px gold primary "Begin the march".

Second frame: the permission-denied state — a danger status block titled "Location denied" reading
"Kairo cannot record a route without location access." with a secondary button "Open settings", and
the primary button disabled at 40%.
```

### 5.18 — The March (live tracking)

```
Screen: "THE MARCH" — live GPS recording. This is glanced at mid-stride: the primary numbers must
be readable at arm's length.

Layout, top to bottom:
- The map fills the upper 55% of the screen, edge to edge, in a DARK custom map style: near-black
  landmass #0B0D10, slightly lighter roads #1D2128, no points of interest, no labels except major
  roads, water #12233A. The travelled route is a 5px #D79E2D polyline with rounded joins; the
  current position is a 14px gold dot with a near-black ring and a soft gold heading cone. Overlaid
  bottom-right of the map: a 44x44 #15181D "crosshairs-gps" button with a 1px border (recenter).
  Overlaid top-left: a small #15181D pill with a 12px gold "DROMOS" label and a green ±4 m accuracy
  dot.
- Directly beneath the map: the hero readout on #0B0D10 — "4.812" in 56px tabular gold, centred,
  with "KM" in 12px uppercase muted beside it, and "TOTAL DISTANCE" in 12px uppercase muted
  underneath.
- A stat row of three, separated by vertical hairlines, values 28px tabular, captions 12px uppercase
  muted: "28:04" / MOVING, "29:41" / ELAPSED, "5:00" / PACE /KM. For a ride, the third becomes
  "23.2" / KM/H.
- A slim status strip: when auto-paused, a full-width amber band, 44px tall, #2E1B0F, with a 12px
  uppercase bold "HELD — NO MOVEMENT DETECTED" in #E07B39 and a gold "Resume" text button.
- Bottom controls, pinned above the safe area, in one row: a large 72px circular secondary button
  with a "pause" icon (or "play" when paused) and a 12px label beneath, and a 72px circular
  danger-outline button with a "flag-checkered" icon labelled "Finish". Between them a 12px muted
  vertical "hold to finish" hint.

Second frame: the "waiting for a fix" state — the map dimmed 40%, the helmet mark with its gold arc
centred over it, and the caption "Waiting for a GPS fix" 14px muted; the hero readout shows
"0.000" and the controls are disabled at 40%.

Third frame: the finish confirmation — a modal sheet titled "END THE MARCH?" with the body "Your
route will be inscribed in the chronicles." and two buttons: gold primary "Inscribe it" and
secondary "Keep going".
```

### 5.19 — The Chronicle (activity detail)

```
Screen: "THE CHRONICLE" — one finished activity. Scrolling, back chevron, title "THE CHRONICLE" in
 uppercase 20px, and a 22px "pencil-outline" edit icon at the right.

- A 200px map card at the top, same dark map style, showing the whole route as a 4px gold polyline
  with a green start dot and a red-outlined end dot. Overlaid bottom-left: a 12px #15181D pill
  "DROMOS". Bottom-right: a 44x44 "play-circle-outline" button labelled beneath in 12px gold
  "The retelling".
- A title block: an editable activity name "Evening dromos" in 20px, "Saturday 16 August · 18:12"
  14px muted, gold fret line.
- A 2x3 stat grid in one card, values 28px tabular, captions 12px uppercase muted:
  "8.42 km" / DISTANCE, "42:10" / MOVING, "44:02" / ELAPSED, "5:00 /km" / AVG PACE,
  "112 m" / CLIMB, "01:52" / HELD.
- A section eyebrow "THE SPLITS" over a card: rows of "1 KM" left in 12px uppercase muted, a
  horizontal bar in gold whose length encodes the split's pace (fastest = longest), and the split
  time "4:52" right-aligned in 14px tabular. The fastest split's bar is gold and carries a 10px
  near-black "FASTEST" tag; slower splits use #3F4552. Show 8 rows plus a final partial "0.42 KM".
- A section eyebrow "ELEVATION" over a 120px area chart: a 1px #98A2B3 line with a flat 8% #98A2B3
  fill beneath, on #15181D.
- A section eyebrow "THE TIMELINE" over a vertical event list: a 1px #2A2F38 rail down the left with
  8px dots, each event a 14px label and a 12px muted timestamp — "Started 18:12", "Held 18:31",
  "Resumed 18:33", "1 km — 4:52 (cue)", "Finished 18:56".
- Footer: secondary "Edit the record", danger-outline "Delete".

Second frame: the edit state — the name in an active input, a "TRIM THE ROUTE" card containing two
labelled rows "Start" and "End", each with 44x44 "minus"/"plus" steppers and a value ("+00:12",
"−00:04"), a 12px muted line "Trimming never deletes points — it only excludes them from the
summary.", and buttons "Apply trim" (gold) and "Cancel".
```

### 5.20 — The Retelling (route replay)

```
Screen: "THE RETELLING" — offline animated replay of a saved route. Back chevron, title "THE
RETELLING" in  uppercase 20px.

- The dark map fills the upper 60%. The full route is drawn as a 2px #3F4552 line; the portion
  already replayed is overdrawn as a 5px #D79E2D line; a 16px gold marker with a near-black ring
  sits at the current frame. A 12px #15181D pill top-left reads "00:18:24 / 00:44:02".
- Beneath: a live stat row of three, values 28px tabular, captions 12px uppercase muted —
  "3.61 km" / DISTANCE, "5:04" / PACE /KM, "62 m" / CLIMB.
- A scrubber: a full-width 4px #1D2128 track with a gold filled portion and a 24px gold thumb;
  12px muted timestamps at both ends. Small gold tick marks on the track at each kilometre.
- A control row, centred, 72px tall: "restart" (44x44 secondary circle), "play"/"pause" (72px gold
  circle with near-black glyph — the primary), and a speed control to the right as four 44px pill
  segments "1×" "2×" "4×" "8×" with 2× active in gold.
- A 12px muted footnote: "Replay reads only stored points. It works with no signal."

Second frame: the no-route state — "No route to retell" 16px with "This activity has no accepted
points." 14px muted and a secondary "Back to the chronicle".
```

### 5.21 — The Compass (movement settings)

```
Screen: "THE COMPASS" — movement preferences. Back chevron, title "THE COMPASS" in  uppercase
20px. A short settings screen of grouped rows.

- Section eyebrow "MEASURE" over a card: one row "Units" 16px with a 12px muted "Distance, pace and
  cues" beneath, and on the right a two-segment pill toggle "KM" (active gold) / "MI".
- Section eyebrow "THE HERALD'S VOICE" over a card of rows, each 56px with a 16px label, a 12px
  muted detail, and a toggle switch on the right (on = gold track, near-black knob):
  - "Voice cues" — "Spoken updates during a march" — ON
  - "Distance cues" — "Every 1 km" — ON, with a gold "Change" text button
  - "Time cues" — "Every 10 minutes" — ON, with a gold "Change" text button
  - "Announce splits" — "Call each kilometre as it lands" — ON
  A 12px muted footnote: "Cues play through the speaker or connected Bluetooth audio."
- Section eyebrow "THE HOLD" over a card:
  - "Autopause" — "Pause when you stop moving" — toggle ON
  - "Threshold" — "Run below 0.8 m/s · walk 0.35 · ride 1.0" — a muted read-only row
- Section eyebrow "THE RECORD" over a card: "Keep raw points" — "Always. Edits never delete GPS
  data." — a muted read-only row with a 22px "lock-outline" icon.
- An amber status block at the bottom when relevant: "Expo Go test mode — background recording and
  spoken cues need a development build."
```

### 5.22 — The Call (reminders)

```
Screen: "THE CALL" — local reminders. A list screen with an inline form as its header. Back chevron,
title "THE CALL" in  uppercase 20px.

- Header block: "THE CALL" 28px  uppercase, "Kairo speaks at the hour you name" 14px muted,
  gold fret line.
- A runtime status block, amber (#2E1B0F, 3px #E07B39 left rule), titled "Reminders will not fire
  here" reading "Expo Go cannot schedule notifications on Android. The rows below are saved and
  will fire in a development build." (Show a muted info-tone variant in a second frame reading
  "Local reminders only on this device.")
- A form card, eyebrow "SUMMON A NEW CALL":
  - Field "NAME", 56px input, placeholder "Morning workout".
  - Field "TIME": a 56px input showing "0700" in 28px tabular, NUMERIC KEYPAD ONLY — four digits,
    no colon key — with the 12px muted hint "Four digits on a 24-hour clock. 1830 is half past six
    in the evening."
  - Field "DAYS": seven 44x44 chips, radius 999, S M T W T F S; selected are solid gold with
    near-black text. Show M–F selected. Beneath: 12px muted "No day selected repeats every day."
  - A full-width 56px gold primary "Sound the call".
- A section eyebrow "THE STANDING CALLS" over rows, 72px tall, hairline separated:
  - Left: the time "07:00" in 20px tabular #F2F4F7.
  - Middle: the label "Morning workout" 16px, beneath it 12px muted "Weekdays".
  - Right: a toggle switch (gold when on).
  - Rows that the OS never accepted carry a 12px amber pill "SAVED, NOT SCHEDULED" under the label.
  Show four rows: 07:00 Morning workout (weekdays, on), 12:30 Eat (every day, on), 21:45 Stretch
  (Mon Wed Fri, off), 05:30 Long run (Sundays, on, SAVED NOT SCHEDULED).
- 12px muted footnote: "Tap a call to edit it. Long-press to delete."

Second frame: the empty state — "No calls yet" with "Name a time and Kairo will speak." and the
form focused.

Third frame: the delete confirmation — a small centred dialog on a dimmed screen, "Delete
reminder?" title, body "Morning workout, 07:00", buttons "Cancel" (secondary) and "Delete"
(danger).
```

### 5.23 — The Oracle (daily quote + wallpaper)

```
Screen: "THE ORACLE" — the day's quote and the generated wallpaper. Back chevron, title "THE
ORACLE" in  uppercase 20px.

- A hero quote block, full width, 260px tall, #15181D with a 1px #2A2F38 border and a 2px gold fret
  line inset at both the top and bottom edges, plus fluting hairlines at the left. Inside, centred:
  the quote "Know thyself." in  28/34 uppercase #F2F4F7, and beneath it "— Inscribed at
  Delphi" in 14px muted. A tiny 16px helmet mark centred at the very bottom of the block.
- A muted 12px caption beneath: "The oracle speaks once a day. Monday, 18 August."
- A section eyebrow "THE STANDARD" over a card: a 9:16 wallpaper preview, 200px tall, centred and
  rounded 12, showing the same quote rendered over a near-black field with a gold rule and the
  helmet mark — it is a phone wallpaper, portrait.
- Beneath the preview, a row of two buttons: a full-width gold primary "Take the standard" (save to
  photos) and a secondary "Forge another".
- States, each as a separate frame:
  - Unconfigured: an info status block "Sync is not configured" with "The standard is rendered by
    Kairo's server. Add sync configuration to forge one." and the primary replaced by a disabled
    "Preview only".
  - Loading: the helmet mark with its gold arc in the preview's place, caption "Forging the
    standard".
  - Error: a danger status block titled "Could not forge a standard" with the body "The server
    could not render it (503)." and a secondary "Try again".
  - Saved: a success-tinted block "Standard saved to your photos."
```

### 5.24 — The Gates (onboarding, new)

```
Screens: "THE GATES" — a three-panel first-run flow. Produce all three as separate frames, each
390x844, dark, with a 3-dot progress indicator at the bottom (active dot gold, others #2A2F38).

Panel 1 — the arrival: the Spartan helmet mark large (120px) and centred on #0B0D10, "KAIRO" beneath
it in  uppercase 28px letter-spacing 3, then "One app for the work you owe yourself." in
16/24 muted centred. A gold fret line above a full-width gold primary "Enter".

Panel 2 — the measures: title "THE MEASURES"  uppercase 20px, body "Set these once. Change
them in the Sanctum." Then three rows, each a 16px label with a two-segment pill toggle on the
right: "Weight" KG/LB, "Distance" KM/MI, "Week starts" MON/SUN. Then a full-width gold "Continue"
and a muted "Skip".

Panel 3 — the permissions: title "THE GATEKEEPERS"  uppercase 20px, body "Kairo asks for as
little as it can." Then three cards, each with a 24px outline icon, a 16px title, a 12/18 muted
reason, and a secondary 44px "Allow" button:
- "bell-outline" — "Reminders" — "So the call can reach you at the hour you set."
- "map-marker-outline" — "Location" — "Only while a march is being recorded."
- "image-outline" — "Photos" — "Only to save a standard you asked for."
A 12px muted footnote: "Everything works offline. Nothing is uploaded unless you configure sync."
Then a full-width gold primary "Cross the threshold".
```

### 5.25 — The Sanctum (settings hub, new)

```
Screen: "THE SANCTUM" — the settings hub. Back chevron, title "THE SANCTUM" in  uppercase
20px. Grouped rows, no cards-within-cards.

Header: the helmet mark at 40px beside "KAIRO" in  20px and "Version 1.0.0" in 12px muted.
Gold fret line.

Section eyebrow "THE MEASURES" — card of rows with right-aligned pill toggles or values:
- "Weight" — KG / LB
- "Distance" — KM / MI
- "Week starts" — MON / SUN
- "First screen" — value "The Citadel", chevron

Section eyebrow "THE HERALD" — card:
- "Reminders" — 12px muted "3 standing calls" — chevron (opens The Call)
- "Movement cues" — 12px muted "Distance and time, on" — chevron (opens The Compass)

Section eyebrow "THE ENVOY" — card:
- "Sync" — a 12px green "Configured · last ran 12 minutes ago" — chevron (opens The Envoy)
- "Satchel" — a 12px muted "0 items waiting" — chevron

Section eyebrow "THE RECORD" — card:
- "Export everything" — 12px muted "A single JSON file" — chevron
- "The Pantheon" — 12px muted "Your feats" — chevron
- "The Annals" — 12px muted "Weekly reckoning" — chevron

Section eyebrow "THE FOUNDATIONS" — card of muted read-only rows: "Database version — 9",
"Runtime — Expo Go", "Device — Android 15". Then a danger-outline full-width button "Raze local
data" with a 12px muted line beneath: "Deletes everything on this device. Not reversible."
```

### 5.26 — The Envoy (sync status, new)

```
Screen: "THE ENVOY" — sync state and the outbox queue. Back chevron, title "THE ENVOY" in 
uppercase 20px.

- A status hero card: a 40px "shield-check-outline" icon in gold, "Configured" in 20px, and
  "Last ran 12 minutes ago · 214 items delivered" in 14px muted. A success-tinted variant when
  healthy; a danger-tinted variant in a second frame with "shield-alert-outline", "Failed", and
  "Sign-in failed (401). Check the device key."
- A stat row of three inside one card: "0" / WAITING, "214" / DELIVERED, "1" / FAILED — the failed
  value in #E5484D.
- Section eyebrow "THE SATCHEL" over rows, 56px: a 22px module icon, a 16px label
  ("Weighing · 17 Aug"), a 12px muted "queued 3 minutes ago", and a right-aligned 12px state pill —
  gold "SENDING", muted "WAITING", red "FAILED · 3 TRIES". Show four rows including one failed with
  a gold "Retry" text button.
- Section eyebrow "THE ROAD" over a card of muted read-only rows: "Endpoint —
  https://api.kairo.local", "Token — expires in 41 minutes", "Retries — exponential, capped at
  10 minutes".
- Footer: a full-width gold primary "Send now" and a secondary "Forget credentials".
```

### 5.27 — The Pantheon (records, new)

```
Screen: "THE PANTHEON" — personal records across every module. Back chevron, title "THE PANTHEON"
in  uppercase 20px. This is the ONE screen permitted a laurel motif: a thin gold laurel pair,
16px, flanking the screen title only.

- A hero card: eyebrow "THE GREATEST FEAT", then "142.5 kg" in 56px tabular gold, "Deadlift · 12
  August" in 14px muted, and a 12px muted "Previous best 137.5 kg on 3 July".
- A section eyebrow "THE FORGE" over a card of feat rows, 56px, hairline separated: a 22px gold
  outline icon, the lift name 16px, a right-aligned value 16px tabular, and beneath the name a 12px
  muted date. Rows: "Deadlift — 142.5 kg — 12 Aug", "Squat — 120 kg — 5 Aug",
  "Bench press — 92.5 kg — 9 Aug", "Heaviest session — 8,140 kg — 2 Aug".
- A section eyebrow "THE EXPEDITION" over the same row shape: "Longest march — 21.4 km — 27 Jul",
  "Fastest 5 km — 22:41 — 3 Aug", "Best pace — 4:21 /km — 3 Aug", "Greatest climb — 486 m — 20 Jul".
- A section eyebrow "THE RITES" over: "Longest flame — 96 days — Cold shower", "Most kept in a day —
  8 — 14 Jun", "Perfect weeks — 11".
- A section eyebrow "THE SCALES" over: "Lowest trend — 73.9 kg — 16 Aug", "Greatest 30-day fall —
  2.6 kg — Jun".
- Rows unlocked in the last 7 days carry a 10px gold "NEW" pill after the name.
- A 12px muted footnote: "Feats are derived from your own records. Nothing here is a target."
```

### 5.28 — The Annals (weekly reckoning, new)

```
Screen: "THE ANNALS" — a weekly cross-module review. Back chevron, title "THE ANNALS" in 
uppercase 20px. Scrolling.

- A week navigator: 44x44 "chevron-left", centred "WEEK 34" in  uppercase 20px with
  "11 – 17 August" 12px muted beneath, 44x44 "chevron-right" (dimmed on the current week). Gold
  fret line.
- A verdict block, accent-tinted with a 3px gold left rule: a 20px line "A held week." and a 14/20
  body "Five rites kept every day, three marches, and the trend fell 0.6 kg. The Granary ran over
  on four days." (Written flatly, no praise.)
- A 2x2 grid of summary cards, each with an eyebrow, a 28px tabular value, a 12px caption, and a
  small inline chart:
  - "THE RITES" — "34 / 42" — "kept" — a 7-column dot row, gold for full days, red for missed.
  - "THE FORGE" — "4" — "sessions · 21,400 kg" — a 7-column bar sparkline in gold.
  - "THE FEAST" — "2,410" — "avg kcal · 88% of decree" — three thin stacked tracks (green/blue/violet).
  - "THE EXPEDITION" — "24.6 km" — "3 marches · 2h 18m" — a 7-column bar sparkline.
- A section eyebrow "THE SCALES" over a 140px line chart card: the week's trend line in gold with
  the previous week's in #3F4552 behind it for comparison, and a 12px legend.
- A section eyebrow "WHAT SLIPPED" over a card of three rows, each a 22px amber icon, a 16px label
  and a 12px muted detail: "Stretch — missed 4 of 7", "The Granary — over on 4 days",
  "Sunday long run — not recorded".
- A footer secondary button "The previous reckoning".
```

### 5.29 — The Agoge (programs, new — design ahead only)

```
Screen: "THE AGOGE" — multi-week training programs. This module is NOT built yet; design it as a
complete screen anyway so the visual system covers it. Back chevron, title "THE AGOGE" in 
uppercase 20px.

- A hero card: eyebrow "CURRENT AGOGE", "Strength — Week 3 of 8" 20px, a 10px-tall gold progress
  track at 37%, and a 14px muted "Next: Day 2 — Squat, Bench press, Row".
- A full-width gold primary "Begin day 2".
- A section eyebrow "THIS WEEK" over a card of four day rows, 56px: a 24px day chip (gold filled
  with near-black number when done, #1D2128 with muted number when not), the day's focus 16px, a
  12px muted lift list, and a right-aligned 12px state — "DONE", "TODAY" in gold, "AHEAD" muted.
- A section eyebrow "THE PROGRESSION" over a card holding a simple 8-column bar chart of planned
  weekly tonnage in #3F4552 with the completed weeks overdrawn in gold.
- A section eyebrow "OTHER AGOGES" over two selectable cards, each with a 16px title, a 12/18 muted
  description and a 44px secondary "Adopt" button: "Hypertrophy — 12 weeks, 4 days a week",
  "Bodyweight — 6 weeks, no equipment".
- A 12px muted footnote: "An agoge only proposes. Every session is still logged at the anvil."
```

### 5.30 — The Scrolls and The Lyre (future modules, design ahead only)

```
Produce TWO frames, both 390x844, dark, in the same system. These modules are not built; design them
so the visual language is already decided.

FRAME 1 — "THE SCROLLS" (a scripture reader):
- Back chevron, title "THE SCROLLS"  uppercase 20px, and a 22px "bookmark-outline" icon right.
- A reference header: "PSALM 23" in  uppercase 28px, "World English Bible" 12px muted, gold
  fret line.
- Body text in Inter 18/30 #F2F4F7 with small gold 12px superscript verse numbers, generous 18px
  paragraph gaps, and a comfortable 20px screen margin. Four verses of real-looking text.
- One verse highlighted with a #2B2110 fill and a 3px gold left rule to show the bookmark state.
- A bottom bar: 44x44 "chevron-left", a centred 14px "Psalm 23 · 6 verses", 44x44 "chevron-right",
  and an "A" type-size control.
- A section eyebrow "THE PLAN" over one row: "Day 34 of 365 · read" with a 6px gold track at 9%.

FRAME 2 — "THE LYRE" (music control):
- Back chevron, title "THE LYRE"  uppercase 20px.
- A 200px square album-art placeholder, rounded 12, #1D2128 with a centred 40px muted
  "music-note-outline" icon.
- Track title "Nothing playing" 20px centred, artist 14px muted centred.
- A 4px #1D2128 scrub track with a gold fill at 0% and 12px muted "0:00 / 0:00" at both ends.
- A control row: 44x44 "skip-previous", a 72px gold circle "play" with a near-black glyph, 44x44
  "skip-next".
- A card with a 22px "spotify"-like generic icon, "Spotify" 16px, "Not connected" 12px muted, and a
  44px secondary "Connect".
- A 12px muted footnote: "Kairo controls a session playing elsewhere. It does not play audio
  itself."
```

---

## 6. States pack (one prompt, generate last)

```
Produce ONE frame, 390x844, dark, titled "THE STATES" in  uppercase, showing Kairo's shared
states stacked vertically with 12px muted captions naming each. Same design system.

1. INTRO — the full-screen opening: #0B0D10, the Spartan helmet mark at 140px centred, "KAIRO" in
    uppercase 24px letter-spacing 3 beneath it, and a single 2px gold fret line beneath that.
   No spinner. (This plays once over the already-loaded app, so it must look final, not like a
   loading screen.)
2. LOADER — the helmet mark at 80px, STILL, with a 2px gold arc of about 90 degrees on a 1px
   #2A2F38 ring around it. The arc rotates; THE HELMET DOES NOT. Show it on #0B0D10 only — the
   mark's interior is opaque background-coloured pixels, so it shows dark patches on any lighter
   surface.
3. INLINE LOADER — the same ring at 24px, no mark, for use inside a button.
4. EMPTY — a 40px muted outline icon, a 16px title "No records yet", a 14/20 muted line, and a
   56px primary button.
5. ERROR — a danger-tinted block: 3px #E5484D left rule, bold 14px red title "Could not read
   today's data", 14/20 body naming the failed step, and a 44px secondary "Try again".
6. DEGRADED RUNTIME — an amber block: "Reminders will not fire here" with the Expo Go explanation.
7. PERMISSION DENIED — an info block with a 22px icon, the reason, and a secondary "Open settings".
8. OFFLINE — a slim 32px full-width strip, #1D2128, 12px muted centred "Offline — everything is
   saved on this device."
9. CONFIRM DIALOG — a centred 280px-wide card on a 60%-black scrim: 16px bold title, 14/20 muted
   body, and a right-aligned button pair "Cancel" (text) and "Delete" (danger).
10. TOAST — a 48px pill, #1D2128, 1px border, a 16px green check and 14px "Standard saved to your
    photos."
```

---

## 7. DO-NOT list (repeat in a follow-up if Stitch drifts)

```
Do not use any of the following:
- White or light text on the gold accent. Text on gold is always #0B0D10.
- A rotating, tilted, or animated helmet. The mark is always upright and still.
- The helmet mark inside data cards, as a bullet, as a watermark, or repeated.
- Photographic marble, stone textures behind text, statues, temples, columns as illustration,
  laurel wreaths (except the Pantheon title), togas, or any classical clip-art.
- Glassmorphism, backdrop blur, frosted panels, neon glow, outer glow, text shadow, bevels, or
  fake 3D.
- Gradient-filled text, gradient borders, or more than two linear gradients in the whole app.
- Teal/orange "gaming HUD" palettes, purple-pink AI gradients, or any colour outside the listed set.
- Emoji, exclamation marks, motivational filler copy, or renamed destructive verbs.
- Light-mode surfaces, white cards, or a light status bar.
- Custom icon illustrations — Material Community Icons outline only.
- Charts with stacked areas, 3D bars, pie charts with more than four slices, or gradient series.
- Cramped text: body copy always carries its line-height from the type scale.
```

---

## 8. After Stitch: mapping designs back to the codebase

Stitch output is a design, not this app's code. When implementing:

1. **Screen structure comes from `src/components/Layout.tsx`**, not from a screen's own
   `StyleSheet` — `Screen`, `ScreenScroll`, `ScreenHeader`, `Section`, `Card`, `Notice`,
   `EmptyState`, `Field`, `Divider`, `Stat`. Extend that file with the new primitives these designs
   need (`StatRow`, `MeanderRule`, `Chip`, `DayChips`, `Pill`, `Heatmap`, `SegmentedControl`,
   `ListRow`, `Toggle`) rather than rebuilding them per screen.
2. **Tokens go in `src/theme/index.ts`.** The palette above is already there; adding  means
   `expo-font` plus a Google-Fonts package, and the display font must be loaded before the intro
   overlay hides or titles will reflow visibly.
3. **Two dependencies these designs imply, both currently absent** — decide before building:
   `expo-linear-gradient` (only if you keep the two permitted gradients) and a font package for
   . Nothing else new is required: the fret lines, rings, heatmaps, sparklines and route
   thumbnails are all `react-native-svg`, which ships already.
4. **The dark map style is a `customMapStyle` JSON** on `react-native-maps`; the gold polyline is a
   `Polyline` with `strokeColor="#D79E2D"`. Without that style the Greek theme breaks the moment a
   map appears.
5. **Renames are display-only.** `MealType` stays `breakfast|lunch|dinner|snack`, `MovementType`
   stays `run|walk|ride`, routes keep their folder names, and the sync payloads are untouched.
   Put the Greek labels in one map per module (like `MEAL_LABELS` in `src/domain/macros.ts`) so a
   rename is one edit and never touches storage.
6. **Keep the four constraints the current UI pass established**: the mark never rotates; the mark
   and loader sit only on `colors.background`; `useRef(new Animated.Value(0)).current` fails
   `react-hooks/refs` (use the local `useAnimatedValue()` in `Logo.tsx`); and `setState` called
   synchronously inside an effect fails `react-hooks/set-state-in-effect`.
7. **Every screen still needs its loader `.catch` → `Notice tone="danger"`.** Thirteen screens are
   still unguarded (see `to_continue_with.md`); a rebuild is the moment to fix that rather than
   restyle around it.
8. **Time entry stays four digits, numeric keypad.** `keyboardType="numbers-and-punctuation"` is
   iOS-only and left the Android field unfillable — that bug is why The Call's design specifies
   digits with no colon.
