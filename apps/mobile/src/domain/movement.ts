/** Pure movement tracking primitives. Native location callbacks and SQLite live elsewhere. */

export type MovementType = 'run' | 'walk' | 'ride';
export type TrackingStatus =
  | 'draft'
  | 'preparing'
  | 'recording'
  | 'manually_paused'
  | 'auto_paused'
  | 'finishing'
  | 'completed'
  | 'cancelled'
  | 'discarded'
  | 'interrupted';
export type MovementEventType =
  | 'prepare'
  | 'started'
  | 'manual_paused'
  | 'manual_resumed'
  | 'auto_paused'
  | 'auto_resumed'
  | 'voice_cue'
  | 'finish_requested'
  | 'completed'
  | 'cancelled'
  | 'edited';

export type LocationSample = {
  latitude: number;
  longitude: number;
  recordedAtMs: number;
  accuracyMeters?: number | null;
  altitudeMeters?: number | null;
  speedMps?: number | null;
};

export type AcceptedPoint = LocationSample & {
  sequence: number;
  distanceFromPreviousMeters: number;
  cumulativeDistanceMeters: number;
  accepted: boolean;
  rejectionReason: string | null;
};

export type MovementState = {
  status: TrackingStatus;
  activityType: MovementType;
  elapsedSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  lastSampleAtMs: number | null;
  lastAcceptedPoint: LocationSample | null;
  nextSequence: number;
};

export type AutopauseState = {
  belowThresholdSinceMs: number | null;
  aboveThresholdSinceMs: number | null;
};

export type CueSchedule = {
  nextDistanceMeters: number;
  nextTimeSeconds: number;
};

export type ReplayPoint = Pick<
  AcceptedPoint,
  'latitude' | 'longitude' | 'recordedAtMs' | 'cumulativeDistanceMeters'
>;

export type ReplayFrame = {
  latitude: number;
  longitude: number;
  recordedAtMs: number;
  cumulativeDistanceMeters: number;
  progress: number;
};

export type EditableMovementPoint = Pick<ReplayPoint, 'latitude' | 'longitude' | 'recordedAtMs'> & {
  sequence: number;
  accepted: boolean;
  isPaused: boolean;
};

export type RecomputedRoute = {
  includedSequences: number[];
  distanceBySequence: Map<number, { distanceFromPreviousMeters: number; cumulativeDistanceMeters: number }>;
  distanceMeters: number;
  elapsedSeconds: number;
  movingSeconds: number;
};

/** Rebuilds derived route metrics from retained raw points after an edit. */
export function recomputeEditedRoute(
  points: EditableMovementPoint[],
  excludedSequences: ReadonlySet<number> = new Set(),
): RecomputedRoute {
  const included = points
    .filter((point) => point.accepted && !excludedSequences.has(point.sequence))
    .sort((a, b) => a.sequence - b.sequence);
  const distanceBySequence = new Map<number, { distanceFromPreviousMeters: number; cumulativeDistanceMeters: number }>();
  let distanceMeters = 0;
  let elapsedSeconds = 0;
  let movingSeconds = 0;
  for (let index = 0; index < included.length; index += 1) {
    const point = included[index];
    const previous = included[index - 1];
    const segmentDistance = previous ? haversineMeters(previous, point) : 0;
    const segmentSeconds = previous
      ? Math.max(0, (point.recordedAtMs - previous.recordedAtMs) / 1000)
      : 0;
    distanceMeters += segmentDistance;
    elapsedSeconds += segmentSeconds;
    if (previous && !previous.isPaused) movingSeconds += segmentSeconds;
    distanceBySequence.set(point.sequence, {
      distanceFromPreviousMeters: segmentDistance,
      cumulativeDistanceMeters: distanceMeters,
    });
  }
  return {
    includedSequences: included.map((point) => point.sequence),
    distanceBySequence,
    distanceMeters,
    elapsedSeconds,
    movingSeconds,
  };
}

export const METERS_PER_MILE = 1609.344;
export const DEFAULT_ACCURACY_LIMIT_METERS = 50;

type AutopauseThresholds = {
  pauseSpeedMps: number;
  resumeSpeedMps: number;
  confirmationSeconds: number;
};

const thresholds: Record<MovementType, AutopauseThresholds> = {
  run: { pauseSpeedMps: 0.8, resumeSpeedMps: 1.2, confirmationSeconds: 10 },
  walk: { pauseSpeedMps: 0.35, resumeSpeedMps: 0.65, confirmationSeconds: 12 },
  ride: { pauseSpeedMps: 1, resumeSpeedMps: 1.8, confirmationSeconds: 10 },
};

