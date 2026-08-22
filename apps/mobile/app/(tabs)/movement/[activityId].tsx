/**
 * The Chronicle — one finished journey, written up: the route, four figures, the splits, the
 * timeline, and the two edits the schema supports.
 *
 * Departures from `5.19` / `5.20`:
 *
 * - **No CLIMB cell and no elevation chart.** `elevation_gain_meters` is never written by the tracker,
 *   so both would be a permanent zero — which reads as a flat route rather than an unmeasured one.
 *   That is a tracker gap, recorded as one; restyling around it would mean inventing an altitude
 *   threshold gate, which is a feature.
 * - **HELD is derived, not read.** `paused_seconds` is only ever written by `trimMovementActivity`, so
 *   it is blank on most rows. `heldSeconds` takes `elapsed - moving`, which is true however the row
 *   came to be.
 * - **No "pace peaked at 4:10/km" in the timeline.** No event records a peak. The rest of the
 *   timeline is real rows.
 * - **The map is a still, not a live map.** Pan and zoom are off and the scroll gesture belongs to the
 *   page — a map inside a `ScrollView` otherwise swallows every drag that starts over it, which on this
 *   screen is most of them. Interacting with the route is what The Retelling is for, and the button
 *   under the still is how you get there.
 * - **Hero figures 2×2**, as on The Stele: four display numbers across a phone give each about 80pt.
 *
 * The splits bar is drawn against the *fastest* split rather than a target, so the column reads as a
 * shape — where the effort went — and the partial last split is annotated with its real distance,
 * which is why its time is short. Its bar uses the extrapolated per-unit figure so it compares
 * honestly with the whole ones; that arithmetic is in `splits()`, under test, not here.
 */

import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button } from '@/components/Button';
import {
  AppBar,
  Card,
  Chip,
  Divider,
  EmptyState,
  Eyebrow,
  Field,
  IconButton,
  Notice,
  Pill,
  ProgressBar,
  Screen,
  ScreenScroll,
  Section,
  StatStrip,
} from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
import { LOCAL_USER_ID } from '@/constants';
import {
  editMovementActivity,
  getMovementActivity,
  listMovementEvents,
  listMovementPoints,
  trimMovementActivity,
} from '@/db/movement';
import { getUnitSystem, type UnitSystem } from '@/db/preferences';
import type { MovementActivity, MovementEvent, MovementPoint, MovementType } from '@/db/types';
import {
  describeMovementEvent,
  formatMovementDistance,
  heldSeconds,
  MOVEMENT_LABELS,
  movementPerformance,
  splits,
} from '@/domain/movement';
import { formatDuration } from '@/domain/workouts';
import { colors, fontSize, layout, lineHeight, radius, spacing, type as typeScale } from '@/theme';

/** The order the three types are offered in, matching The Threshold. */
const TYPES: MovementType[] = ['run', 'walk', 'ride'];

/** Tall enough for a route to have a shape, short enough to leave the figures above the fold. */
const MAP_HEIGHT = 220;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * One end of the trim, moved a point at a time.
 *
 * A stepper rather than a slider: a route has a few hundred points and the reason to trim is the
 * handful recorded before you started moving, so the useful gesture is "one more" and not "somewhere
 * around here". The sequence number is shown because it is what `trimMovementActivity` records.
 */
function TrimStepper({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.trimControl}>
      <Eyebrow>{label}</Eyebrow>
      <View style={styles.stepper}>
        <IconButton
          icon="minus"
          label={`Move the ${label.toLowerCase()} point earlier`}
          onPress={onDecrease}
        />
        <Text style={styles.sequence}>{value}</Text>
        <IconButton
          icon="plus"
          label={`Move the ${label.toLowerCase()} point later`}
          onPress={onIncrease}
        />
      </View>
    </View>
  );
}

