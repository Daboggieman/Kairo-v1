/**
 * The shared layout shell: screen, section, card, notice, empty state, field.
 *
 * Every screen had been building these out of raw `View`s and its own `StyleSheet`, which is how
 * the app ended up with fourteen slightly different card paddings and two screens (reminders and
 * wallpaper) that never picked up the dark palette at all — their black default text sat on a
 * near-black background and could not be read. Owning the shell in one file means a density or
 * palette change lands everywhere at once, and a new screen cannot forget the theme.
 *
 * These are presentational containers only. No data, no navigation: a screen composes them and
 * keeps its own behaviour.
 */

import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontSize, layout, lineHeight, radius, spacing, TAP_TARGET } from '@/theme';

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

/** The screen's own title block. Used where the native header is hidden. */
export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>{title}</Text>
      {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/**
 * A titled group of cards. `action` renders as a right-aligned affordance when given.
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
export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

/**
 * A labelled text input.
 *
 * The label is part of the field rather than a sibling `Text` because a placeholder alone
 * disappears the moment a value is typed, which leaves a form of unlabelled boxes — the state
 * the reminders screen was in.
 */
export function Field({
  label,
  hint,
  style,
  ...input
}: { label: string; hint?: string; style?: StyleProp<ViewStyle> } & TextInputProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...input}
        style={[styles.input, input.multiline && styles.inputMultiline]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** A hairline between rows. */
export function Divider() {
  return <View style={styles.divider} />;
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenPadded: { padding: layout.screenPadding },
  scrollContent: {
    padding: layout.screenPadding,
    gap: layout.sectionGap,
  },
  screenHeader: { gap: spacing.xs, paddingTop: spacing.xs },
  screenTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: '700',
  },
  screenSubtitle: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  section: { gap: layout.cardGap },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: layout.cardPadding,
    gap: layout.cardGap,
  },
  notice: {
    borderRadius: radius.md,
    borderLeftWidth: 3,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  noticeTitle: { fontSize: fontSize.sm, fontWeight: '700' },
  noticeBody: { color: colors.text, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  empty: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  emptyBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
  field: { gap: spacing.sm },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
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
  inputMultiline: { minHeight: TAP_TARGET * 2, textAlignVertical: 'top' },
  fieldHint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  divider: { height: 1, backgroundColor: colors.border },
  statValue: { color: colors.text, fontSize: fontSize.xl, lineHeight: lineHeight.xl, fontWeight: '700' },
  statCaption: { color: colors.textMuted, fontSize: fontSize.sm },
});

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
