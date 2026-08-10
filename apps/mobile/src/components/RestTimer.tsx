/**
 * Rest timer readout.
 *
 * The one place in the app with a ticking interval. It re-renders itself once a second
 * and holds no workout state — the store keeps only the epoch-ms start, so a re-render of
 * the parent (logging a set, editing a field) can never restart or skip the count.
 *
 * `restElapsed` does the arithmetic and is unit-tested with an injected clock; this
 * component only supplies `Date.now()`.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatRest, restElapsed } from '@/domain/workouts';
import { colors, fontSize, spacing } from '@/theme';

type Props = {
  /** Epoch ms the timer started, or null when no set has been logged yet. */
  startedAt: number | null;
  /** Rest past this many seconds reads as "long enough" — purely a visual cue. */
  targetSeconds?: number;
};

export function RestTimer({ startedAt, targetSeconds = 90 }: Props) {
  const [elapsed, setElapsed] = useState(() =>
    startedAt === null ? 0 : restElapsed(startedAt, Date.now()),
  );

  useEffect(() => {
    if (startedAt === null) {
      setElapsed(0);
      return;
    }
    // Recompute from the start timestamp rather than incrementing a counter: intervals
    // drift, and are throttled outright while the app is backgrounded.
    setElapsed(restElapsed(startedAt, Date.now()));
    const id = setInterval(() => setElapsed(restElapsed(startedAt, Date.now())), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

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
