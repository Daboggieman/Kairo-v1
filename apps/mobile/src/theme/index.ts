/**
 * Design tokens.
 *
 * A flat object rather than a theming library: three more modules land next and they need
 * to agree on spacing and colour, not on a provider API. Dark-first because
 * `04-feature-specs.md` describes a gym app used at 6am — a white screen at that hour is
 * hostile. Swapping in a light palette later means adding a second object here.
 *
 * The accent is sampled from the product mark rather than chosen alongside it, so the app and its
 * launcher icon cannot drift apart; `scripts/generate-icons.py` renders the icon from the same
 * artwork. Every colour that carries text has been checked against the surface it sits on — the
 * ratios are recorded where they decided the value.
 */

export const colors = {
  background: '#0B0D10',
  surface: '#15181D',
  surfaceRaised: '#1D2128',
  border: '#2A2F38',
  text: '#F2F4F7',
  textMuted: '#98A2B3',
  /**
   * Taken from the mark in `assets/source/kairo-mark.png` — its mean gold, measured rather than
   * eyeballed, so the app and the launcher icon are the same colour. 8.2:1 against `background`,
   * which clears WCAG AA for body text, not just for large text and icons.
   */
  accent: '#D79E2D',
  /**
   * Text and glyphs *on* the accent. Near-black, not white: white on this gold is 2.4:1 and
   * unreadable, while this is 8.2:1. It is the background colour, so a filled accent control
   * reads as a hole punched through to the app's own surface.
   */
  accentText: '#0B0D10',
  success: '#3FB950',
  danger: '#E5484D',
  /**
   * Amber rather than the more obvious gold: gold *is* the accent now, and a warning that shares
   * the accent colour stops reading as a warning.
   */
  warning: '#E07B39',
  info: '#58A6FF',
  /**
   * Tinted fills for status blocks. A coloured *background* is what makes a notice read as one
   * thing to skim past; coloured text alone (which is what the reminders screen used) reads as
   * body copy that happens to be orange, and at 13px on a near-black screen it was close to
   * invisible.
   */
  accentSoft: '#2B2110',
  warningSoft: '#2E1B0F',
  dangerSoft: '#2E1416',
  infoSoft: '#12233A',
} as const;

/**
 * Series colours for the macro bars and charts.
 *
 * Named by what they mean rather than by hue, and kept out of `colors` because a series colour is
 * chosen for separability from its neighbours, not for contrast against a surface. Fat is violet
 * because the gold it used to be is the accent.
 */
export const chartColors = {
  protein: colors.success,
  carbs: colors.info,
  fat: '#B78AF7',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  /** The rest-timer readout — legible at arm's length with a bar in your hands. */
  display: 56,
} as const;

/**
 * Line heights for running text.
 *
 * React Native leaves `lineHeight` unset, which packs text at roughly 1.15x the font size. Every
 * screen inherited that, and it is the single largest reason the app read as congested — the fix
 * is vertical air inside the paragraph, not more padding around it.
 */
export const lineHeight = {
  xs: 18,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 34,
} as const;

/**
 * Minimum height for anything tappable. `04-feature-specs.md` asks for large tap targets
 * during a set; 56 clears the 44pt floor with sweaty-hands margin.
 */
export const TAP_TARGET = 56;

/**
 * Screen rhythm.
 *
 * `spacing` answers "how far apart are these two things"; this answers "how much room does a
 * screen give its content". They were the same scale, so screens reached for `spacing.lg` for
 * both an icon gap and a screen margin, and everything ended up 16px from everything else with
 * no hierarchy left to read. Absolute values live here so a density change is one edit.
 */
export const layout = {
  /** Outer margin around a screen's content. */
  screenPadding: 20,
  /** Between the major blocks of a screen — cards, sections, a form and its list. */
  sectionGap: 18,
  /** Inside a card. */
  cardPadding: 18,
  /** Between rows within one card. */
  cardGap: 14,
  /** Clearance below the last element of a scroll view, above the tab bar. */
  scrollFooter: 40,
  /** Vertical padding for a list row, on top of `TAP_TARGET`. */
  rowPadding: 14,
} as const;
