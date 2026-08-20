# The design handoff — read the markup, not the pictures

30 designs live in `media/stitch/`, one folder per screen, each with `code.html` and `screen.png`, plus
`media/stitch/kairo/DESIGN.md`. They were committed in `e164a93` (2026-08-18).

**Note the folder is `media/stitch/5.4_new_rite`, not `5.4_the_new_rite`** — every other one takes the
`the`.

## Rules for transcribing one

- **`code.html` is authoritative. The PNGs are lossy.** All are capped at 1600px; seven are viewport
  screenshots that crop content away (the Citadel preview stops mid "74.8 kg" although its code continues
  through three more cards), and the rest are downscaled to 273–575px, so the text is soft. Nothing needs
  re-exporting — just don't diff against the PNGs.
- **The exported palette drifted from ours and must be substituted, never copied.** The Material-3
  frontmatter carries `#101418` background, `#e1e2e9` text, `#f9bc4a` primary, while the prose in the same
  file correctly cites our real tokens. Across the 30 exports `#F9BC4A` appears **92 times** and our
  `#F2F4F7` **twice**. `5.1_the_canon` is the design-system sheet and is drifted too — its swatch grid
  renders the wrong values under our token names, so it cannot be transcribed literally either. The
  substitution table is in [`../docs/09-ui-rebuild-plan.md`](../docs/09-ui-rebuild-plan.md).
- **`DESIGN.md` has a split personality.** Its frontmatter is the drifted M3 theme; its prose cites the
  app's real hexes and prescribes 12px radii, 56px buttons, a 24px outer margin, an 8px grid, tonal
  layering instead of shadows, and **Material Community Icons** — which is the icon set the app already
  has. **When the two disagree, the prose is right.**
- The logo shipped with the designs is **unchanged art** — same 1216×1294, same measured mean gold, same
  sampled-pixel count as `assets/source/kairo-mark.png`, differing only by SHA. It is a re-encode. Do not
  re-run `generate-icons.py`; `colors.accent` stays `#D79E2D`.
- **Drop rather than port:** the designs' gradients (5 of them), `backdrop-blur-sm` (8), and all shadows.
  Flatten them. No `expo-linear-gradient`, no `expo-blur` — `DESIGN.md`'s own prose says the system avoids
  soft shadows. Six remote `lh3.googleusercontent.com` `<img>` tags are placeholders; use the local mark
  or nothing.
- **Docked full-width footer buttons are dropped app-wide** — see
  [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md) for what replaces them.

## The dumper script

Reading `code.html` raw is unpleasant. This flattens one to tag-plus-class-plus-text, which is how every
design so far has been read. It lives in `/tmp`, and **`/tmp` does not survive a reboot**, so it is
reproduced here rather than referenced.

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

## The glyph table — all 61 names, mapped and verified

The exports use **Material Symbols** names; the app has **MaterialCommunityIcons**. Every name in all 30
exports has been mapped and verified against the installed glyphmap. **Use this table. Do not re-guess,
and do not trust a name that merely sounds right — a wrong one renders as a box, not an error.**

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

**Two names that do not exist and will waste a session if trusted:** `flame` (use `fire` — caught
mid-build) and `shield-heart-outline` (the family has `shield-cross-outline`, `shield-check-outline`,
`shield-crown-outline`, no heart; `shield_with_heart` appears once, in **The Envoy** (`5.26`) — an
earlier revision of this table said The Sanctum, which uses `sports_martial_arts`; corrected
2026-08-20 by `grep -rl` — and `shield-crown-outline` suits the theme). Verify any glyph not in the
table with:

```sh
cd apps/mobile && node -e "const m=require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'); console.log('NAME' in m)"
```

## The five decisions already taken

| | |
|---|---|
| Palette | Ours, plus the handoff's warm bronze-brown border. **Only `colors.border` changes**, `#2A2F38` → `#504535`. |
| Display font | Install **Cinzel** only (`@expo-google-fonts/cinzel`). Body text keeps the platform font — no Inter payload. |
| Density | Adopt the 8px grid: `screenPadding` 24, `cardPadding`/`cardGap`/`rowPadding` 16, `sectionGap` 24. |
| New screens | Build 5 — Gates, Sanctum, Envoy, Pantheon, Annals. Defer 2 — Agoge (new feature + new table), Scrolls (needs editorial content, overlaps Phase 4). |
| Tab bar | **Six tabs kept, movement labelled `MOVE`.** |

## The tab-bar deviation — the one knowing divergence

All 30 designs ship a five-tab bar (`CITADEL | RITES | FORGE | FEAST | SCALES`) with **no movement entry
anywhere**, and the Citadel's Outer Ward row group doesn't list it either. Following that would strand the
whole of Phase 3 two taps deep. So the implementation keeps six visible tabs with movement labelled
`MOVE` — short enough to fit at six across, and already what it reads today; the screen itself is titled
THE EXPEDITION.

Say so if this turns out to be wrong. It is a deliberate choice, not an oversight.

## Things that will go wrong

- **`letterSpacing` is in points in React Native, not `em`.** The designs' `0.15em` / `0.12em` / `0.1em`
  are resolved against their own font size **once**, in the `type` export in `src/theme/index.ts`. Never
  put an `em` value or a raw `fontFamily` string at a call site.
- **A missing font falls back silently.** Cinzel absent looks like a slightly wrong serif, not an error, so
  it has to be confirmed on a device. The loader deliberately does not gate on a font *error*, so a failed
  fetch reaches the user as slightly-wrong type rather than a stuck splash.
- **The Material Symbols vocabulary is not ours.** All 61 are mapped above — use the table rather than
  guessing by name.
- **`node_modules` is installed.** `@expo-google-fonts/cinzel` went in via `npx expo install`, which
  restored the whole tree, so lint, typecheck, tests and the glyphmap check all run. (Historic note: older
  handover text describes the absent tree as a blocker. It is not one any more.)
