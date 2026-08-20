/**
 * The Threshold — the modal that stands between deciding to go and going: pick the kind of journey,
 * read what the runtime can actually record, set out.
 *
 * A modal, so the bar carries a close glyph and **no back chevron** — `AppBar` omits the chevron
 * when it gets no `onBack`, and one way out of a modal is enough.
 *
 * Departures from `5.17_the_threshold`:
 *
 * - **The three types are `Chip`s, not 104pt icon tiles.** The design draws a tile with a 30px glyph
 *   per type, which is what the old screen built. `Chip` is the app's one-of-many control and it is
 *   label-only, so the glyph goes and the **gloss** takes its place: the line under the row reads
 *   "Chariot — the ride", which is what a glyph was there to say. It says it in words, which is
 *   better here, because "Chariot" is the one name in the lexicon a first-time reader cannot guess.
 * - **The runtime note is a `Notice`.** It was a bordered panel with its own hairlines; it is a
 *   status block about a degraded runtime, which is exactly what `Notice` is for. `warning` under
 *   Expo Go, where recording really is limited, and `info` in the development build, where the
 *   sentence is just describing what will happen.
 * - **No docked footer.** The action sits at the end of the content. `marginTop: 'auto'` pinned it to
 *   the bottom of a mostly-empty screen, which reads as chrome and put 300pt between the choice and
 *   the button confirming it.
 *
 * The button says "Set out", which is the same phrase `describeMovementEvent` gives the `started`
 * event — so the Chronicle's timeline opens with the words the user pressed.
 */

import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import {
  AppBar,
  Chip,
  Eyebrow,
  IconButton,
  Notice,
  ScreenScroll,
} from '@/components/Layout';
import { LOCAL_USER_ID } from '@/constants';
import {
  appendNextMovementEvent,
  createMovementActivity,
  setMovementStatus,
} from '@/db/movement';
import { getUnitSystem } from '@/db/preferences';
import type { MovementType } from '@/db/types';
import { MOVEMENT_LABELS } from '@/domain/movement';
import {
  IS_EXPO_GO,
  requestMovementPermissions,
  startMovementTracking,
} from '@/services/movementTracking';
import { colors, fontSize, layout, lineHeight, spacing } from '@/theme';

/** Explicit rather than `Object.keys(MOVEMENT_LABELS)`: this is the order they are offered in. */
const TYPES: MovementType[] = ['run', 'walk', 'ride'];

export default function ThresholdScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [activityType, setActivityType] = useState<MovementType>('run');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = MOVEMENT_LABELS[activityType];

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      if (!(await requestMovementPermissions())) {
        setError(
          IS_EXPO_GO
            ? 'Location access is required for route recording.'
            : 'Location access is required for background route recording.',
        );
        return;
      }
      const now = new Date().toISOString();
      const id = randomUUID();
      const unitSystem = await getUnitSystem(db, LOCAL_USER_ID);
      await createMovementActivity(db, {
        id,
        userId: LOCAL_USER_ID,
        activityType,
        startedAt: now,
        unitSystem,
      });
      await setMovementStatus(db, id, LOCAL_USER_ID, 'recording', now);
      await appendNextMovementEvent(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        activityId: id,
        eventType: 'started',
        occurredAt: now,
      });
      await startMovementTracking();
      // `replace`, not `push`: the threshold is behind you once it is crossed, and a back gesture
      // must not return to a screen offering to start a second journey.
      router.replace('/movement/active');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Movement tracking could not start.');
    } finally {
      setStarting(false);
    }
  }, [activityType, db, router]);

  return (
    <View style={styles.screen}>
      <AppBar
        title="The Threshold"
        action={
          <IconButton icon="close" label="Leave the threshold" onPress={() => router.back()} />
        }
      />

      <ScreenScroll>
        {error ? (
          <Notice tone="danger" title="The journey did not begin">
            {error}
          </Notice>
        ) : null}

        <View style={styles.choice}>
          <Eyebrow>Your going</Eyebrow>
          <View style={styles.typeRow}>
            {TYPES.map((type) => (
              <Chip
                key={type}
                label={MOVEMENT_LABELS[type].name}
                selected={type === activityType}
                onPress={() => setActivityType(type)}
                accessibilityLabel={`${MOVEMENT_LABELS[type].name}, ${MOVEMENT_LABELS[type].gloss}`}
                style={styles.typeChip}
              />
            ))}
          </View>
          <Text style={styles.gloss}>
            {chosen.name} — {chosen.gloss}
          </Text>
        </View>

        <Notice
          tone={IS_EXPO_GO ? 'warning' : 'info'}
          title={IS_EXPO_GO ? 'Expo Go test mode' : 'Background location'}
        >
          {IS_EXPO_GO
            ? 'Keep Kairo open for this journey. Background and screen-lock recording require the Android development build.'
            : 'Kairo records only while a journey is underway. Android shows a persistent tracking notification for as long as it does.'}
        </Notice>

        <Button label="Set out" onPress={() => void start()} loading={starting} />
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  choice: { gap: layout.cardGap },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeChip: { flex: 1 },
  gloss: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
});
