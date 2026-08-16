import { randomUUID } from 'expo-crypto';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { DATABASE_NAME, LOCAL_USER_ID } from '@/constants';
import {
  appendMovementPoint,
  appendNextMovementEvent,
  createMovementEngineState,
  getActiveMovementActivity,
  getMovementEngineState,
  loadMovementState,
  setMovementStatus,
  updateMovementEngineState,
} from '@/db/movement';
import { migrate } from '@/db/migrations';
import { getMovementPreferences, getUnitSystem } from '@/db/preferences';
import { crossedCues, evaluateAutopause, processSample } from '@/domain/movement';

export const MOVEMENT_LOCATION_TASK = 'kairo-movement-location';
export const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

type LocationTaskData = { locations?: Location.LocationObject[] };
let foregroundSubscription: Location.LocationSubscription | null = null;

async function processLocationBatch(locations: Location.LocationObject[]): Promise<void> {
  if (locations.length === 0) return;

  const db = await openDatabaseAsync(DATABASE_NAME);
  try {
    await migrate(db);
    const activity = await getActiveMovementActivity(db, LOCAL_USER_ID);
    if (!activity || activity.status === 'preparing' || activity.status === 'finishing') return;
    let state = await loadMovementState(db, activity);
    const unitSystem = await getUnitSystem(db, LOCAL_USER_ID);
    const preferences = await getMovementPreferences(db, LOCAL_USER_ID);
    await createMovementEngineState(db, activity.id, unitSystem);
    let engine = await getMovementEngineState(db, activity.id);
    for (const location of locations) {
      const previousSampleAtMs = state.lastSampleAtMs;
      const result = processSample(state, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        recordedAtMs: location.timestamp,
        accuracyMeters: location.coords.accuracy,
        altitudeMeters: location.coords.altitude,
        speedMps: location.coords.speed,
      });
      state = result.state;
      await appendMovementPoint(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        activityId: activity.id,
        point: result.point,
        state,
      });

      const elapsedSeconds = previousSampleAtMs === null
        ? 0
        : Math.max(0.001, (location.timestamp - previousSampleAtMs) / 1000);
      const speedMps = location.coords.speed ?? (
        elapsedSeconds > 0 ? result.point.distanceFromPreviousMeters / elapsedSeconds : 0
      );
      if (preferences.autopause) {
        const decision = evaluateAutopause(
          state.status,
          state.activityType,
          Math.max(0, speedMps),
          location.timestamp,
          engine.autopause,
        );
        engine.autopause = decision.state;
        if (decision.event) {
          const status = decision.event === 'auto_paused' ? 'auto_paused' : 'recording';
          await setMovementStatus(db, activity.id, LOCAL_USER_ID, status, new Date(location.timestamp).toISOString());
          state = { ...state, status };
          await appendNextMovementEvent(db, {
            id: randomUUID(), userId: LOCAL_USER_ID, activityId: activity.id,
            eventType: decision.event, occurredAt: new Date(location.timestamp).toISOString(),
          });
          if (preferences.voiceCues) Speech.speak(decision.event === 'auto_paused' ? 'Auto pause' : 'Resuming');
        }
      }

      const crossed = crossedCues(
        engine.cues, state.distanceMeters, state.movingSeconds, unitSystem,
      );
      engine.cues = crossed.schedule;
      const distanceCue = crossed.distance && preferences.distanceCues;
      const timeCue = crossed.time && preferences.timeCues;
      if (distanceCue || timeCue) {
        const distance = unitSystem === 'metric'
          ? `${(state.distanceMeters / 1000).toFixed(1)} kilometers`
          : `${(state.distanceMeters / 1609.344).toFixed(1)} miles`;
        const phrase = `${distance}, ${Math.floor(state.movingSeconds / 60)} minutes`;
        await appendNextMovementEvent(db, {
          id: randomUUID(), userId: LOCAL_USER_ID, activityId: activity.id,
          eventType: 'voice_cue', occurredAt: new Date(location.timestamp).toISOString(),
          payload: { distance: distanceCue, time: timeCue, phrase },
        });
        if (preferences.voiceCues) Speech.speak(phrase);
      }
      await updateMovementEngineState(db, activity.id, engine.autopause, engine.cues);
    }
  } finally {
    await db.closeAsync();
  }
}

TaskManager.defineTask(MOVEMENT_LOCATION_TASK, async ({ data, error }) => {
  if (error) throw new Error(error.message);
  const locations = (data as LocationTaskData | undefined)?.locations ?? [];
  await processLocationBatch(locations);
});

export async function requestMovementPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return false;
  if (IS_EXPO_GO) return true;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.granted;
}

export async function startMovementTracking(): Promise<void> {
  if (IS_EXPO_GO) {
    if (foregroundSubscription) return;
    foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000,
        distanceInterval: 3,
      },
      (location) => { void processLocationBatch([location]); },
    );
    return;
  }
  if (await Location.hasStartedLocationUpdatesAsync(MOVEMENT_LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(MOVEMENT_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 3000,
    distanceInterval: 3,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Kairo is tracking your workout',
      notificationBody: 'Distance and route recording are active.',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopMovementTracking(): Promise<void> {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
  if (IS_EXPO_GO) return;
  if (!(await Location.hasStartedLocationUpdatesAsync(MOVEMENT_LOCATION_TASK))) return;
  await Location.stopLocationUpdatesAsync(MOVEMENT_LOCATION_TASK);
}
