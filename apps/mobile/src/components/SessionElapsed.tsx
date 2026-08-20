/**
 * Live "how long have I been training" readout for the active session.
 *
 * Separated from the session screen so only this subtree re-renders each second — the
 * inputs above it keep their focus and cursor position while it ticks. The Forge mounts it
 * inside a `FlatList` header for the same reason: without the split, every row in the workout
 * history would re-render once a second.
 *
 * `prefix` is part of this component rather than a sibling `Text` because the two have to change
 * together — "In progress · 24m 10s" reflowing as two nodes puts a gap between them that widens
 * when the clock rolls past ten minutes.
 */

import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { formatDuration } from '@/domain/workouts';
import { useNow } from '@/hooks/useNow';
import { colors, fontSize } from '@/theme';

export function SessionElapsed({
  startedAt,
  prefix,
  style,
}: {
  startedAt: string | null;
  /** Rendered before the clock, separated by a middot. */
  prefix?: string;
  style?: StyleProp<TextStyle>;
}) {
  const now = useNow();
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return (
    <Text style={[styles.text, style]}>
      {prefix ? `${prefix} · ` : ''}
      {formatDuration(seconds)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.textMuted, fontSize: fontSize.sm, fontVariant: ['tabular-nums'] },
});
