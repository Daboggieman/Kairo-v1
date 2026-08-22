/**
 * The March — the screen a journey is lived through: the route drawing itself, four figures, pause,
 * finish.
 *
 * **No back affordance at all**, and that is the point. The bar has no chevron and no close glyph,
 * and `movement/_layout.tsx` turns off the swipe gesture: a recording is left by finishing it, which
 * goes through a confirmation, and every accidental way out of here loses a route that cannot be
 * reconstructed. The clock in the right-hand slot is what the left slot's absence is traded for — the
 * bar still carries something live.
 *
 * `SessionElapsed` rather than the elapsed figure from the database: the row is re-read every two
 * seconds, so a stored `elapsedSeconds` in the bar would tick in two-second jumps beside a strip that
 * updates on the same beat. It computes from `startedAt` and re-renders itself once a second, which
 * is also why it is a separate component — the map does not re-render with it.
 *
 * Departures from `5.18_the_march`:
 *
 * - **Four figures, and `elapsed` is not one of them.** The design's fourth cell duplicates the bar's
 *   clock, and two clocks a second apart on one screen is a bug the reader has to resolve. **Held**
 *   takes the slot — `elapsed - moving`, the time spent standing still, which is the one number here
 *   that cannot be got any other way.
 * - **The pace/speed branch comes from `movementPerformance`.** It was written out inline here *and*
 *   in the tab root, in slightly different words ("pace /km" against "km/h"). One function now, so a
 *   chariot cannot be told its pace.
 * - **No elevation readout.** The design shows one; `elevation_gain_meters` is never written by the
 *   tracker, so it would be a permanent zero. Recorded as a tracker gap, not restyled around.
 *
 * The finish confirmation is the platform `Alert` the old screen used, kept deliberately: it is the
 * one destructive-ish action in the module and a native modal is what stops a thumb.
 */

import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button } from '@/components/Button';
import {
  AppBar,
  Card,
  Divider,
  IconButton,
  Notice,
  Pill,
  StatStrip,
} from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
import { SessionElapsed } from '@/components/SessionElapsed';
import { LOCAL_USER_ID } from '@/constants';
import {
  appendNextMovementEvent,
  completeMovementActivity,
  getActiveMovementActivity,
  listMovementPoints,
  setMovementStatus,
} from '@/db/movement';
import { getMovementPreferences, getUnitSystem, type UnitSystem } from '@/db/preferences';
import type { MovementActivity, MovementPoint } from '@/db/types';
import { formatMovementDistance, heldSeconds, movementPerformance } from '@/domain/movement';
import { formatDuration } from '@/domain/workouts';
import { stopMovementTracking } from '@/services/movementTracking';
import { colors, fontSize, layout, lineHeight, radius, spacing } from '@/theme';

/** How often the screen re-reads the row the location task is writing behind it. */
const POLL_MS = 2_000;

/** The span the map opens at and returns to — about 900 m across, a comfortable few minutes of route. */
const REGION_DELTA = 0.008;