export default function ChronicleScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ activityId?: string | string[] }>();
  const activityId = Array.isArray(params.activityId) ? params.activityId[0] : params.activityId;

  const [activity, setActivity] = useState<MovementActivity | null>(null);
  const [points, setPoints] = useState<MovementPoint[]>([]);
  const [events, setEvents] = useState<MovementEvent[]>([]);
  const [unit, setUnit] = useState<UnitSystem>('metric');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [activityType, setActivityType] = useState<MovementType>('run');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activityId) return;
    try {
      const [loadedActivity, loadedPoints, loadedEvents, units] = await Promise.all([
        getMovementActivity(db, activityId, LOCAL_USER_ID),
        listMovementPoints(db, activityId),
        listMovementEvents(db, activityId),
        getUnitSystem(db, LOCAL_USER_ID),
      ]);
      setActivity(loadedActivity);
      setName(loadedActivity?.name ?? '');
      setActivityType(loadedActivity?.activityType ?? 'run');
      setPoints(loadedPoints);
      setEvents(loadedEvents);
      setUnit(units);
      const included = loadedPoints.filter(
        (point) => point.processingState === 'accepted' && !point.excludedByEdit,
      );
      setTrimStart(included[0]?.sequence ?? 0);
      setTrimEnd(included.at(-1)?.sequence ?? 0);
      setError(null);
    } catch (caught) {
      // Without this the rejection was unhandled and the screen sat on a spinner forever.
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoaded(true);
    }
  }, [activityId, db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** Every accepted point, including any the last trim excluded — the trim's own range. */
  const acceptedRaw = useMemo(
    () => points.filter((point) => point.processingState === 'accepted'),
    [points],
  );

  const included = useMemo(
    () => acceptedRaw.filter((point) => !point.excludedByEdit),
    [acceptedRaw],
  );

  const coordinates = useMemo(
    () => included.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    [included],
  );

  const splitRows = useMemo(
    () =>
      splits(
        included.map((point) => ({
          recordedAtMs: Date.parse(point.recordedAt),
          cumulativeDistanceMeters: point.cumulativeDistanceMeters,
        })),
        unit,
      ),
    [included, unit],
  );

  /** Events the describer has no phrase for are machinery, and are dropped rather than shown raw. */
  const timeline = useMemo(
    () =>
      events
        .map((event) => ({ event, description: describeMovementEvent(event.eventType) }))
        .filter(
          (entry): entry is { event: MovementEvent; description: string } =>
            entry.description !== null,
        ),
    [events],
  );

  const saveDetails = useCallback(async () => {
    if (!activityId) return;
    setSaving(true);
    try {
      await editMovementActivity(db, {
        id: activityId,
        userId: LOCAL_USER_ID,
        name: name.trim() || null,
        activityType,
        eventId: randomUUID(),
        updatedAt: new Date().toISOString(),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }, [activityId, activityType, db, load, name]);

  const applyTrim = useCallback(async () => {
    if (!activityId || trimStart > trimEnd) return;
    setSaving(true);
    try {
      await trimMovementActivity(db, {
        id: activityId,
        userId: LOCAL_USER_ID,
        firstSequence: trimStart,
        lastSequence: trimEnd,
        eventId: randomUUID(),
        updatedAt: new Date().toISOString(),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }, [activityId, db, load, trimEnd, trimStart]);

  const confirmTrim = useCallback(() => {
    Alert.alert(
      'Amend the chronicle?',
      'The raw route is kept. The figures above are recalculated from the range you have set.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Amend',
          onPress: () => {
            void applyTrim();
          },
        },
      ],
    );
  }, [applyTrim]);

  if (!loaded) {
    return (
      <Screen>
        <AppBar title="The Chronicle" onBack={() => router.back()} />
        <View style={styles.centered}>
          <LogoLoader />
        </View>
      </Screen>
    );
  }

  if (!activity) {
    return (
      <Screen>
        <AppBar title="The Chronicle" onBack={() => router.back()} />
        {error ? (
          <View style={styles.padded}>
            <Notice tone="danger" title="Could not read this journey">
              {error}
            </Notice>
          </View>
        ) : (
          <EmptyState
            title="No such chronicle"
            body="This journey is not on this device. It may have been recorded elsewhere and not yet synced."
          />
        )}
      </Screen>
    );
  }

  const label = MOVEMENT_LABELS[activity.activityType];
  const distance = formatMovementDistance(activity.distanceMeters, unit);
  const performance = movementPerformance(activity, unit);
  const first = coordinates[0];
  const last = coordinates.at(-1);
  const fastestSplit = Math.min(...splitRows.map((split) => split.secondsPerUnit));
  const detailsDirty =
    name.trim() !== (activity.name ?? '') || activityType !== activity.activityType;
  const trimDirty =
    trimStart !== (included[0]?.sequence ?? 0) || trimEnd !== (included.at(-1)?.sequence ?? 0);

  return (
    <Screen>
      <AppBar
        title="The Chronicle"
        onBack={() => router.back()}
        action={<Pill label={label.name} icon={label.icon} tone="accent" />}
      />

      <ScreenScroll>
        {error ? (
          <Notice tone="danger" title="Could not read this journey">
            {error}
          </Notice>
        ) : null}

        <Card style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={styles.heroDate}>{formatDate(activity.startedAt)}</Text>
            <Text style={styles.heroTime}>
              {formatTime(activity.startedAt)}
              {activity.endedAt ? ` – ${formatTime(activity.endedAt)}` : ''}
            </Text>
            {activity.name ? <Text style={styles.heroName}>{activity.name}</Text> : null}
          </View>

          <StatStrip
            bare
            size="lg"
            items={[
              { label: distance.label, value: distance.value, tone: 'accent' },
              { label: performance.unit, value: performance.value },
            ]}
          />
          <Divider />
          <StatStrip
            bare
            items={[
              { label: 'Moving', value: formatDuration(activity.movingSeconds) },
              { label: 'Held', value: formatDuration(heldSeconds(activity)) },
            ]}
          />
        </Card>

        {last ? (
          <View style={styles.mapCard}>
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={{ ...last, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
            >
              <Polyline coordinates={coordinates} strokeColor={colors.accent} strokeWidth={5} />
              {first ? <Marker coordinate={first} pinColor={colors.success} /> : null}
              <Marker coordinate={last} pinColor={colors.danger} />
            </MapView>
          </View>
        ) : (
          <Notice tone="info" title="No route was recorded">
            Every fix this journey took was rejected for accuracy, so there is no line to draw. The
            figures above come from the samples themselves and still stand.
          </Notice>
        )}

        <Button
          label="Watch the retelling"
          variant="secondary"
          disabled={coordinates.length < 2}
          onPress={() => router.push({ pathname: '/movement/replay', params: { activityId } })}
        />

        {splitRows.length > 0 ? (
          <Section title={unit === 'metric' ? 'The splits, by kilometre' : 'The splits, by mile'}>
            <Card>
              {splitRows.map((split) => {
                const partial = formatMovementDistance(split.distanceMeters, unit);
                return (
                  <View key={split.index} style={styles.splitRow}>
                    <Text style={styles.splitIndex}>{split.index}</Text>
                    <ProgressBar
                      value={fastestSplit}
                      max={split.secondsPerUnit}
                      height={8}
                      style={styles.splitBar}
                    />
                    {split.partial ? (
                      <Text style={styles.splitPartial}>{`${partial.value} ${partial.label}`}</Text>
                    ) : null}
                    <Text style={styles.splitTime}>{formatDuration(Math.round(split.seconds))}</Text>
                  </View>
                );
              })}
            </Card>
          </Section>
        ) : null}

        {timeline.length > 0 ? (
          <Section title="The timeline" action={<Eyebrow>{`Revision ${activity.revision}`}</Eyebrow>}>
            <Card>
              {timeline.map((entry) => (
                <View key={entry.event.id} style={styles.timelineRow}>
                  <Text style={styles.timelineTime}>{formatTime(entry.event.occurredAt)}</Text>
                  <View style={styles.timelineDot} />
                  <Text style={styles.timelineText}>{entry.description}</Text>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title="Amend the record">
          <Card>
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Name this journey"
            />
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
            <Button
              label="Save"
              disabled={!detailsDirty}
              loading={saving}
              onPress={() => {
                void saveDetails();
              }}
            />
          </Card>
        </Section>

        {acceptedRaw.length >= 2 ? (
          <Section title="Trim the route">
            <Card>
              <Text style={styles.trimBody}>
                Drop the fixes taken before you set out or after you stopped. The raw route is kept,
                so a trim can be widened again.
              </Text>
              <View style={styles.trimRow}>
                <TrimStepper
                  label="Start"
                  value={trimStart}
                  onDecrease={() =>
                    setTrimStart((value) => Math.max(acceptedRaw[0].sequence, value - 1))
                  }
                  onIncrease={() => setTrimStart((value) => Math.min(trimEnd, value + 1))}
                />
                <TrimStepper
                  label="End"
                  value={trimEnd}
                  onDecrease={() => setTrimEnd((value) => Math.max(trimStart, value - 1))}
                  onIncrease={() =>
                    setTrimEnd((value) =>
                      Math.min(acceptedRaw.at(-1)?.sequence ?? value, value + 1),
                    )
                  }
                />
              </View>
              <Button
                label="Amend"
                variant="danger"
                disabled={!trimDirty}
                loading={saving}
                onPress={confirmTrim}
              />
            </Card>
          </Section>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  padded: { padding: layout.screenPadding },
  hero: { gap: layout.cardPadding },
  heroText: { gap: spacing.xs },
  heroDate: { color: colors.text, ...typeScale.headlineSm },
  heroTime: {
    color: colors.textMuted,
    ...typeScale.label,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  heroName: { color: colors.text, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  /** A framed still. `overflow: hidden` is what clips the map to the radius. */
  mapCard: {
    height: MAP_HEIGHT,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  splitIndex: {
    minWidth: 20,
    color: colors.accent,
    ...typeScale.eyebrow,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  splitBar: { flex: 1 },
  splitPartial: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  splitTime: {
    minWidth: 52,
    textAlign: 'right',
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontVariant: ['tabular-nums'],
  },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  timelineTime: {
    minWidth: 56,
    color: colors.textMuted,
    ...typeScale.label,
    fontVariant: ['tabular-nums'],
  },
  timelineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  timelineText: { flex: 1, color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeChip: { flex: 1 },
  trimBody: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  trimRow: { flexDirection: 'row', gap: spacing.md },
  trimControl: { flex: 1, gap: spacing.sm },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  sequence: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontVariant: ['tabular-nums'],
  },
});
