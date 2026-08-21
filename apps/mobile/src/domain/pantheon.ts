import type { RecordSet, RouteSample, Task, BodyWeightEntry } from '@/db/types';
import { anchorDayOf, completionDaySet, isScheduledOn, parseRecurrence } from './tasks';
import { todayNumber } from './dates';
import { bestOneRepMax, formatLoad } from './workouts';
import { formatElevation } from './movement';
import { dailyWeights, movingAverage } from './weight';

export const ELEVATION_NOISE_METERS = 3;
export const FASTEST_SEGMENT_METERS = 5000;
export const RECORD_IS_NEW_WITHIN_DAYS = 30;
export const GREATEST_FALL_WINDOW_DAYS = 30;

export type PantheonRecord = {
  exerciseId: string;
  exerciseName: string;
  valueKg: number;
  displayValue: string;
  sessionStartedAt: string;
  isNew: boolean;
};

export type MovementRecord = {
  activityId: string;
  valueMeters: number;
  displayValue: string;
  recordedAtMs: number;
  isNew: boolean;
};

export function elevationGainMeters(
  samples: Pick<RouteSample, 'altitudeMeters'>[],
  noiseMeters = ELEVATION_NOISE_METERS,
): number {
  let reference: number | null = null;
  let gain = 0;
  for (const sample of samples) {
    const altitude = sample.altitudeMeters;
    if (altitude === null || !Number.isFinite(altitude)) continue;
    if (reference === null) {
      reference = altitude;
      continue;
    }
    const delta = altitude - reference;
    if (Math.abs(delta) >= noiseMeters) {
      if (delta > 0) gain += delta;
      reference = altitude;
    }
  }
  return gain;
}

function interpolatedTimeAtDistance(
  a: Pick<RouteSample, 'recordedAtMs' | 'cumulativeDistanceMeters'>,
  b: Pick<RouteSample, 'recordedAtMs' | 'cumulativeDistanceMeters'>,
  distance: number,
): number {
  const span = b.cumulativeDistanceMeters - a.cumulativeDistanceMeters;
  if (span <= 0) return b.recordedAtMs;
  const ratio = Math.max(0, Math.min(1, (distance - a.cumulativeDistanceMeters) / span));
  return a.recordedAtMs + (b.recordedAtMs - a.recordedAtMs) * ratio;
}

export function fastestSegmentSeconds(
  samples: Pick<RouteSample, 'recordedAtMs' | 'cumulativeDistanceMeters'>[],
  segmentMeters = FASTEST_SEGMENT_METERS,
): number | null {
  if (samples.length < 2 || segmentMeters <= 0) return null;
  let best: number | null = null;
  let right = 1;
  for (let left = 0; left < samples.length; left += 1) {
    if (right <= left) right = left + 1;
    while (right < samples.length && samples[right].cumulativeDistanceMeters - samples[left].cumulativeDistanceMeters < segmentMeters) right += 1;
    if (right >= samples.length) break;
    const start = samples[left];
    const end = samples[right];
    const finishMs = interpolatedTimeAtDistance(start, end, start.cumulativeDistanceMeters + segmentMeters);
    const elapsed = (finishMs - start.recordedAtMs) / 1000;
    if (elapsed >= 0 && (best === null || elapsed < best)) best = elapsed;
  }
  return best;
}

export function isRecentRecord(recordedAt: string | number, nowMs: number, withinDays = RECORD_IS_NEW_WITHIN_DAYS): boolean {
  const timestamp = typeof recordedAt === 'number' ? recordedAt : Date.parse(recordedAt);
  return Number.isFinite(timestamp) && timestamp <= nowMs && nowMs - timestamp <= withinDays * 86_400_000;
}

export function workoutRecords(sets: RecordSet[], unit: 'kg' | 'lb', nowMs: number): PantheonRecord[] {
  const best = new Map<string, PantheonRecord>();
  for (const set of sets) {
    const valueKg = bestOneRepMax([set]);
    const current = best.get(set.exerciseId);
    if (!current || valueKg > current.valueKg) {
      best.set(set.exerciseId, {
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        valueKg,
        displayValue: formatLoad(valueKg, unit),
        sessionStartedAt: set.sessionStartedAt,
        isNew: isRecentRecord(set.sessionStartedAt, nowMs),
      });
    }
  }
  return [...best.values()].sort((a, b) => b.valueKg - a.valueKg);
}

export function movementRecords(samples: RouteSample[], unit: 'metric' | 'imperial', nowMs: number): {
  greatestClimb: MovementRecord | null;
  fastest5kSeconds: number | null;
} {
  const byActivity = new Map<string, RouteSample[]>();
  for (const sample of samples) (byActivity.get(sample.activityId) ?? (byActivity.set(sample.activityId, []), byActivity.get(sample.activityId)!)).push(sample);
  let greatest: MovementRecord | null = null;
  let fastest: number | null = null;
  for (const [activityId, points] of byActivity) {
    const gain = elevationGainMeters(points);
    const recordedAtMs = points[0]?.recordedAtMs ?? 0;
    if (!greatest || gain > greatest.valueMeters) greatest = { activityId, valueMeters: gain, displayValue: formatElevation(gain, unit), recordedAtMs, isNew: isRecentRecord(recordedAtMs, nowMs) };
    const segment = fastestSegmentSeconds(points);
    if (segment !== null && (fastest === null || segment < fastest)) fastest = segment;
  }
  return { greatestClimb: greatest && greatest.valueMeters > 0 ? greatest : null, fastest5kSeconds: fastest };
}

export function perfectWeeks(tasks: Task[], completions: Map<string, string[]>, weekStart: 0 | 1, nowMs: number): number {
  const activeTasks = tasks.filter((task) => !task.archived);
  if (activeTasks.length === 0) return 0;
  const today = todayNumber(nowMs);
  const lastWeekStart = today - ((today - weekStart + 7) % 7) - 7;
  let count = 0;
  for (let start = lastWeekStart; ; start -= 7) {
    let perfect = true;
    let scheduledCount = 0;
    for (const task of activeTasks) {
      const recurrence = parseRecurrence(task.recurrenceRule);
      const done = completionDaySet(completions.get(task.id) ?? []);
      const anchor = anchorDayOf(task);
      for (let offset = 0; offset < 7; offset += 1) {
        const day = start + offset;
        if (isScheduledOn(recurrence, day, anchor)) {
          scheduledCount += 1;
          if (!done.has(day)) perfect = false;
        }
      }
    }
    if (scheduledCount === 0) perfect = false;
    if (!perfect) break;
    count += 1;
    if (count > 520) break;
  }
  return count;
}

export function greatestWeightFall(entries: BodyWeightEntry[], nowMs: number): number | null {
  const points = movingAverage(dailyWeights(entries));
  const cutoff = todayNumber(nowMs) - (GREATEST_FALL_WINDOW_DAYS - 1);
  const recent = points.filter((point) => point.day >= cutoff);
  let greatest = 0;
  for (let i = 0; i < recent.length; i += 1) {
    for (let j = i + 1; j < recent.length; j += 1) greatest = Math.max(greatest, recent[i].value - recent[j].value);
  }
  return greatest > 0 ? greatest : null;
}