export default function MarchScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [activity, setActivity] = useState<MovementActivity | null>(null);
  const [points, setPoints] = useState<MovementPoint[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  const load = useCallback(async () => {
    try {
      const current = await getActiveMovementActivity(db, LOCAL_USER_ID);
      const [nextPoints, unitSystem] = await Promise.all([
        current ? listMovementPoints(db, current.id) : Promise.resolve([]),
        getUnitSystem(db, LOCAL_USER_ID),
      ]);
      setActivity(current);
      setPoints(nextPoints);
      setUnits(unitSystem);
      setError(null);
    } catch (caught) {
      // This runs on a two-second timer. Without a catch the first failure is an unhandled
      // rejection and the screen simply stops advancing, mid-journey, saying nothing.
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => {
        void load();
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const togglePause = useCallback(async () => {
    if (!activity) return;
    const paused = activity.status === 'manually_paused' || activity.status === 'auto_paused';
    try {
      const occurredAt = new Date().toISOString();
      await setMovementStatus(
        db,
        activity.id,
        LOCAL_USER_ID,
        paused ? 'recording' : 'manually_paused',
        occurredAt,
      );
      await appendNextMovementEvent(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        activityId: activity.id,
        eventType: paused ? 'manual_resumed' : 'manual_paused',
        occurredAt,
        payload: { source: 'button' },
      });
      if ((await getMovementPreferences(db, LOCAL_USER_ID)).voiceCues) {
        Speech.speak(paused ? 'Resuming' : 'Paused');
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [activity, db, load]);

  const finish = useCallback(async () => {
    if (!activity) return;
    setFinishing(true);
    try {
      await stopMovementTracking();
      const endedAt = new Date().toISOString();
      await appendNextMovementEvent(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        activityId: activity.id,
        // 'finished', not 'completed'. Both spellings are in the table already and
        // `describeMovementEvent` reads both; changing this one would need a migration for the
        // rows that came before it, not an edit here.
        eventType: 'finished',
        occurredAt: endedAt,
      });
      await completeMovementActivity(db, { id: activity.id, userId: LOCAL_USER_ID, endedAt });
      if ((await getMovementPreferences(db, LOCAL_USER_ID)).voiceCues) {
        Speech.speak('Journey complete');
      }
      router.replace('/movement');
    } catch (caught) {
      // A failure here leaves the activity open, which is recoverable — the tab root will offer to
      // rejoin it. Saying so beats a spinner that stops.
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setFinishing(false);
    }
  }, [activity, db, router]);

  const confirmFinish = useCallback(() => {
    Alert.alert('Close the journey?', 'The route is written to your chronicles.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Finish',
        style: 'destructive',
        onPress: () => {
          void finish();
        },
      },
    ]);
  }, [finish]);

  if (!activity) {
    return (
      <View style={styles.screen}>
        <AppBar title="The March" />
        <View style={styles.center}>
          {error ? (
            <Notice tone="danger" title="The journey could not be recovered">
              {error}
            </Notice>
          ) : (
            <>
              <LogoLoader />
              <Text style={styles.muted}>Recovering the journey underway…</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  const accepted = points.filter(
    (point) => point.processingState === 'accepted' && !point.excludedByEdit,
  );
  const coordinates = accepted.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  const rawCoordinates = points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  const latest = coordinates.at(-1) ?? rawCoordinates.at(-1);
  const hasAccurateFix = coordinates.length > 0;
  const paused = activity.status === 'manually_paused' || activity.status === 'auto_paused';
  const distance = formatMovementDistance(activity.distanceMeters, units);
  const performance = movementPerformance(activity, units);

  return (
    <View style={styles.screen}>
      <AppBar
        title="The March"
        action={<SessionElapsed startedAt={activity.startedAt} style={styles.clock} />}
      />

      <View style={styles.mapWrap}>
        {latest ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              ...latest,
              latitudeDelta: REGION_DELTA,
              longitudeDelta: REGION_DELTA,
            }}
          >
            <Polyline coordinates={coordinates} strokeColor={colors.accent} strokeWidth={5} />
            <Marker coordinate={latest} />
          </MapView>
        ) : (
          <View style={styles.center}>
            <LogoLoader size={72} />
            <Text style={styles.muted}>Waiting for a GPS fix</Text>
          </View>
        )}

        {latest && !hasAccurateFix ? (
          <View style={styles.fixNotice}>
            <Text style={styles.fixNoticeText}>Waiting for an accurate GPS fix</Text>
          </View>
        ) : null}

        {activity.status === 'auto_paused' ? (
          <View style={styles.autoPaused}>
            <Pill label="Autopaused" icon="pause" tone="accent" />
          </View>
        ) : null}

        {latest ? (
          <View style={styles.recenter}>
            <IconButton
              icon="crosshairs-gps"
              label="Recentre the map"
              variant="outlined"
              onPress={() =>
                mapRef.current?.animateToRegion(
                  { ...latest, latitudeDelta: REGION_DELTA, longitudeDelta: REGION_DELTA },
                  300,
                )
              }
            />
          </View>
        ) : null}
      </View>

      <View style={styles.readout}>
        {error ? (
          <Notice tone="danger" title="The journey is still recording">
            {error}
          </Notice>
        ) : null}

        {/* Two bare strips with a rule between them: the only way four display figures fit. */}
        <Card style={styles.figures}>
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

        <View style={styles.controls}>
          <Button
            label={paused ? 'Resume' : 'Hold'}
            variant="secondary"
            onPress={() => void togglePause()}
            style={styles.holdButton}
          />
          <Button
            label="Finish"
            variant="danger"
            loading={finishing}
            onPress={confirmFinish}
            style={styles.finishButton}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  clock: { color: colors.accent, fontSize: fontSize.md },
  mapWrap: { flex: 1, minHeight: 280, backgroundColor: colors.surface },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: layout.cardGap,
    padding: layout.screenPadding,
    backgroundColor: colors.background,
  },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  readout: { padding: layout.screenPadding, gap: layout.cardGap },
  /** The strips own the vertical room; the card would otherwise double it. */
  figures: { paddingVertical: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  holdButton: { flex: 1 },
  finishButton: { flex: 1 },
  /**
   * Both map overlays sit inside the map's own frame rather than the screen's, so they stay put
   * when the readout below grows a `Notice`. The surface backing is on the wrapper, not the
   * `IconButton` — a 44pt glyph with no fill is invisible over a light map tile.
   */
  recenter: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
  },
  autoPaused: { position: 'absolute', left: spacing.md, top: spacing.md },
  fixNotice: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
  },
  fixNoticeText: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
});
