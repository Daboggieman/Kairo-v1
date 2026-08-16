/** Pure movement tracking primitives. Native location callbacks and SQLite live elsewhere. */

export type MovementType = 'run' | 'walk' | 'ride';
export type TrackingStatus = 'draft' | 'preparing' | 'recording' | 'manually_paused' | 'auto_paused' | 'finishing' | 'completed' | 'cancelled' | 'discarded' | 'interrupted';
export type MovementEventType = 'prepare' | 'started' | 'manual_paused' | 'manual_resumed' | 'auto_paused' | 'auto_resumed' | 'voice_cue' | 'finish_requested' | 'completed' | 'cancelled' | 'edited';

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

export const METERS_PER_MILE = 1609.344;
export const DEFAULT_ACCURACY_LIMIT_METERS = 50;

const thresholds: Record<MovementType, { pauseSpeedMps: number; resumeSpeedMps: number; confirmationSeconds: number }> = {
  run: { pauseSpeedMps: 0.8, resumeSpeedMps: 1.2, confirmationSeconds: 10 },
  walk: { pauseSpeedMps: 0.35, resumeSpeedMps: 0.65, confirmationSeconds: 12 },
  ride: { pauseSpeedMps: 1, resumeSpeedMps: 1.8, confirmationSeconds: 10 },
};

export function haversineMeters(a: Pick<LocationSample, 'latitude' | 'longitude'>, b: Pick<LocationSample, 'latitude' | 'longitude'>): number {
  const radius = 6_371_000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function formatPace(secondsPerKm: number, unit: 'metric' | 'imperial'): string {
  const secondsPerUnit = unit === 'metric' ? secondsPerKm : secondsPerKm * (METERS_PER_MILE / 1000);
  if (!Number.isFinite(secondsPerUnit) || secondsPerUnit <= 0) return '--:--';
  const whole = Math.floor(secondsPerUnit);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function movementThresholds(activityType: MovementType) {
  return thresholds[activityType];
}

export function createMovementState(activityType: MovementType): MovementState {
  return { status: 'draft', activityType, elapsedSeconds: 0, movingSeconds: 0, distanceMeters: 0, lastSampleAtMs: null, lastAcceptedPoint: null, nextSequence: 0 };
}

export function transition(state: MovementState, event: MovementEventType): MovementState {
  const next: Partial<Record<TrackingStatus, TrackingStatus[]>> = {
    draft: ['preparing'], preparing: ['recording', 'cancelled'], recording: ['manually_paused', 'auto_paused', 'finishing', 'interrupted'],
    manually_paused: ['recording', 'finishing', 'discarded', 'interrupted'], auto_paused: ['recording', 'finishing', 'discarded', 'interrupted'], finishing: ['completed'],
  };
  const target: TrackingStatus | undefined = event === 'prepare' ? 'preparing' : event === 'started' ? 'recording' : event === 'manual_paused' ? 'manually_paused' : event === 'manual_resumed' || event === 'auto_resumed' ? 'recording' : event === 'auto_paused' ? 'auto_paused' : event === 'finish_requested' ? 'finishing' : event === 'completed' ? 'completed' : event === 'cancelled' ? 'cancelled' : event === 'edited' ? state.status : undefined;
  if (!target || !(next[state.status] ?? []).includes(target)) throw new Error(`Invalid movement transition: ${state.status} + ${event}`);
  return { ...state, status: target };
}

export function processSample(state: MovementState, sample: LocationSample, accuracyLimit = DEFAULT_ACCURACY_LIMIT_METERS): { state: MovementState; point: AcceptedPoint } {
  const sequence = state.nextSequence;
  const base: AcceptedPoint = { ...sample, sequence, distanceFromPreviousMeters: 0, cumulativeDistanceMeters: state.distanceMeters, accepted: false, rejectionReason: null };
  if (!Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) return { state, point: { ...base, rejectionReason: 'invalid_coordinates' } };
  if (state.lastSampleAtMs !== null && sample.recordedAtMs <= state.lastSampleAtMs) return { state, point: { ...base, rejectionReason: 'out_of_order' } };
  const distance = state.lastAcceptedPoint ? haversineMeters(state.lastAcceptedPoint, sample) : 0;
  const accepted = (sample.accuracyMeters == null || sample.accuracyMeters <= accuracyLimit) && distance < 1000;
  const nextDistance = accepted && state.status === 'recording' ? state.distanceMeters + distance : state.distanceMeters;
  const elapsed = state.lastSampleAtMs === null ? 0 : Math.max(0, Math.floor((sample.recordedAtMs - state.lastSampleAtMs) / 1000));
  const moving = accepted && state.status === 'recording' ? elapsed : 0;
  return {
    state: { ...state, lastSampleAtMs: sample.recordedAtMs, lastAcceptedPoint: accepted ? sample : state.lastAcceptedPoint, distanceMeters: nextDistance, elapsedSeconds: state.elapsedSeconds + elapsed, movingSeconds: state.movingSeconds + moving, nextSequence: sequence + 1 },
    point: { ...base, sequence, distanceFromPreviousMeters: distance, cumulativeDistanceMeters: nextDistance, accepted, rejectionReason: accepted ? null : 'accuracy_or_jump' },
  };
}
