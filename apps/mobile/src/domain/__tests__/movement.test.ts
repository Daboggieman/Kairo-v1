import { createMovementState, formatPace, haversineMeters, processSample, transition } from '../movement';

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
    expect(() => transition(createMovementState('ride'), 'finished')).toThrow();
  });

  it('formats metric and imperial pace', () => {
    expect(formatPace(300, 'metric')).toBe('5:00');
    expect(formatPace(300, 'imperial')).toBe('8:02');
  });
});
