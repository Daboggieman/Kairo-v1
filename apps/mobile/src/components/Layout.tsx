/**
 * The shared layout shell: screen, app bar, section, card, notice, empty state, field, and the
 * theme's ornament.
 *
 * Every screen had been building these out of raw `View`s and its own `StyleSheet`, which is how
 * the app ended up with fourteen slightly different card paddings and two screens (reminders and
 * wallpaper) that never picked up the dark palette at all — their black default text sat on a
 * near-black background and could not be read. Owning the shell in one file means a density or
 * palette change lands everywhere at once, and a new screen cannot forget the theme.
 *
 * These are presentational containers only. No data, no navigation: a screen composes them and
 * keeps its own behaviour. `AppBar` takes an `onBack` callback rather than calling `router.back()`
 * itself, which is what keeps that true of the one component with a back button in it.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Children, Fragment, useId, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import {
  colors,
  fontSize,
  layout,
  lineHeight,
  radius,
  spacing,
  TAP_TARGET,
  type as typeScale,
} from '@/theme';

type EyebrowTone = 'accent' | 'muted' | 'text' | 'danger';

/** A full-bleed screen background. For screens whose own child scrolls (a `FlatList`, a map). */
export function Screen({
  children,
  padded = false,
  style,
}: {
  children: ReactNode;
  /** Applies the standard screen margin. Leave off when a list needs to bleed to the edges. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.screen, padded && styles.screenPadded, style]}>{children}</View>;
}

/**
 * A scrolling screen with the standard margin, section rhythm, and a footer that clears the
 * bottom inset. The footer is the reason this exists as a component: every screen was computing
 * `insets.bottom + something` and landing on a different something.
 */
export function ScreenScroll({
  children,
  contentStyle,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + layout.scrollFooter },
          contentStyle,
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * A tab root's own title block: the screen's name, a line of aggregate, an action, and the ornament.
 *
 * This is the theme's answer to the native header, which every module used to use. A native header
 * can carry a font but not a Greek key, and the designs put a rule or a fret under every screen
 * name — so the modules hide the platform header and render this as the first thing in their scroll.
 *
 * The five tab-root designs each invented their own chrome for this (a fixed bar on three of them, a
 * sticky one on another, an in-content block on the fifth, with the title in accent on four and in
 * `text` on the fifth). Unified here rather than transcribed five ways: the common part is a name, a
 * one-line aggregate under it, and an ornament, and six tab roots that agree read as one app.
 *
 * Detail screens use `AppBar` instead — chrome with a back affordance, not a block of content.
 */
export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  /** One line of aggregate — "16 sessions · 84,120 kg lifted". Not a description of the screen. */
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderRow}>
        <View style={styles.screenHeaderText}>
          <Text style={styles.screenTitle}>{title.toUpperCase()}</Text>
          {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      <Meander style={styles.screenHeaderOrnament} />
    </View>
  );
}

/**
 * The top bar for a screen pushed onto the stack: back on the left, the screen's name centred, an
 * optional action or readout on the right.
 *
 * Distinct from `ScreenHeader`, which is a block of content inside a scrolling tab root. This is
 * chrome: fixed height, its own surface, and the theme's heaviest single element — a 4px accent
 * rule along the bottom, which is what the design system specifies for "the highest level of
 * focus". The side slots are equal minimum widths so the title stays optically centred whether the
 * right slot holds a running clock or nothing.
 */
export function AppBar({
  title,
  onBack,
  action,
}: {
  title: string;
  /** Omit for a bar with no back affordance. This component never navigates on its own. */
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <View style={styles.appBar}>
      <View style={styles.appBarSlot}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.appBarTitle}>
        {title.toUpperCase()}
      </Text>
      <View style={[styles.appBarSlot, styles.appBarSlotEnd]}>{action}</View>
    </View>
  );
}

/**
 * The small uppercase label that sits above almost everything in this theme.
 *
 * `tone="accent"` for the thing currently in play, `"muted"` for a caption, `"danger"` for the one
 * line a card uses to say something has lapsed. It is a component rather than a style constant
 * because it is the most repeated element in the whole design set —
 * every card, every section, every stat has one — and a component is what keeps its tracking and
 * casing from being re-guessed each time.
 */
