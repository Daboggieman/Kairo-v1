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

import type { TextStyle } from 'react-native';

export const colors = {
  background: '#0B0D10',
  surface: '#15181D',
  surfaceRaised: '#1D2128',
  /**
   * A warm bronze-brown rather than the cool slate this used to be (`#2A2F38`). The slate read as
   * generic dark-mode chrome; against obsidian surfaces this reads as weathered metal, and it is
   * the one colour the Greek-theme designs contribute to the palette — everything else here is
   * unchanged, because the accent is measured from the mark and the rest is built around it.
   */
  border: '#504535',
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
  /** A screen's own name, inscribed. The largest thing on The Citadel. */
  xxl: 40,
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
  xxl: 48,
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
 *
 * Every value is a multiple of 8. The previous 20/18/14 set was arrived at one screen at a time
 * and put nothing in the app on a shared vertical rhythm; the grid is what makes two cards on
 * different screens line up without either screen knowing about the other.
 */
export const layout = {
  /** Outer margin around a screen's content. */
  screenPadding: 24,
  /** Between the major blocks of a screen — cards, sections, a form and its list. */
  sectionGap: 24,
  /** Inside a card. */
  cardPadding: 16,
  /** Between rows within one card. */
  cardGap: 16,
  /** Clearance below the last element of a scroll view, above the tab bar. */
  scrollFooter: 40,
  /** Vertical padding for a list row, on top of `TAP_TARGET`. */
  rowPadding: 16,
} as const;

/**
 * Composed text roles.
 *
 * Two things this is not: it is not a replacement for `fontSize`/`lineHeight`, which running text
 * still uses directly; and it is not a place for a screen to add a one-off style. It exists for the
 * roles where size, leading, family and tracking have to travel together.
 *
 * Why a token group rather than a style at each call site:
 *
 * - **The design specifies tracking in `em`; React Native's `letterSpacing` is in points.** The
 *   display faces are set at `0.15em` / `0.12em` / `0.1em`, which only means something relative to
 *   their own size. Resolving that against the size is arithmetic that must happen exactly once,
 *   and 40 × 0.15 = 6 is not a number anyone should be deriving in a `StyleSheet`.
 * - **A mistyped `fontFamily` fails silently.** `'Cinzel_700bold'` falls back to the platform serif
 *   and looks *almost* right — close enough to survive a screenshot and not a device. No screen
 *   writes a family string; it composes one of these.
 *
 * The three inscriptional roles are Cinzel, loaded in `app/_layout.tsx`. The other three are the
 * platform font, and are here because their tracking is part of the role rather than a choice.
 *
 * `satisfies Record<string, TextStyle>` rather than `as const`: it checks every role against what
 * React Native will actually accept — a typo in `fontVariant` or a `fontWeight` outside the allowed
 * set fails here rather than at a call site — while `as const` would freeze `fontVariant` as a
 * readonly tuple that no `StyleSheet` will take.
 */
export const type = {
  /** A screen's own name. Wide tracking is what makes it read as carved rather than shouted. */
  displayLg: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    letterSpacing: 6,
  },
  /** A major heading inside a screen. */
  displayMd: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    letterSpacing: 3.4,
  },
  /** An `AppBar` title, and a card that names a place. */
  headlineSm: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    letterSpacing: 2,
  },
  /** The small uppercase label above almost everything. The most repeated role in the app. */
  eyebrow: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    letterSpacing: 0.6,
    fontWeight: '500',
  },
  /** A button label, a tab label, a row's leading text. */
  label: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    letterSpacing: 0.7,
    fontWeight: '600',
  },
  /**
   * A running clock. `tabular-nums` so the readout stops jittering as the digits change — without
   * it every second reflows the row it sits in.
   */
  timer: {
    fontSize: fontSize.display,
    lineHeight: fontSize.display,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;
