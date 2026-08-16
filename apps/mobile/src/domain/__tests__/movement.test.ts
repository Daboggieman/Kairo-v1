import {
  createAutopauseState,
  createMovementState,
  crossedCues,
  evaluateAutopause,
  formatMovementDistance,
  formatMovementSpeed,
  formatPace,
  haversineMeters,
  initialCueSchedule,
  processSample,
  recomputeEditedRoute,
  replayFrameAt,
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
});
