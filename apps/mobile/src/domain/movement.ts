/** Pure movement tracking primitives. Native location callbacks and SQLite live elsewhere. */

import type { MovementActivity } from '@/db/types';

import { dayNumber, toDayKey, todayNumber } from './dates';

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

/* ------------------------------------------------------------------------- *
 * The Expedition's vocabulary
 *
 * Everything below is wording and arithmetic the movement screens used to do
 * inline. It lives here for the same reason `formatForgeTotals` and the Feast
 * lexicon do: a phrase the user reads is a fact about the product, and a fact
 * about the product belongs somewhere a test can hold it still. The screens
 * import a sentence; they do not compose one.
 * ------------------------------------------------------------------------- */

/**
 * The three movement types, as the app says them out loud.
 *
 * `run` / `walk` / `ride` are the stored values and never change. Dromos is
 * the Greek footrace, March is the walk, Chariot is the ride. The glyph names
 * are MaterialCommunityIcons keys — note `ride` draws as `bike`, which is why
 * this table exists rather than a `name` lookup at each call site: the type and
 * its icon disagree, and getting that wrong shows a bicycle labelled a chariot
 * or nothing at all.
 */
export const MOVEMENT_LABELS: Record<
  MovementType,
  { name: string; gloss: string; icon: 'run' | 'walk' | 'bike' }
> = {
  run: { name: 'Dromos', gloss: 'the run', icon: 'run' },
  walk: { name: 'March', gloss: 'the walk', icon: 'walk' },
  ride: { name: 'Chariot', gloss: 'the ride', icon: 'bike' },
};

/**
 * The headline performance figure: pace for a run or a march, speed for a
 * chariot.
 *
 * A runner reads minutes per kilometre and a cyclist reads kilometres per hour;
 * showing either one the other number is useless rather than merely unfamiliar.
 * The branch was duplicated in the tab root and the tracking screen, which is
 * the usual way two screens end up disagreeing about the same activity.
 */
export function movementPerformance(
  activity: { activityType: MovementType; distanceMeters: number; movingSeconds: number },
  unit: 'metric' | 'imperial',
): { value: string; unit: string; label: string } {
  const distance = Math.max(0, activity.distanceMeters);
  const seconds = Math.max(0, activity.movingSeconds);
  if (activity.activityType === 'ride') {
    // Zero moving time is a real state — a chariot that has been prepared but
    // not yet driven. `formatMovementSpeed` answers '--' for it.
    const speedMps = seconds > 0 ? distance / seconds : 0;
    return {
      value: formatMovementSpeed(speedMps, unit),
      unit: unit === 'metric' ? 'km/h' : 'mph',
      label: 'Speed',
    };
  }
  const secondsPerKm = distance > 0 ? seconds / (distance / 1000) : Number.POSITIVE_INFINITY;
  return {
    value: formatPace(secondsPerKm, unit),
    unit: unit === 'metric' ? '/km' : '/mi',
    label: 'Pace',
  };
}

/**
 * A split shorter than this is not shown at all.
 *
 * Every route ends mid-kilometre, so there is almost always a remainder. A
 * remainder of twelve metres is GPS drift after the finish, and rendering it as
 * a split invites the reader to compare a 12 m pace against nine honest
 * kilometres. 50 m matches `DEFAULT_ACCURACY_LIMIT_METERS`: below one fix's
 * worth of error, the distance is not evidence.
 */
export const MIN_SPLIT_METERS = 50;

export type Split = {
  /** 1-based: the first kilometre or mile is split 1. */
  index: number;
  distanceMeters: number;
  seconds: number;
  /**
   * Seconds per whole unit. Equal to `seconds` for a whole split; extrapolated
   * for a partial one, so the last row can be compared against the rest
   * instead of always looking like the fastest.
   */
  secondsPerUnit: number;
  /** True for a final split shorter than a whole unit. */
  partial: boolean;
};

export type SplitPoint = Pick<ReplayPoint, 'recordedAtMs' | 'cumulativeDistanceMeters'>;