export function Eyebrow({
  children,
  tone = 'muted',
  style,
}: {
  children: string;
  tone?: EyebrowTone;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.eyebrow, eyebrowTones[tone], style]}>{children.toUpperCase()}</Text>
  );
}

/**
 * A titled group of cards. `action` renders as a right-aligned affordance when given.
 *
 * A hairline runs from the end of the title to the edge of the screen — the designs draw a section
 * heading as an inscription with a rule trailing off it, and it is what separates a section title
 * from the card headings below it now that both are set in the same eyebrow role. It lives here
 * rather than in each screen so eight modules cannot arrive at eight different rules.
 *
 * `children` is optional so a `FlatList` header can use this for its title while the rows it
 * describes are rendered by the list itself.
 */
export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={styles.section}>
      {title || action ? (
        <View style={styles.sectionHeader}>
          {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
          {title ? <View style={styles.sectionRule} /> : null}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A raised surface. The one card shape in the app. */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * A card's own title bar: its name on the left, an affordance on the right, a rule underneath.
 *
 * Every card in every one of the designs has this, and the rule is what makes a card read as a
 * plate with a heading rather than a box of text. The title goes through `Eyebrow`, so a card
 * heading and a section heading cannot drift apart.
 *
 * `tone="accent"` for a heading that names the thing the card is about rather than the kind of thing
 * it is — the exercise a group of sets belongs to, as against "TODAY" or "TOTALS".
 */
export function CardHeader({
  title,
  tone = 'muted',
  action,
}: {
  title: string;
  tone?: EyebrowTone;
  action?: ReactNode;
}) {
  return (
    <View style={styles.cardHeader}>
      <Eyebrow tone={tone}>{title}</Eyebrow>
      {action}
    </View>
  );
}

/**
 * The `OPEN ›` affordance in a `CardHeader`.
 *
 * Deliberately not pressable. In the designs it looks like a button, but the whole card is the
 * target — a nested pressable inside a pressable card gives two overlapping hit areas and a screen
 * reader two ways to do one thing. The card owns the press; this says where it goes.
 */
export function CardAction({ label }: { label: string }) {
  return (
    <View style={styles.cardAction}>
      <Text style={styles.cardActionLabel}>{label.toUpperCase()}</Text>
      <MaterialCommunityIcons name="chevron-right" size={14} color={colors.accent} />
    </View>
  );
}

/**
 * A card whose children are rows, ruled between and not around.
 *
 * The dividers are inserted here rather than by the caller: every screen that built one of these by
 * hand was interleaving its own `<View style={styles.rowDivider} />`, which is both repetitive and
 * the kind of thing that ends up with a trailing rule above the card's own border. The card gives no
 * vertical padding — the rows own it, so a press highlight fills the row edge to edge.
 */
export function RowGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const rows = Children.toArray(children);
  return (
    <Card style={[styles.rowGroup, style]}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <Divider /> : null}
          {row}
        </Fragment>
      ))}
    </Card>
  );
}

/**
 * A row that goes somewhere: its name, optionally what it currently says, and a chevron.
 *
 * The press state is a fill rather than an opacity fade, because a row inside a `RowGroup` has a
 * rule above and below it and fading one row makes the rules look like they moved.
 */
export function NavRow({
  label,
  detail,
  value,
  icon,
  onPress,
}: {
  label: string;
  detail?: string;
  /** The row's current setting, shown before the chevron. */
  value?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={22} color={colors.accent} /> : null}
      <View style={styles.navRowMain}>
        <Text style={styles.navRowLabel}>{label}</Text>
        {detail ? (
          <Text style={styles.navRowDetail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={styles.navRowValue}>{value}</Text> : null}
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

type NoticeTone = 'info' | 'warning' | 'danger' | 'accent';

/**
 * A status block: runtime limitations, denied permissions, load failures.
 *
 * Tone drives a tinted fill and a left rule rather than only text colour, so a notice is
 * skimmable as a block. Everything Kairo needs to say about a degraded runtime — Expo Go's
 * missing notification and media-library support, a database read that failed — says it here.
 */
export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.notice, noticeTones[tone].container]}>
      {title ? <Text style={[styles.noticeTitle, noticeTones[tone].title]}>{title}</Text> : null}
      <Text style={styles.noticeBody}>{children}</Text>
    </View>
  );
}

