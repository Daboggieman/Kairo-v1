import { elevationGainMeters, fastestSegmentSeconds, greatestWeightFall, perfectWeeks } from '../pantheon';

describe('pantheon', () => {
  it('filters altitude noise with hysteresis', () => {
    expect(elevationGainMeters([{ altitudeMeters: 100 }, { altitudeMeters: 101 }, { altitudeMeters: 104 }, { altitudeMeters: 103 }, { altitudeMeters: 110 }])).toBe(10);
  });

  it('interpolates a fastest five kilometre segment', () => {
    expect(fastestSegmentSeconds([
      { recordedAtMs: 0, cumulativeDistanceMeters: 0 },
      { recordedAtMs: 300000, cumulativeDistanceMeters: 3000 },
      { recordedAtMs: 480000, cumulativeDistanceMeters: 6000 },
    ])).toBe(400);
  });

  it('returns the greatest smoothed fall in the window', () => {
    expect(greatestWeightFall([
      { id: 'a', userId: 'u', recordedAt: '2026-08-01T12:00:00Z', weight: 80, weightUnit: 'kg', note: null },
      { id: 'b', userId: 'u', recordedAt: '2026-08-02T12:00:00Z', weight: 78, weightUnit: 'kg', note: null },
    ], Date.parse('2026-08-03T12:00:00Z'))).toBe(1);
  });

  it('does not count an empty scheduled week as perfect', () => {
    expect(perfectWeeks([], new Map(), 1, Date.parse('2026-08-21T12:00:00Z'))).toBe(0);
  });
});