/**
 * Per-kilometre (or per-mile) splits for a finished route.
 *
 * The boundary between two splits is **interpolated** between the pair of
 * points that straddle each unit mark, not snapped to whichever sample happens
 * to be nearest. With a fix every few seconds a runner covers 10–30 m between
 * samples, so snapping shifts each boundary by up to that much — and because
 * the error accumulates in one direction, the reported splits drift steadily
 * away from the times on the watch. Interpolating costs one lerp per mark and
 * keeps the sum of the splits equal to the total.
 *
 * Distances are taken relative to the first point rather than absolutely, so a
 * trimmed route behaves the same as an untrimmed one.
 */
export function splits(points: readonly SplitPoint[], unit: 'metric' | 'imperial'): Split[] {
  const unitMeters = unit === 'metric' ? 1000 : METERS_PER_MILE;
  if (points.length < 2) return [];
  const first = points[0];
  const last = points[points.length - 1];
  const total = last.cumulativeDistanceMeters - first.cumulativeDistanceMeters;
  if (!Number.isFinite(total) || total <= 0) return [];

  const result: Split[] = [];
  let boundaryMs = first.recordedAtMs;
  let mark = unitMeters;
  let cursor = 1;

  // A hair of tolerance so a route measured at exactly 5000.0000001 m does not
  // lose its fifth kilometre to float representation.
  while (mark <= total + 1e-9) {
    while (
      cursor < points.length - 1 &&
      points[cursor].cumulativeDistanceMeters - first.cumulativeDistanceMeters < mark
    ) {
      cursor += 1;
    }
    const lower = points[cursor - 1];
    const upper = points[cursor];
    const lowerDistance = lower.cumulativeDistanceMeters - first.cumulativeDistanceMeters;
    const upperDistance = upper.cumulativeDistanceMeters - first.cumulativeDistanceMeters;
    const span = upperDistance - lowerDistance;
    // span <= 0 means two samples at the same distance — a stationary pair.
    // Take the earlier timestamp rather than dividing by zero.
    const fraction = span > 0 ? Math.min(1, Math.max(0, (mark - lowerDistance) / span)) : 0;
    const crossedMs = lower.recordedAtMs + (upper.recordedAtMs - lower.recordedAtMs) * fraction;
    const seconds = Math.max(0, (crossedMs - boundaryMs) / 1000);
    result.push({
      index: result.length + 1,
      distanceMeters: unitMeters,
      seconds,
      secondsPerUnit: seconds,
      partial: false,
    });
    boundaryMs = crossedMs;
    mark += unitMeters;
  }

  const tail = total - (mark - unitMeters);
  if (tail >= MIN_SPLIT_METERS) {
    const seconds = Math.max(0, (last.recordedAtMs - boundaryMs) / 1000);
    result.push({
      index: result.length + 1,
      distanceMeters: tail,
      seconds,
      secondsPerUnit: (seconds * unitMeters) / tail,
      partial: true,
    });
  }
  return result;
}

/**
 * One line of the Chronicle's timeline, or `null` for an event that is
 * machinery rather than narrative.
 *
 * `prepare`, `voice_cue` and `finish_requested` are bookkeeping — a timeline
 * that lists every audio cue buries the two pauses that actually explain the
 * time. Returning `null` rather than omitting them upstream keeps the decision
 * in one place, and keeps the caller's filter honest: it drops what the
 * describer will not describe.
 *
 * Takes a `string`, not `MovementEventType`, on purpose. The column is typed
 * `string` end to end and real rows contain **both** `completed` (the union's
 * spelling) and `finished` (what `active.tsx` has always written). Narrowing
 * the parameter would not delete the rows; it would only stop this function
 * from reading them.
 */