/** What a list shows instead of nothing at all. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  /** The way out. An empty list with no affordance is a dead end. */
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/**
 * A glyph on its own as a control: a header's add, its settings, a row's overflow.
 *
 * 44pt rather than the app's 56pt `TAP_TARGET`: this is the size the designs use for a header
 * affordance, it clears the platform accessibility floor, and a 56pt square next to a 28pt title
 * would out-weigh the title. Anything a thumb has to hit mid-set is a `Button`, not one of these.
 *
 * `outlined` for an action the screen wants noticed (the Rites' add), `plain` for chrome.
 */
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'plain',
  disabled = false,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** For screen readers. A glyph on its own says nothing to one. */
  label: string;
  onPress: () => void;
  variant?: 'outlined' | 'plain';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        variant === 'outlined' && styles.iconButtonOutlined,
        disabled && styles.iconButtonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={variant === 'outlined' ? colors.accent : colors.textMuted}
      />
    </Pressable>
  );
}

/**
 * Two or three figures across one card, ruled between them.
 *
 * The designs call it the summary strip and put one under most tab-root headers: the numbers that
 * answer "how is this module going" before any of the detail. Values are tabular so the columns stay
 * put as they change, and `tone` exists for the one cell that is a count of things going wrong.
 *
 * `size="lg"` sets the figures in the inscriptional display face, for a detail screen where the strip
 * *is* the content rather than a summary above it. A cell with `progress` grows a bar flush to the
 * card's bottom edge — the designs use it for the one figure that is a ratio, so the number and the
 * proportion it represents are read in the same glance.
 *
 * `bare` drops the surface, border and radius, for a strip that is *inside* a card rather than being
 * one: The Forge's session rows and The Stele's hero both want this grid within a bordered plate, and
 * nesting the default variant draws a second border 16px inside the first. Two `bare` strips with a
 * `Divider` between them is also how a four-figure grid becomes 2×2, which is the only way four
 * display numbers fit across a phone.
 */
export function StatStrip({
  items,
  size = 'md',
  bare = false,
}: {
  items: {
    label: string;
    value: string;
    /** `success` is for a figure that is good news in its own terms — a weight loss on a cut. */
    tone?: 'text' | 'accent' | 'danger' | 'success';
    /** 0–1. Draws a rule along the bottom of this cell only. */
    progress?: number;
  }[];
  size?: 'md' | 'lg';
  /** For a strip nested inside a `Card`, which already owns the surface and the padding. */
  bare?: boolean;
}) {
  const cells = items.map((item, index) => (
    <Fragment key={item.label}>
      {index > 0 ? <Divider orientation="vertical" /> : null}
      <View style={[styles.stripCell, bare && styles.stripCellBare]}>
        {/*
          Deliberately unconstrained: a value too wide for its cell wraps at its space ("5,240" /
          "kg") rather than being clipped to "5,240…". Three cells across a phone leaves each about
          82pt, which a five-figure tonnage does not reliably fit, and a truncated number is worse
          than a tall one.
        */}
        <Text
          style={[
            size === 'lg' ? styles.stripValueLarge : styles.stripValue,
            stripTones[item.tone ?? 'text'],
          ]}
        >
          {item.value}
        </Text>
        <Eyebrow>{item.label}</Eyebrow>
        {item.progress === undefined ? null : (
          <ProgressBar value={item.progress} max={1} height={6} style={styles.stripProgress} />
        )}
      </View>
    </Fragment>
  ));

  if (bare) return <View style={styles.stripBare}>{cells}</View>;
  return <Card style={styles.strip}>{cells}</Card>;
}

type PillTone = 'accent' | 'danger' | 'muted' | 'success';

/**
 * A small tinted capsule: a streak's flame, a session's state, a count that needs a colour.
 *
 * The tint is what makes it read as a badge rather than as bold text, and the border is
 * `colors.border` for every tone. The designs draw it as the tone colour at 30% alpha, which would
 * mean four invented rgba values that exist nowhere in the palette; the one bronze edge is the same
 * chiselled outline every other surface in the app has, and the fill and the ink already say which
 * tone this is.
 */