export function haversineMeters(
  a: Pick<LocationSample, 'latitude' | 'longitude'>,
  b: Pick<LocationSample, 'latitude' | 'longitude'>,
): number {
  const radius = 6_371_000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function formatPace(secondsPerKm: number, unit: 'metric' | 'imperial'): string {
  const secondsPerUnit =
    unit === 'metric' ? secondsPerKm : secondsPerKm * (METERS_PER_MILE / 1000);
  if (!Number.isFinite(secondsPerUnit) || secondsPerUnit <= 0) return '--:--';
  const whole = Math.floor(secondsPerUnit);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function formatMovementDistance(
  distanceMeters: number,
  unit: 'metric' | 'imperial',
): { value: string; label: string } {
  const safe = Number.isFinite(distanceMeters) ? Math.max(0, distanceMeters) : 0;
  return unit === 'metric'
    ? { value: (safe / 1000).toFixed(2), label: 'km' }
    : { value: (safe / METERS_PER_MILE).toFixed(2), label: 'mi' };
}

export function formatMovementSpeed(speedMps: number, unit: 'metric' | 'imperial'): string {
  if (!Number.isFinite(speedMps) || speedMps <= 0) return '--';
  return unit === 'metric' ? (speedMps * 3.6).toFixed(1) : (speedMps * 2.236936).toFixed(1);
}

export function movementThresholds(activityType: MovementType) {
  return thresholds[activityType];
}

export function createAutopauseState(): AutopauseState {
  return { belowThresholdSinceMs: null, aboveThresholdSinceMs: null };
}

export function evaluateAutopause(
  status: TrackingStatus,
  activityType: MovementType,
  speedMps: number,
  nowMs: number,
  state: AutopauseState,
): { state: AutopauseState; event: 'auto_paused' | 'auto_resumed' | null } {
  const config = thresholds[activityType];
  const confirmationMs = config.confirmationSeconds * 1000;
  if (status === 'manually_paused') return { state: createAutopauseState(), event: null };
  if (status === 'recording') {
    if (speedMps >= config.pauseSpeedMps) return { state: createAutopauseState(), event: null };
    const since = state.belowThresholdSinceMs ?? nowMs;
    if (nowMs - since >= confirmationMs) {
      return { state: createAutopauseState(), event: 'auto_paused' };
    }
    return { state: { belowThresholdSinceMs: since, aboveThresholdSinceMs: null }, event: null };
  }
  if (status === 'auto_paused') {
    if (speedMps < config.resumeSpeedMps) return { state: createAutopauseState(), event: null };
    const since = state.aboveThresholdSinceMs ?? nowMs;
    if (nowMs - since >= confirmationMs) {
      return { state: createAutopauseState(), event: 'auto_resumed' };
    }
    return { state: { belowThresholdSinceMs: null, aboveThresholdSinceMs: since }, event: null };
  }
  return { state: createAutopauseState(), event: null };
}

export function initialCueSchedule(unit: 'metric' | 'imperial'): CueSchedule {
  return { nextDistanceMeters: unit === 'metric' ? 1000 : METERS_PER_MILE, nextTimeSeconds: 600 };
}

export function crossedCues(
  schedule: CueSchedule,
  distanceMeters: number,
  movingSeconds: number,
  unit: 'metric' | 'imperial',
): { schedule: CueSchedule; distance: boolean; time: boolean } {
  const distanceStep = unit === 'metric' ? 1000 : METERS_PER_MILE;
  const distance = distanceMeters >= schedule.nextDistanceMeters;
  const time = movingSeconds >= schedule.nextTimeSeconds;
  return {
    distance,
    time,
    schedule: {
      nextDistanceMeters: distance
        ? schedule.nextDistanceMeters + distanceStep
        : schedule.nextDistanceMeters,
      nextTimeSeconds: time ? schedule.nextTimeSeconds + 600 : schedule.nextTimeSeconds,
    },
  };
}

export function createMovementState(activityType: MovementType): MovementState {
  return {
    status: 'draft',
    activityType,
    elapsedSeconds: 0,
    movingSeconds: 0,
    distanceMeters: 0,
    lastSampleAtMs: null,
    lastAcceptedPoint: null,
    nextSequence: 0,
  };
}

export function transition(state: MovementState, event: MovementEventType): MovementState {
  if (event === 'voice_cue' || event === 'edited') return state;
  const next: Partial<Record<TrackingStatus, TrackingStatus[]>> = {
    draft: ['preparing'],
    preparing: ['recording', 'cancelled'],
    recording: ['manually_paused', 'auto_paused', 'finishing', 'interrupted'],
    manually_paused: ['recording', 'finishing', 'discarded', 'interrupted'],
    auto_paused: ['recording', 'finishing', 'discarded', 'interrupted'],
    finishing: ['completed'],
  };
  const targets: Partial<Record<MovementEventType, TrackingStatus>> = {
    prepare: 'preparing',
    started: 'recording',
    manual_paused: 'manually_paused',
    manual_resumed: 'recording',
    auto_paused: 'auto_paused',
    auto_resumed: 'recording',
    finish_requested: 'finishing',
    completed: 'completed',
    cancelled: 'cancelled',
  };
  const target = targets[event];
  if (!target || !(next[state.status] ?? []).includes(target)) {
    throw new Error(`Invalid movement transition: ${state.status} + ${event}`);
  }
  return { ...state, status: target };
}

export function replayFrameAt(points: ReplayPoint[], recordedAtMs: number): ReplayFrame | null {
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (recordedAtMs <= first.recordedAtMs || first.recordedAtMs === last.recordedAtMs) {
    return { ...first, progress: 0 };
  }
  if (recordedAtMs >= last.recordedAtMs) return { ...last, progress: 1 };

  let upperIndex = 1;
  while (upperIndex < points.length && points[upperIndex].recordedAtMs < recordedAtMs) {
    upperIndex += 1;
  }
  const lower = points[upperIndex - 1];
  const upper = points[upperIndex];
  const segmentProgress =
    (recordedAtMs - lower.recordedAtMs) / (upper.recordedAtMs - lower.recordedAtMs);
  return {
    latitude: lower.latitude + (upper.latitude - lower.latitude) * segmentProgress,
    longitude: lower.longitude + (upper.longitude - lower.longitude) * segmentProgress,
    recordedAtMs,
    cumulativeDistanceMeters:
      lower.cumulativeDistanceMeters +
      (upper.cumulativeDistanceMeters - lower.cumulativeDistanceMeters) * segmentProgress,
    progress: (recordedAtMs - first.recordedAtMs) / (last.recordedAtMs - first.recordedAtMs),
  };
}

export function processSample(
  state: MovementState,
  sample: LocationSample,
  accuracyLimit = DEFAULT_ACCURACY_LIMIT_METERS,
): { state: MovementState; point: AcceptedPoint } {
  const sequence = state.nextSequence;
  const base: AcceptedPoint = {
    ...sample,
    sequence,
    distanceFromPreviousMeters: 0,
    cumulativeDistanceMeters: state.distanceMeters,
    accepted: false,
    rejectionReason: null,
  };
  const reject = (reason: string) => ({
    state: { ...state, nextSequence: sequence + 1 },
    point: { ...base, rejectionReason: reason },
  });
  if (!Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) {
    return reject('invalid_coordinates');
  }
  if (state.lastSampleAtMs !== null && sample.recordedAtMs <= state.lastSampleAtMs) {
    return reject('out_of_order');
  }
  const distance = state.lastAcceptedPoint ? haversineMeters(state.lastAcceptedPoint, sample) : 0;
  const accepted =
    (sample.accuracyMeters == null || sample.accuracyMeters <= accuracyLimit) && distance < 1000;
  const nextDistance =
    accepted && state.status === 'recording' ? state.distanceMeters + distance : state.distanceMeters;
  const elapsed =
    state.lastSampleAtMs === null
      ? 0
      : Math.max(0, Math.floor((sample.recordedAtMs - state.lastSampleAtMs) / 1000));
  const moving = accepted && state.status === 'recording' ? elapsed : 0;
  return {
    state: {
      ...state,
      lastSampleAtMs: sample.recordedAtMs,
      lastAcceptedPoint: accepted ? sample : state.lastAcceptedPoint,
      distanceMeters: nextDistance,
      elapsedSeconds: state.elapsedSeconds + elapsed,
      movingSeconds: state.movingSeconds + moving,
      nextSequence: sequence + 1,
    },
    point: {
      ...base,
      sequence,
      distanceFromPreviousMeters: distance,
      cumulativeDistanceMeters: nextDistance,
      accepted,
      rejectionReason: accepted ? null : 'accuracy_or_jump',
    },
  };
}
