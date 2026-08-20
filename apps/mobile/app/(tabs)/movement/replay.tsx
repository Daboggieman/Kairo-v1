/**
 * The Retelling — the route drawn again, at speed, over the map it was recorded on.
 *
 * The playback logic is the incumbent one, restyled rather than rewritten: a full route replays in
 * `REPLAY_SPAN_MS` of wall clock whatever its real duration, which is why the speed control multiplies
 * that span rather than the recording's own pace. A two-hour ride replayed at its own pace would take
 * two hours.
 *
 * Departures from `5.21`:
 *
 * - **The speed control is four `Chip`s, not one cycling button.** The old control advanced 1 → 2 → 4 →
 *   8 → 1 on each tap, so the only way to find out what it would do was to press it, and the only way
 *   back from 8× was three more presses. Four chips are the same four choices, stated.
 * - **The scrub track is a `ProgressBar` inside a padded `Pressable`.** The bar is the theme's, so it
 *   has the square cap the design system asks for; the padding is the touch target, which a 12px bar
 *   does not give on its own.
 * - **Loading and "no route" are told apart.** Both used to render "No route available for replay",
 *   so the half-second before the points arrived looked like a permanent failure.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import {
  AppBar,
  Card,
  Chip,
  Divider,
  EmptyState,
  Eyebrow,
  IconButton,
  Notice,
  ProgressBar,
  Screen,
  StatStrip,
} from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
import { LOCAL_USER_ID } from '@/constants';
import { listMovementPoints } from '@/db/movement';
import { getUnitSystem, type UnitSystem } from '@/db/preferences';
import type { MovementPoint } from '@/db/types';
import { formatMovementDistance, replayFrameAt } from '@/domain/movement';
import { formatDuration } from '@/domain/workouts';
import { colors, layout, spacing } from '@/theme';

/** How long a whole route takes to replay at 1×. */
const REPLAY_SPAN_MS = 60_000;

/** 20 frames a second: smooth enough for a marker, cheap enough for a map. */
const TICK_MS = 50;

const SPEEDS = [1, 2, 4, 8];

export default function RetellingScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ activityId?: string | string[] }>();
  const activityId = Array.isArray(params.activityId) ? params.activityId[0] : params.activityId;

  const [points, setPoints] = useState<MovementPoint[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [trackWidth, setTrackWidth] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    (async () => {
      try {
        const [route, unitSystem] = await Promise.all([
          listMovementPoints(db, activityId),
          getUnitSystem(db, LOCAL_USER_ID),
        ]);
        if (cancelled) return;
        setPoints(route);
        setUnits(unitSystem);
        setError(null);
      } catch (caught) {
        // Without this the rejection was unhandled and the screen claimed there was no route.
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activityId, db]);

  const accepted = useMemo(
    () => points.filter((point) => point.processingState === 'accepted' && !point.excludedByEdit),
    [points],
  );

  const replayPoints = useMemo(
    () =>
      accepted.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        recordedAtMs: Date.parse(point.recordedAt),
        cumulativeDistanceMeters: point.cumulativeDistanceMeters,
      })),
    [accepted],
  );

  const start = replayPoints[0]?.recordedAtMs ?? 0;
  const end = replayPoints.at(-1)?.recordedAtMs ?? start;
  const frame = replayFrameAt(replayPoints, start + (end - start) * progress);

  useEffect(() => {
    if (!playing || end <= start) return;
    const timer = setInterval(() => {
      setProgress((current) => {
        const next = current + (TICK_MS * speed) / REPLAY_SPAN_MS;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [end, playing, speed, start]);

  if (!loaded) {
    return (
      <Screen>
        <AppBar title="The Retelling" onBack={() => router.back()} />
        <View style={styles.centered}>
          <LogoLoader />
        </View>
      </Screen>
    );
  }

  if (!frame) {
    return (
      <Screen>
        <AppBar title="The Retelling" onBack={() => router.back()} />
        {error ? (
          <View style={styles.padded}>
            <Notice tone="danger" title="Could not read this route">
              {error}
            </Notice>
          </View>
        ) : (
          <EmptyState
            title="Nothing to retell"
            body="This journey has no accepted route points, so there is no line to draw again."
          />
        )}
      </Screen>
    );
  }

  const coordinates = replayPoints.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  const drawn = coordinates.slice(0, Math.max(1, Math.ceil(coordinates.length * progress)));
  const distance = formatMovementDistance(frame.cumulativeDistanceMeters, units);

  return (
    <Screen>
      <AppBar
        title="The Retelling"
        onBack={() => router.back()}
        action={<Eyebrow tone="accent">{`${speed}×`}</Eyebrow>}
      />

      <MapView
        style={styles.map}
        region={{
          latitude: frame.latitude,
          longitude: frame.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {/* The whole route in the border colour, the part retold so far in accent over it. */}
        <Polyline coordinates={coordinates} strokeColor={colors.border} strokeWidth={4} />
        <Polyline coordinates={drawn} strokeColor={colors.accent} strokeWidth={5} />
        <Marker coordinate={{ latitude: frame.latitude, longitude: frame.longitude }} />
      </MapView>

      <View style={styles.panel}>
        {error ? (
          <Notice tone="danger" title="Could not read this route">
            {error}
          </Notice>
        ) : null}

        <Card style={styles.readout}>
          <StatStrip
            bare
            size="lg"
            items={[
              { label: distance.label, value: distance.value, tone: 'accent' },
              {
                label: 'Elapsed',
                value: formatDuration(Math.round((frame.recordedAtMs - start) / 1000)),
              },
            ]}
          />
          <Divider />
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Scrub through the route"
            style={styles.scrub}
            onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
            onPress={(event) =>
              setProgress(Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth)))
            }
          >
            <ProgressBar value={progress} max={1} height={8} />
          </Pressable>
        </Card>

        <View style={styles.controls}>
          <IconButton icon="restart" label="Start the retelling again" onPress={() => setProgress(0)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause the retelling' : 'Play the retelling'}
            accessibilityState={{ selected: playing }}
            style={({ pressed }) => [styles.play, pressed && styles.pressed]}
            onPress={() => setPlaying((value) => !value)}
          >
            <MaterialCommunityIcons
              name={playing ? 'pause' : 'play'}
              color={colors.accentText}
              size={32}
            />
          </Pressable>
          <View style={styles.speeds}>
            {SPEEDS.map((option) => (
              <Chip
                key={option}
                label={`${option}×`}
                selected={option === speed}
                onPress={() => setSpeed(option)}
                accessibilityLabel={`Replay at ${option} times speed`}
                style={styles.speedChip}
              />
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  padded: { padding: layout.screenPadding },
  map: { flex: 1, minHeight: 240 },
  panel: { padding: layout.screenPadding, gap: layout.cardGap },
  /** The strip and the track own their spacing; the card would otherwise double the top of it. */
  readout: { paddingBottom: spacing.sm },
  /** The padding *is* the touch target — an 8px bar is not one. */
  scrub: { paddingVertical: spacing.sm },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  /**
   * The one filled circle in the app. It is the single primary action on the screen and it is a
   * transport control, where round is the convention every player shares — the chiselled square cap
   * belongs to the bars, not to this.
   */
  play: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  speeds: { flex: 1, flexDirection: 'row', gap: spacing.xs },
  /** Four chips across the remaining room, so the horizontal padding has to go. */
  speedChip: { flex: 1, paddingHorizontal: 0 },
});
