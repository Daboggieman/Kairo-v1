---
name: Kairo
colors:
  surface: '#101418'
  surface-dim: '#101418'
  surface-bright: '#36393f'
  surface-container-lowest: '#0b0e13'
  surface-container-low: '#191c21'
  surface-container: '#1d2025'
  surface-container-high: '#272a2f'
  surface-container-highest: '#32353a'
  on-surface: '#e1e2e9'
  on-surface-variant: '#d4c4af'
  inverse-surface: '#e1e2e9'
  inverse-on-surface: '#2e3036'
  outline: '#9c8f7c'
  outline-variant: '#504535'
  surface-tint: '#f9bc4a'
  primary: '#f9bc4a'
  on-primary: '#422c00'
  primary-container: '#d79e2d'
  on-primary-container: '#523800'
  inverse-primary: '#7d5700'
  secondary: '#c4c7ca'
  on-secondary: '#2d3133'
  secondary-container: '#44474a'
  on-secondary-container: '#b3b5b8'
  tertiary: '#9fcaff'
  on-tertiary: '#003259'
  tertiary-container: '#6dacf3'
  on-tertiary-container: '#003f6e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdeaa'
  primary-fixed-dim: '#f9bc4a'
  on-primary-fixed: '#271900'
  on-primary-fixed-variant: '#5f4100'
  secondary-fixed: '#e0e3e6'
  secondary-fixed-dim: '#c4c7ca'
  on-secondary-fixed: '#191c1e'
  on-secondary-fixed-variant: '#44474a'
  tertiary-fixed: '#d2e4ff'
  tertiary-fixed-dim: '#9fcaff'
  on-tertiary-fixed: '#001d37'
  on-tertiary-fixed-variant: '#00497e'
  background: '#101418'
  on-background: '#e1e2e9'
  surface-variant: '#32353a'
typography:
  display-lg:
    fontFamily: Cinzel
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: 0.15em
  display-md:
    fontFamily: Cinzel
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: 0.12em
  headline-sm:
    fontFamily: Cinzel
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.1em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 24px
  gutter: 16px
  fluting-width: 1px
---

## Brand & Style
The design system draws from Spartan discipline and ancient Greek architectural precision. It targets a serious fitness audience seeking a "warrior" ethos, emphasizing strength, structure, and ritual.

The aesthetic is a fusion of **Modern Minimalism** and **Tactile Brutalism**. It avoids the softness of typical consumer apps in favor of high-contrast, cold stone textures and sharp, metallic accents. The interface should feel like it was carved from basalt and inlaid with bronze. Visual motifs include vertical fluting (inspired by Doric columns) used as subtle dividers and the Meander (Greek key) pattern used sparingly as a decorative hairline element to reinforce the heritage.

## Colors
The palette is dominated by deep, obsidian blacks and charcoal greys to simulate "Cold Black Stone." 

- **Primary (Bronze-Gold):** Reserved for victory states, primary calls to action, and active progression indicators. It represents the "earned" reward within the dark environment.
- **Surface Hierarchy:** The background is the deepest black. Surfaces rise in value to indicate interactivity, mimicking stone slabs layered upon one another.
- **Status Colors:** Use high-saturation red for strain/failure and deep teal for recovery, though these should be used minimally to maintain the monochromatic bronze-and-stone aesthetic.

## Typography
Typography is the primary differentiator of the system. 

- **Display & Headlines:** Use a classical inscriptional serif (Cinzel or similar) to evoke stone-carved lettering. These must always be uppercase with generous letter-spacing to maintain legibility and an "epic" feel.
- **UI & Body:** Inter provides a functional, utilitarian contrast. It ensures that technical data—like rep counts and weights—is instantly readable.
- **Numerical Data:** For workout stats, use the 'tabular' feature of Inter to ensure numbers align vertically during active tracking.

## Layout & Spacing
The layout follows a rigid 8px grid system, reflecting the mathematical precision of Greek architecture.

- **Vertical Fluting:** Use 1px vertical hairlines (Border color) to divide sections or content blocks, mimicking the grooves of a Doric column.
- **Margins:** Standardize on a 24px outer margin for mobile to give the content "breathing room" against the dark background.
- **Grid:** Use a 4-column grid for mobile and a 12-column grid for tablet/desktop. Content should feel heavy and grounded, avoiding overly "floating" elements.

## Elevation & Depth
This design system avoids soft shadows. Depth is communicated through **Tonal Layering** and **High-Contrast Outlines**.

- **Surface Levels:** Elements closer to the user are lighter in color (`Surface Raised`). 
- **Borders:** All interactive containers must have a 1px solid border (`Border` color) to define their edges against the deep background.
- **Bronze Accents:** Use the accent color as a "glow" or a 2px bottom-border for active tabs to indicate the "highest" level of focus. 
- **Fluting Dividers:** Use vertical hairlines instead of standard horizontal dividers to reinforce the architectural theme.

## Shapes
While the theme is "stone," the edges are not jagged. A consistent 12px radius (`rounded-lg`) is used for cards and primary containers to ensure the UI feels modern and premium.

- **Cards:** 12px corner radius, 1px border.
- **Buttons:** 56px height, 12px corner radius.
- **Selection Indicators:** Use sharp 90-degree corners for the Meander-pattern accents to contrast against the slightly rounded containers.

## Components
- **Buttons:** Primary buttons are #D79E2D (Bronze) with black text. Secondary buttons are transparent with a 1px #F2F4F7 border. Height is fixed at 56px for a commanding presence.
- **Cards:** Use `Surface` (#15181D) with a 1px `Border` (#2A2F38). No shadows.
- **Inputs:** Dark background, 1px border. On focus, the border transitions to Bronze. Labels should use the `label-md` style (uppercase).
- **Iconography:** Use Material Community Icons (Outline version). Icons should be sized to 24px and colored in `Muted Text` unless active (Bronze).
- **Progress Bars:** Background is `Surface Raised`, the progress fill is Bronze. Use a sharp, non-rounded cap for the progress fill to maintain a "chiseled" look.
- **Specialty Decor:** The Greek Key (Meander) should be used as a 4px tall repeating border at the bottom of the Header or as a separator for major sections.