export function Pill({
  label,
  icon,
  tone = 'muted',
}: {
  label: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  tone?: PillTone;
}) {
  const { fill, ink } = pillTones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: fill }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={14} color={ink} /> : null}
      <Text style={[styles.pillLabel, { color: ink }]}>{label}</Text>
    </View>
  );
}

/**
 * One option in a set of them: a cadence, a weekday, an activity type.
 *
 * `shape="block"` is the full-width-ish rectangle a segmented control is made of; `"circle"` is the
 * 44pt round day toggle. Both are the same control with the same selected state — accent fill,
 * `accentText` label — because a screen offering two kinds of choice should not look like it offers
 * two kinds of control.
 *
 * `role` picks the accessibility contract rather than the appearance: a cadence is one-of-many
 * (`radio`), a weekday is independently on or off (`checkbox`), and the state key each of those
 * reports is different.
 */
export function Chip({
  label,
  selected,
  onPress,
  shape = 'block',
  role = 'radio',
  accessibilityLabel,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  shape?: 'block' | 'circle';
  role?: 'radio' | 'checkbox';
  /** For a circle, whose label is a single letter. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'checkbox' ? { checked: selected } : { selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        shape === 'circle' && styles.chipCircle,
        selected && styles.chipSelected,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A labelled text input.
 *
 * The label is part of the field rather than a sibling `Text` because a placeholder alone
 * disappears the moment a value is typed, which leaves a form of unlabelled boxes — the state
 * the reminders screen was in.
 *
 * Focus moves the border and the label to the accent. On a dark screen a focus ring is the only
 * thing that says which of four identical boxes the keyboard is typing into; the platform gives
 * `TextInput` no visible focus state of its own. The state is set from `onFocus`/`onBlur`, never
 * from an effect — `react-hooks/set-state-in-effect` forbids the latter, and an event is what this
 * actually is.
 */
export function Field({
  label,
  hint,
  style,
  ...input
}: { label: string; hint?: string; style?: StyleProp<ViewStyle> } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, focused && styles.fieldLabelFocused]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...input}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        style={[styles.input, input.multiline && styles.inputMultiline, focused && styles.inputFocused]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * A hairline between rows, or between two things side by side.
 *
 * The vertical orientation stretches to its parent, so it needs a parent with a height — a row
 * with `alignItems: 'stretch'` rather than `'center'`.
 */
export function Divider({ orientation = 'horizontal' }: { orientation?: 'horizontal' | 'vertical' }) {
  return <View style={orientation === 'vertical' ? styles.dividerVertical : styles.divider} />;
}

/** A number and its caption — the shape every summary readout in the app uses. */
export function Stat({
  value,
  caption,
  align = 'flex-start',
}: {
  value: string;
  caption: string;
  align?: 'flex-start' | 'flex-end';
}) {
  return (
    <View style={{ alignItems: align, gap: spacing.xs }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  );
}

/**
 * A card whose whole content is one figure: its label above, the number below, centred.
 *
 * The number is accent rather than `text` because this shape is only used where the figure *is* the
 * point — a total, a best, a count for the week. A screen that wants a number alongside other
 * content uses `Stat` inside a `Card` instead.
 */
export function StatCard({
  label,
  value,
  unit,
  footnote,
  style,
}: {
  label: string;
  value: string;
  unit?: string;
  footnote?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card style={[styles.statCard, style]}>
      <Eyebrow>{label}</Eyebrow>
      <View style={styles.statCardValueRow}>
        <Text style={styles.statCardValue}>{value}</Text>
        {unit ? <Text style={styles.statCardUnit}>{unit.toUpperCase()}</Text> : null}
      </View>
      {footnote ? <Text style={styles.statCardFootnote}>{footnote}</Text> : null}
    </Card>
  );
}

/**
 * A running clock — the rest timer, an active session, an activity's elapsed time.
 *
 * `type.timer` carries `tabular-nums`, without which every tick changes the digit widths and the
 * whole row reflows once a second.
 */
export function Timer({
  value,
  tone = 'text',
  style,
}: {
  value: string;
  tone?: 'text' | 'accent' | 'muted';
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.timer, timerTones[tone], style]}>{value}</Text>;
}

/**
 * A horizontal progress bar with square ends.
 *
 * Square, not pill: the design system asks for "a sharp, non-rounded cap to maintain a chiseled
 * look", and it is the one place the app deliberately refuses `radius`. `value` is clamped rather
 * than trusted — a macro total past its target is a normal Tuesday, and an 8000/2000 ratio must not
 * render as a bar eating the screen.
 */
export function ProgressBar({
  value,
  max,
  color = colors.accent,
  height = 6,
  style,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View style={[styles.progressTrack, { height }, style]}>
      <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

/**
 * The Greek-key band, tiled across the full width of its parent.
 *
 * Drawn as an SVG `<Pattern>` rather than as the exports' background-image data URI: tiling a
 * pattern needs no measurement of the parent, so there is no layout effect and no width state.
 *
 * A deliberate deviation on size. The designs render this band at 4px tall, which collapses a
 * 24-unit motif into four pixels — on a device it is a solid gold line and the key is not visible at
 * all. It is drawn at 14px here, tall enough for the motif to read as the ornament it is, and used
 * only under a header or between major sections, because `DESIGN.md` asks for it "sparingly".
 */
export function Meander({
  height = 14,
  color = colors.accent,
  style,
}: {
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  // `useId` can contain characters that are not valid in an SVG id or a `url(#…)` reference.
  const patternId = `meander${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[{ height }, style]} pointerEvents="none">
      <Svg width="100%" height={height}>
        <Defs>
          <Pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width={height}
            height={height}
            viewBox="0 0 24 24"
          >
            <Path
              d="M2 2H10V10H18V2H22V22H14V14H6V22H2V2Z"
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height={height} fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

/**
 * The pair of vertical rules in a screen header's left gutter.
 *
 * Column fluting, borrowed straight from the designs, and the cheapest piece of the theme: two
 * hairlines. It stretches to its parent's height, so the parent has to have one.
 */
export function Fluting({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.fluting, style]} pointerEvents="none">
      <View style={styles.flutingRule} />
      <View style={styles.flutingRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenPadded: { padding: layout.screenPadding },
  scrollContent: {
    padding: layout.screenPadding,
    gap: layout.sectionGap,
  },
  screenHeader: { gap: spacing.xs, paddingTop: spacing.xs },
  screenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  screenHeaderText: { flexShrink: 1, gap: spacing.xs },
  screenTitle: { color: colors.accent, ...typeScale.displayMd },
  screenSubtitle: { color: colors.textMuted, ...typeScale.label, fontWeight: '500' },
  screenHeaderOrnament: { marginTop: spacing.md, opacity: 0.6 },
  appBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    backgroundColor: colors.surface,
    borderBottomWidth: 4,
    borderBottomColor: colors.accent,
  },
  appBarSlot: { minWidth: 40, justifyContent: 'center' },
  appBarSlotEnd: { alignItems: 'flex-end' },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.accent,
    ...typeScale.headlineSm,
  },
  eyebrow: { ...typeScale.eyebrow },
  section: { gap: layout.cardGap },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  sectionTitle: {
    color: colors.textMuted,
    ...typeScale.eyebrow,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  /** Trails off the end of a section title. `flex: 1` is what makes it stop at the action, if any. */
  sectionRule: { flex: 1, height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: layout.cardPadding,
    gap: layout.cardGap,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 24,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cardActionLabel: { color: colors.accent, ...typeScale.eyebrow, fontWeight: '700' },
  rowGroup: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: TAP_TARGET,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: spacing.md,
  },
  navRowPressed: { backgroundColor: colors.surfaceRaised },
  navRowMain: { flex: 1, gap: 2 },
  navRowLabel: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  navRowDetail: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  navRowValue: { color: colors.textMuted, ...typeScale.label },
  /**
   * Square on the left, rounded on the right: the 3px rule is a cut edge, and rounding it turns a
   * deliberate mark into a stray coloured sliver.
   */
  notice: {
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderLeftWidth: 3,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  noticeTitle: { ...typeScale.label, fontWeight: '700' },
  noticeBody: { color: colors.text, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  empty: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.text, ...typeScale.headlineSm, textAlign: 'center' },
  emptyBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
  emptyAction: { alignSelf: 'stretch', marginTop: spacing.lg },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  iconButtonOutlined: { borderWidth: 1, borderColor: colors.accent },
  iconButtonDisabled: { opacity: 0.4 },
  strip: { flexDirection: 'row', padding: 0, gap: 0, alignItems: 'stretch' },
  stripBare: { flexDirection: 'row', alignItems: 'stretch' },
  stripCell: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: layout.cardPadding,
    paddingHorizontal: spacing.sm,
  },
  /** Inside a card, the card's own padding is the vertical room; the cell adds none. */
  stripCellBare: { paddingVertical: 0 },
  stripValue: { fontSize: fontSize.lg, lineHeight: lineHeight.lg, fontWeight: '600', fontVariant: ['tabular-nums'] },
  stripValueLarge: { ...typeScale.displayMd, fontVariant: ['tabular-nums'] },
  stripProgress: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillLabel: { ...typeScale.label, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chip: {
    minHeight: TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  /** 44, not `TAP_TARGET`: seven of these have to fit across a phone with a gap between them. */
  chipCircle: { width: 44, height: 44, minHeight: 44, paddingHorizontal: 0, borderRadius: radius.pill },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.textMuted, ...typeScale.label },
  chipLabelSelected: { color: colors.accentText, fontWeight: '700' },
  field: { gap: spacing.sm },
  fieldLabel: {
    color: colors.textMuted,
    ...typeScale.eyebrow,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  fieldLabelFocused: { color: colors.accent },
  input: {
    minHeight: TAP_TARGET,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
  },
  inputFocused: { borderColor: colors.accent },
  inputMultiline: { minHeight: TAP_TARGET * 2, textAlignVertical: 'top' },
  fieldHint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  divider: { height: 1, backgroundColor: colors.border },
  dividerVertical: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  statValue: { color: colors.text, fontSize: fontSize.xl, lineHeight: lineHeight.xl, fontWeight: '700' },
  statCaption: { color: colors.textMuted, fontSize: fontSize.sm },
  statCard: { alignItems: 'center', gap: spacing.sm },
  statCardValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  statCardValue: {
    color: colors.accent,
    fontSize: fontSize.display,
    lineHeight: fontSize.display,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statCardUnit: { color: colors.textMuted, ...typeScale.label },
  statCardFootnote: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    textAlign: 'center',
  },
  timer: { ...typeScale.timer, fontWeight: '700' },
  progressTrack: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 0,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  fluting: { flexDirection: 'row', gap: spacing.xs, alignSelf: 'stretch' },
  flutingRule: { width: 1, backgroundColor: colors.border },
  pressed: { opacity: 0.7 },
});

const eyebrowTones: Record<EyebrowTone, TextStyle> = {
  accent: { color: colors.accent },
  muted: { color: colors.textMuted },
  text: { color: colors.text },
  danger: { color: colors.danger },
};

const timerTones: Record<'text' | 'accent' | 'muted', TextStyle> = {
  text: { color: colors.text },
  accent: { color: colors.accent },
  muted: { color: colors.textMuted },
};

const stripTones: Record<'text' | 'accent' | 'danger' | 'success', TextStyle> = {
  text: { color: colors.text },
  accent: { color: colors.accent },
  danger: { color: colors.danger },
  success: { color: colors.success },
};

const pillTones: Record<PillTone, { fill: string; ink: string }> = {
  accent: { fill: colors.accentSoft, ink: colors.accent },
  danger: { fill: colors.dangerSoft, ink: colors.danger },
  muted: { fill: colors.surfaceRaised, ink: colors.textMuted },
  success: { fill: colors.surfaceRaised, ink: colors.success },
};

const noticeTones: Record<NoticeTone, { container: ViewStyle; title: { color: string } }> = {
  info: {
    container: { backgroundColor: colors.infoSoft, borderLeftColor: colors.info },
    title: { color: colors.info },
  },
  warning: {
    container: { backgroundColor: colors.warningSoft, borderLeftColor: colors.warning },
    title: { color: colors.warning },
  },
  danger: {
    container: { backgroundColor: colors.dangerSoft, borderLeftColor: colors.danger },
    title: { color: colors.danger },
  },
  accent: {
    container: { backgroundColor: colors.accentSoft, borderLeftColor: colors.accent },
    title: { color: colors.accent },
  },
};
