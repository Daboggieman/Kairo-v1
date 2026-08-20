/**
 * The primary action control. Sized to `TAP_TARGET` because the feature spec's core
 * complaint about gym apps is fiddly buttons mid-set.
 *
 * Labels are uppercase and letterspaced, which is the theme's voice for anything that acts. The
 * casing is applied here rather than left to call sites so a screen cannot pass "Save" and get a
 * button that reads differently from every other button.
 *
 * `danger` is outlined rather than filled: a destructive action wants to be findable and *not*
 * inviting, and a solid red slab at 56px tall in a dark app is the most attention-grabbing thing on
 * the screen. Outlined keeps it unmistakably red while making the primary action the one your thumb
 * goes to.
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, radius, spacing, TAP_TARGET, type as typeScale } from '@/theme';

type Variant = 'primary' | 'secondary' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

/** What sits *on* each variant — the spinner and the label have to agree. */
const foreground: Record<Variant, string> = {
  primary: colors.accentText,
  secondary: colors.text,
  danger: colors.danger,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground[variant]} />
      ) : (
        <Text style={[styles.label, { color: foreground[variant] }]}>{label.toUpperCase()}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  label: { ...typeScale.label, fontWeight: '700', textAlign: 'center' },
});
