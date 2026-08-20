/**
 * The Breath — the rest timer band under The Anvil's app bar.
 *
 * Holds no workout state — the store keeps only the epoch-ms start, so a parent re-render
 * (logging a set, editing a field) can never restart or skip the count. `useNow` supplies
 * the ticking clock; `restElapsed` does the arithmetic and is unit-tested with an injected
 * clock, so nothing here needs testing beyond what it renders.
 *
 * A band rather than a block: full-bleed surface with a rule under it, which is what makes it read as
 * chrome continuous with the app bar rather than as the screen's first card. The progress rule sits
 * flush to the bottom edge, so the bar and the band's own border are one line.
 *
 * `targetSeconds` is a visual cue and nothing else — the readout keeps counting past it. Reaching it
 * turns the figure and the rule green, which the designs do not have and which is the one piece of
 * information a plain accent clock cannot give you from across a rack.
 */

import { StyleSheet, Text, View } from 'react-native';

import { Eyebrow, ProgressBar, Timer } from '@/components/Layout';
import { formatRest, restElapsed } from '@/domain/workouts';
import { useNow } from '@/hooks/useNow';
import { colors, fontSize, layout, spacing } from '@/theme';

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
    <View style={styles.band}>
      {startedAt === null ? (
        <Text style={styles.idle}>—</Text>
      ) : (
        <Timer value={formatRest(elapsed)} tone="accent" style={reached && styles.reached} />
      )}
      <Eyebrow>{startedAt === null ? 'Ready' : 'The breath'}</Eyebrow>
      <ProgressBar
        value={elapsed}
        max={targetSeconds}
        color={reached ? colors.success : colors.accent}
        height={4}
        style={styles.progress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: layout.cardPadding,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  /** Same metrics as `Timer` so the band does not change height when a set is logged. */
  idle: {
    color: colors.textMuted,
    fontSize: fontSize.display,
    lineHeight: fontSize.display,
    fontWeight: '700',
  },
  reached: { color: colors.success },
  progress: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
