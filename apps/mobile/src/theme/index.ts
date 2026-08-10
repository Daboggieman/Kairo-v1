/**
 * Design tokens.
 *
 * A flat object rather than a theming library: three more modules land next and they need
 * to agree on spacing and colour, not on a provider API. Dark-first because
 * `04-feature-specs.md` describes a gym app used at 6am — a white screen at that hour is
 * hostile. Swapping in a light palette later means adding a second object here.
 */

export const colors = {
  background: '#0B0D10',
  surface: '#15181D',
  surfaceRaised: '#1D2128',
  border: '#2A2F38',
  text: '#F2F4F7',
  textMuted: '#98A2B3',
  accent: '#E8613C',
  accentText: '#FFFFFF',
  success: '#3FB950',
  danger: '#E5484D',
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
 * Minimum height for anything tappable. `04-feature-specs.md` asks for large tap targets
 * during a set; 56 clears the 44pt floor with sweaty-hands margin.
 */
export const TAP_TARGET = 56;
