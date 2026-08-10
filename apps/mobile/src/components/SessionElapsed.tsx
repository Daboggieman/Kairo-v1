/**
 * Live "how long have I been training" readout for the active session.
 *
 * Separated from the session screen so only this subtree re-renders each second — the
 * inputs above it keep their focus and cursor position while it ticks.
 */

import { StyleSheet, Text } from 'react-native';

import { formatDuration } from '@/domain/workouts';
import { useNow } from '@/hooks/useNow';
import { colors, fontSize } from '@/theme';

export function SessionElapsed({ startedAt }: { startedAt: string | null }) {
  const now = useNow();
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return <Text style={styles.text}>{formatDuration(seconds)}</Text>;
}

const styles = StyleSheet.create({
  text: { color: colors.textMuted, fontSize: fontSize.sm },
});
