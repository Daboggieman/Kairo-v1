import { dayNumber } from '../dates';
import {
  createAutopauseState,
  createMovementState,
  crossedCues,
  describeMovementEvent,
  evaluateAutopause,
  formatExpeditionTotals,
  formatMovementDistance,
  formatMovementSpeed,
  formatPace,
  haversineMeters,
  heldSeconds,
  initialCueSchedule,
  MIN_SPLIT_METERS,
  MOVEMENT_LABELS,
  movementPerformance,
  movementWeek,
  processSample,
  recomputeEditedRoute,
  replayFrameAt,
  splits,
  transition,
} from '../movement';

describe('movement domain', () => {
  it('calculates a geographic distance', () => {
    expect(haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.01 })).toBeCloseTo(1111.9, 0);
  });

  it('tracks accepted points and moving time', () => {
    let state = transition(transition(createMovementState('run'), 'prepare'), 'started');
    const first = processSample(state, { latitude: 0, longitude: 0, recordedAtMs: 1_000 });
    state = first.state;
    const second = processSample(state, { latitude: 0, longitude: 0.001, recordedAtMs: 6_000 });
    expect(second.point.accepted).toBe(true);
    expect(second.state.distanceMeters).toBeGreaterThan(100);
    expect(second.state.movingSeconds).toBe(5);
  });

  it('rejects out-of-order and inaccurate samples without changing distance', () => {
    const state = processSample(createMovementState('walk'), { latitude: 0, longitude: 0, recordedAtMs: 2_000, accuracyMeters: 100 }).state;
    const result = processSample(state, { latitude: 0, longitude: 0.1, recordedAtMs: 1_000 });
    expect(result.point.rejectionReason).toBe('out_of_order');
    expect(result.state.distanceMeters).toBe(0);
  });

  it('rejects invalid transitions', () => {
    expect(() => transition(createMovementState('ride'), 'completed')).toThrow();
  });

  it('formats metric and imperial pace', () => {
    expect(formatPace(300, 'metric')).toBe('5:00');
    expect(formatPace(300, 'imperial')).toBe('8:02');
  });

  it('formats movement distance and speed in the shared unit system', () => {
    expect(formatMovementDistance(1609.344, 'metric')).toEqual({ value: '1.61', label: 'km' });
    expect(formatMovementDistance(1609.344, 'imperial')).toEqual({ value: '1.00', label: 'mi' });
    expect(formatMovementSpeed(5, 'metric')).toBe('18.0');
    expect(formatMovementSpeed(5, 'imperial')).toBe('11.2');
  });

  it('requires sustained low speed before autopause', () => {
    let autopause = createAutopauseState();
    let result = evaluateAutopause('recording', 'run', 0.2, 1_000, autopause);
    autopause = result.state;
    expect(result.event).toBeNull();
    result = evaluateAutopause('recording', 'run', 0.2, 11_000, autopause);
    expect(result.event).toBe('auto_paused');
  });

  it('never auto-resumes a manual pause', () => {
    const result = evaluateAutopause('manually_paused', 'ride', 10, 20_000, {
      belowThresholdSinceMs: null,
      aboveThresholdSinceMs: 1_000,
    });
    expect(result.event).toBeNull();
  });

  it('advances time and distance cue thresholds without repeating a cue', () => {
    const first = crossedCues(initialCueSchedule('metric'), 1_050, 601, 'metric');
    expect(first.distance).toBe(true);
    expect(first.time).toBe(true);
    const second = crossedCues(first.schedule, 1_050, 601, 'metric');
    expect(second.distance).toBe(false);
    expect(second.time).toBe(false);
  });

  it('keeps voice cues as timeline events without changing tracking state', () => {
    const recording = transition(transition(createMovementState('run'), 'prepare'), 'started');
    expect(transition(recording, 'voice_cue')).toBe(recording);
  });

  it('interpolates route replay from stored timestamps and distance', () => {
    const frame = replayFrameAt([
      { latitude: 10, longitude: 20, recordedAtMs: 1_000, cumulativeDistanceMeters: 0 },
      { latitude: 12, longitude: 24, recordedAtMs: 3_000, cumulativeDistanceMeters: 200 },
    ], 2_000);
    expect(frame).toMatchObject({
      latitude: 11,
      longitude: 22,
      cumulativeDistanceMeters: 100,
      progress: 0.5,
    });
  });

  it('recomputes derived route metrics without changing retained raw points', () => {
    const points = [
      { sequence: 0, latitude: 0, longitude: 0, recordedAtMs: 0, accepted: true, isPaused: false },
      { sequence: 1, latitude: 0, longitude: 0.001, recordedAtMs: 10_000, accepted: true, isPaused: false },
      { sequence: 2, latitude: 0, longitude: 0.002, recordedAtMs: 20_000, accepted: true, isPaused: true },
    ];
    const result = recomputeEditedRoute(points, new Set([1]));
    expect(result.includedSequences).toEqual([0, 2]);
    expect(result.distanceMeters).toBeCloseTo(222.4, 0);
    expect(result.elapsedSeconds).toBe(20);
    expect(result.movingSeconds).toBe(20);
    expect(result.distanceBySequence.get(2)?.cumulativeDistanceMeters).toBeCloseTo(222.4, 0);
  });

  it('clamps replay before and after the recorded route', () => {
    const points = [
      { latitude: 10, longitude: 20, recordedAtMs: 1_000, cumulativeDistanceMeters: 0 },
      { latitude: 12, longitude: 24, recordedAtMs: 3_000, cumulativeDistanceMeters: 200 },
    ];
    expect(replayFrameAt(points, 0)?.progress).toBe(0);
    expect(replayFrameAt(points, 4_000)?.progress).toBe(1);
  });

  it('labels a ride as a Chariot but draws it as a bike', () => {
    expect(MOVEMENT_LABELS.run.name).toBe('Dromos');
    expect(MOVEMENT_LABELS.walk.name).toBe('March');
    // The trap: the stored type is `ride`, the glyph is `bike`, and only this
    // table knows both.
    expect(MOVEMENT_LABELS.ride).toEqual({ name: 'Chariot', gloss: 'the ride', icon: 'bike' });
  });

  it('reports pace for a run and speed for a ride', () => {
    expect(movementPerformance({ activityType: 'run', distanceMeters: 5_000, movingSeconds: 1_500 }, 'metric')).toEqual(
      { value: '5:00', unit: '/km', label: 'Pace' },
    );
    expect(movementPerformance({ activityType: 'walk', distanceMeters: 5_000, movingSeconds: 1_500 }, 'imperial')).toEqual(
      { value: '8:02', unit: '/mi', label: 'Pace' },
    );
    expect(movementPerformance({ activityType: 'ride', distanceMeters: 20_000, movingSeconds: 3_600 }, 'metric')).toEqual(
      { value: '20.0', unit: 'km/h', label: 'Speed' },
    );
  });

  it('reports a blank performance figure rather than dividing by zero', () => {
    expect(movementPerformance({ activityType: 'run', distanceMeters: 0, movingSeconds: 120 }, 'metric').value).toBe('--:--');
    expect(movementPerformance({ activityType: 'ride', distanceMeters: 500, movingSeconds: 0 }, 'metric').value).toBe('--');
  });

  it('interpolates split boundaries between the points that straddle each mark', () => {
    // Two samples 2 km apart at an even 5:00/km. Snapping the 1 km mark to the
    // nearest sample would report 10:00 and 0:00; interpolating reports 5:00
    // twice, and the splits still sum to the total.
    const result = splits(
      [
        { recordedAtMs: 0, cumulativeDistanceMeters: 0 },
        { recordedAtMs: 600_000, cumulativeDistanceMeters: 2_000 },
      ],
      'metric',
    );
    expect(result).toHaveLength(2);
    expect(result.map((split) => split.seconds)).toEqual([300, 300]);
    expect(result.every((split) => !split.partial)).toBe(true);
    expect(result.map((split) => split.index)).toEqual([1, 2]);
  });

  it('extrapolates a partial final split so it compares with the whole ones', () => {
    const result = splits(
      [
        { recordedAtMs: 0, cumulativeDistanceMeters: 0 },
        { recordedAtMs: 450_000, cumulativeDistanceMeters: 1_500 },
      ],
      'metric',
    );
    expect(result).toHaveLength(2);
    const tail = result[1];
    expect(tail.partial).toBe(true);
    expect(tail.distanceMeters).toBeCloseTo(500, 6);
    expect(tail.seconds).toBeCloseTo(150, 6);
    // 150 s over 500 m is the same effort as the whole split's 300 s over 1 km.
    expect(tail.secondsPerUnit).toBeCloseTo(result[0].secondsPerUnit, 6);
  });

  it('drops a final split shorter than the accuracy floor', () => {
    const under = splits(
      [
        { recordedAtMs: 0, cumulativeDistanceMeters: 0 },
        { recordedAtMs: 300_000, cumulativeDistanceMeters: 1_000 + MIN_SPLIT_METERS - 1 },
      ],
      'metric',
    );
    expect(under).toHaveLength(1);
    const over = splits(
      [
        { recordedAtMs: 0, cumulativeDistanceMeters: 0 },
        { recordedAtMs: 300_000, cumulativeDistanceMeters: 1_000 + MIN_SPLIT_METERS },
      ],
      'metric',
    );
    expect(over).toHaveLength(2);
    expect(over[1].partial).toBe(true);
  });

  it('splits by the mile in imperial and returns nothing for a routeless activity', () => {
    const mile = splits(
      [
        { recordedAtMs: 0, cumulativeDistanceMeters: 0 },
        { recordedAtMs: 480_000, cumulativeDistanceMeters: 1609.344 },
      ],
      'imperial',
    );
    expect(mile).toHaveLength(1);
    expect(mile[0].distanceMeters).toBeCloseTo(1609.344, 6);
    expect(mile[0].seconds).toBeCloseTo(480, 6);
    expect(splits([], 'metric')).toEqual([]);
    expect(splits([{ recordedAtMs: 0, cumulativeDistanceMeters: 0 }], 'metric')).toEqual([]);
    expect(
      splits(
        [
          { recordedAtMs: 0, cumulativeDistanceMeters: 0 },
          { recordedAtMs: 60_000, cumulativeDistanceMeters: 0 },
        ],
        'metric',
      ),
    ).toEqual([]);
  });

  it('measures splits from the first point, so a trimmed route reads the same', () => {
    const trimmed = splits(
      [
        { recordedAtMs: 0, cumulativeDistanceMeters: 4_000 },
        { recordedAtMs: 600_000, cumulativeDistanceMeters: 6_000 },
      ],
      'metric',
    );
    expect(trimmed.map((split) => split.seconds)).toEqual([300, 300]);
  });

  it('describes the events worth reading and nothing else', () => {
    expect(describeMovementEvent('started')).toBe('Set out');
    expect(describeMovementEvent('manual_paused')).toBe('Halted');
    expect(describeMovementEvent('auto_paused')).toBe('Halted, no movement');
    expect(describeMovementEvent('cancelled')).toBe('Abandoned');
    // Both spellings are in real rows: the union says `completed`, `active.tsx`
    // writes `finished`. Neither may fall through to null.
    expect(describeMovementEvent('completed')).toBe('Journey closed');
    expect(describeMovementEvent('finished')).toBe('Journey closed');
    for (const machinery of ['prepare', 'voice_cue', 'finish_requested', 'something_new']) {
      expect(describeMovementEvent(machinery)).toBeNull();
    }
  });

  it('aggregates the last seven days ending today, gaps included', () => {
    const nowMs = Date.UTC(2026, 7, 19, 12, 0, 0);
    const week = movementWeek(
      [
        { startedAt: '2026-08-19T06:00:00.000Z', distanceMeters: 5_000, movingSeconds: 1_500 },
        { startedAt: '2026-08-19T18:00:00.000Z', distanceMeters: 3_000, movingSeconds: 900 },
        { startedAt: '2026-08-13T07:00:00.000Z', distanceMeters: 8_000, movingSeconds: 2_400 },
        // One day older than the window, so it must not be counted at all.
        { startedAt: '2026-08-12T07:00:00.000Z', distanceMeters: 99_000, movingSeconds: 9_900 },
      ],
      nowMs,
    );
    expect(week.count).toBe(3);
    expect(week.distanceMeters).toBe(16_000);
    expect(week.movingSeconds).toBe(4_800);
    expect(week.days).toHaveLength(7);
    expect(week.days[0].day).toBe(dayNumber('2026-08-13'));
    expect(week.days[6].day).toBe(dayNumber('2026-08-19'));
    expect(week.days[0].distanceMeters).toBe(8_000);
    // Two activities on the same day sum into one bar.
    expect(week.days[6].distanceMeters).toBe(8_000);
    expect(week.days.slice(1, 6).map((entry) => entry.distanceMeters)).toEqual([0, 0, 0, 0, 0]);
  });

  it('keeps the seven-day shape for an empty history', () => {
    const week = movementWeek([], Date.UTC(2026, 7, 19, 12, 0, 0));
    expect(week.count).toBe(0);
    expect(week.days.map((entry) => entry.distanceMeters)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('sums the expedition into whole units and counts journeys', () => {
    expect(formatExpeditionTotals(0, 0, 'metric')).toBe('No ground covered yet');
    expect(formatExpeditionTotals(1, 5_000, 'metric')).toBe('1 journey · 5 km');
    // Locale-safe: the grouping separator is the machine's, not ours.
    expect(formatExpeditionTotals(42, 318_000, 'metric')).toBe(
      `42 journeys · ${(318).toLocaleString()} km`,
    );
    expect(formatExpeditionTotals(2, 3218.688, 'imperial')).toBe('2 journeys · 2 mi');
  });

  it('derives held time from elapsed minus moving, never below zero', () => {
    expect(heldSeconds({ elapsedSeconds: 1_000, movingSeconds: 900 })).toBe(100);
    expect(heldSeconds({ elapsedSeconds: 900, movingSeconds: 900 })).toBe(0);
    // A recomputed route can leave moving above elapsed by a rounding second.
    expect(heldSeconds({ elapsedSeconds: 900, movingSeconds: 1_000 })).toBe(0);
  });
});
