/**
 * Rest timer readout.
 *
 * Holds no workout state — the store keeps only the epoch-ms start, so a parent re-render
 * (logging a set, editing a field) can never restart or skip the count. `useNow` supplies
 * the ticking clock; `restElapsed` does the arithmetic and is unit-tested with an injected
 * clock, so nothing here needs testing beyond what it renders.
 */

import { StyleSheet, Text, View } from 'react-native';

import { formatRest, restElapsed } from '@/domain/workouts';
import { useNow } from '@/hooks/useNow';
import { colors, fontSize, spacing } from '@/theme';

type Props = {
  /** Epoch ms the timer started, or null when no set has been logged yet. */
  startedAt: number | null;
  /** Rest past this many seconds reads as "long enough" — purely a visual cue. */
  targetSeconds?: number;
};

export function RestTimer({ startedAt, targetSeconds = 90 }: Props) {
  const now = useNow();
  // Derived from the start timestamp on every tick rather than incremented: counters drift,
  // and intervals are throttled outright while the app is backgrounded.
  const elapsed = startedAt === null ? 0 : restElapsed(startedAt, now);
  const reached = startedAt !== null && elapsed >= targetSeconds;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{startedAt === null ? 'Ready' : 'Rest'}</Text>
      <Text style={[styles.value, reached && styles.valueReached]}>
        {startedAt === null ? '—' : formatRest(elapsed)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.md },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: {
    color: colors.text,
    fontSize: fontSize.display,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  valueReached: { color: colors.success },
});