export function describeMovementEvent(eventType: string): string | null {
  switch (eventType) {
    case 'started':
      return 'Set out';
    case 'manual_paused':
      return 'Halted';
    case 'manual_resumed':
      return 'Resumed';
    case 'auto_paused':
      return 'Halted, no movement';
    case 'auto_resumed':
      return 'Resumed, moving again';
    case 'completed':
    case 'finished':
      return 'Journey closed';
    case 'cancelled':
      return 'Abandoned';
    case 'edited':
      return 'Chronicle amended';
    default:
      return null;
  }
}

/** Days in the Expedition's week strip. */
const WEEK_DAYS = 7;

export type MovementWeekActivity = Pick<
  MovementActivity,
  'startedAt' | 'distanceMeters' | 'movingSeconds'
>;

export type MovementWeek = {
  count: number;
  distanceMeters: number;
  movingSeconds: number;
  /** Oldest first, exactly seven entries, gaps included as zero. */
  days: { day: number; distanceMeters: number }[];
};

/**
 * The last seven days ending today — deliberately **not** the calendar week.
 *
 * A calendar week has to pick a first day, and that answer is locale-dependent
 * (Sunday in the US, Monday across most of Europe). Picking one hard-codes a
 * region; reading the locale makes the strip change width and meaning as the
 * week turns. A rolling seven days sidesteps the question and answers the one
 * the user is actually asking, which is *"have I moved lately"*.
 *
 * Days with nothing in them are returned as zero rather than skipped, so the
 * strip keeps its shape and a gap reads as a gap.
 */
export function movementWeek(
  activities: readonly MovementWeekActivity[],
  nowMs: number,
): MovementWeek {
  const today = todayNumber(nowMs);
  const firstDay = today - (WEEK_DAYS - 1);
  const days = Array.from({ length: WEEK_DAYS }, (_, offset) => ({
    day: firstDay + offset,
    distanceMeters: 0,
  }));
  let count = 0;
  let distanceMeters = 0;
  let movingSeconds = 0;
  for (const activity of activities) {
    const day = dayNumber(toDayKey(activity.startedAt));
    if (day < firstDay || day > today) continue;
    count += 1;
    distanceMeters += activity.distanceMeters;
    movingSeconds += activity.movingSeconds;
    days[day - firstDay].distanceMeters += activity.distanceMeters;
  }
  return { count, distanceMeters, movingSeconds, days };
}

/**
 * The Expedition's subtitle — *"42 journeys · 318 km"*.
 *
 * "Journeys" is the generic count because Dromos/March/Chariot are the three
 * *types*: a mixed history has no single one of those names, and "March" is
 * already taken twice over.
 *
 * The distance is rounded to whole units rather than passed through
 * `formatMovementDistance`, which is right for one activity and wrong for a
 * lifetime: two decimals on a single 5 km run is precision, two decimals on a
 * 318 km total is noise. `formatTonnage` in the workouts domain draws the same
 * line against `formatWeight` for the same reason.
 */
export function formatExpeditionTotals(
  count: number,
  distanceMeters: number,
  unit: 'metric' | 'imperial',
): string {
  if (count <= 0) return 'No ground covered yet';
  const divisor = unit === 'metric' ? 1000 : METERS_PER_MILE;
  const label = unit === 'metric' ? 'km' : 'mi';
  const safe = Number.isFinite(distanceMeters) ? Math.max(0, distanceMeters) : 0;
  const distance = Math.round(safe / divisor).toLocaleString();
  return `${count} journey${count === 1 ? '' : 's'} · ${distance} ${label}`;
}

/**
 * Time on the route but not moving — HELD, in the Chronicle.
 *
 * Derived from `elapsed - moving` rather than read from the stored
 * `pausedSeconds`, which is only ever written by `trimMovementActivity`: on
 * every activity that was never edited it is 0, and a HELD of 0 beside an
 * elapsed time twenty minutes longer than the moving time is a visible lie.
 * The subtraction is true by construction for both.
 */
export function heldSeconds(
  activity: Pick<MovementActivity, 'elapsedSeconds' | 'movingSeconds'>,
): number {
  return Math.max(0, activity.elapsedSeconds - activity.movingSeconds);
}
