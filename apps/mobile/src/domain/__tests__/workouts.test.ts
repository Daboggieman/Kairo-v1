import type { WorkoutSetWithExercise } from '@/db/types';
import {
  bestOneRepMax,
  estimateOneRepMax,
  formatAnvilSummary,
  formatDuration,
  formatForgeTotals,
  formatRest,
  formatTonnage,
  groupByExercise,
  nextSetNumber,
  restElapsed,
  sessionDurationSeconds,
  sessionVolume,
  setVolume,
  suggestNextSet,
  toKg,
  totalTonnage,
} from '@/domain/workouts';

describe('setVolume / sessionVolume', () => {
  it('multiplies reps by weight', () => {
    expect(setVolume({ reps: 5, weight: 100, weightUnit: 'kg' })).toBe(500);
  });

  it('sums a session', () => {
    const sets = [
      { reps: 5, weight: 100, weightUnit: 'kg' as const },
      { reps: 5, weight: 105, weightUnit: 'kg' as const },
      { reps: 3, weight: 110, weightUnit: 'kg' as const },
    ];
    expect(sessionVolume(sets)).toBe(500 + 525 + 330);
  });

  it('is zero for an empty session', () => {
    expect(sessionVolume([])).toBe(0);
  });

  it('normalises pounds to kg so mixed units still total correctly', () => {
    // 220.462lb is 100kg, so this must match the kg-logged equivalent.
    const inLb = sessionVolume([{ reps: 5, weight: 220.462262, weightUnit: 'lb' }]);
    const inKg = sessionVolume([{ reps: 5, weight: 100, weightUnit: 'kg' }]);
    expect(inLb).toBeCloseTo(inKg, 5);
  });
});

describe('toKg', () => {
  it('leaves kilograms alone', () => {
    expect(toKg(100, 'kg')).toBe(100);
  });

  it('converts pounds', () => {
    expect(toKg(220.462262, 'lb')).toBeCloseTo(100, 5);
  });
});

describe('estimateOneRepMax', () => {
  it('returns the weight itself for a single', () => {
    expect(estimateOneRepMax(140, 1)).toBe(140);
  });

  it('applies the Epley formula above one rep', () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 3);
  });

  it('returns zero for a set with no reps', () => {
    expect(estimateOneRepMax(100, 0)).toBe(0);
  });

  it('picks the best estimate across sets', () => {
    const best = bestOneRepMax([
      { reps: 10, weight: 80, weightUnit: 'kg' }, // ~106.7
      { reps: 3, weight: 110, weightUnit: 'kg' }, // ~121.0
      { reps: 5, weight: 100, weightUnit: 'kg' }, // ~116.7
    ]);
    expect(best).toBeCloseTo(121, 3);
  });
});

describe('suggestNextSet', () => {
  it('repeats the last set rather than auto-progressing the weight', () => {
    const suggestion = suggestNextSet({ reps: 5, weight: 102.5, weightUnit: 'kg' });
    expect(suggestion).toEqual({ reps: 5, weight: 102.5, weightUnit: 'kg' });
  });

  it('preserves the unit the last set was logged in', () => {
    expect(suggestNextSet({ reps: 8, weight: 45, weightUnit: 'lb' }).weightUnit).toBe('lb');
  });

  it('falls back to a sane default for a never-performed exercise', () => {
    expect(suggestNextSet(null)).toEqual({ reps: 8, weight: 0, weightUnit: 'kg' });
  });

  it('honours the preferred unit in the fallback', () => {
    expect(suggestNextSet(null, 'lb').weightUnit).toBe('lb');
  });
});

describe('restElapsed', () => {
  const start = 1_000_000;

  it('counts whole seconds since the timer started', () => {
    expect(restElapsed(start, start + 90_000)).toBe(90);
  });

  it('truncates partial seconds', () => {
    expect(restElapsed(start, start + 1_999)).toBe(1);
  });

  it('is zero at the moment it starts', () => {
    expect(restElapsed(start, start)).toBe(0);
  });

  it('clamps to zero if the clock moves backwards', () => {
    expect(restElapsed(start, start - 5_000)).toBe(0);
  });
});

describe('formatRest', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [60, '1:00'],
    [125, '2:05'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatRest(seconds)).toBe(expected);
  });
});

describe('sessionDurationSeconds / formatDuration', () => {
  it('returns null while a session is running', () => {
    expect(sessionDurationSeconds('2026-08-10T10:00:00Z', null)).toBeNull();
    expect(formatDuration(null)).toBe('In progress');
  });

  it('measures a completed session', () => {
    expect(sessionDurationSeconds('2026-08-10T10:00:00Z', '2026-08-10T11:05:30Z')).toBe(3930);
  });

  it('formats sub-hour and over-hour durations differently', () => {
    expect(formatDuration(2730)).toBe('45m 30s');
    expect(formatDuration(3930)).toBe('1h 05m');
  });
});

describe('nextSetNumber', () => {
  const sets = [
    { exerciseId: 'squat' },
    { exerciseId: 'bench' },
    { exerciseId: 'squat' },
  ];

  it('counts only sets of the same exercise', () => {
    expect(nextSetNumber(sets, 'squat')).toBe(3);
    expect(nextSetNumber(sets, 'bench')).toBe(2);
  });

  it('starts at 1 for an exercise not yet logged', () => {
    expect(nextSetNumber(sets, 'deadlift')).toBe(1);
  });
});

describe('groupByExercise', () => {
  const set = (id: string, name: string, setNumber: number): WorkoutSetWithExercise => ({
    id: `${id}-${setNumber}`,
    sessionId: 'session-1',
    exerciseId: id,
    exerciseName: name,
    setNumber,
    reps: 5,
    weight: 100,
    weightUnit: 'kg',
    rpe: null,
    restSeconds: null,
  });

  it('groups sets and preserves first-logged order even when interleaved', () => {
    const groups = groupByExercise([
      set('squat', 'Back Squat', 1),
      set('bench', 'Bench Press', 1),
      set('squat', 'Back Squat', 2),
    ]);

    expect(groups.map((g) => g.exerciseId)).toEqual(['squat', 'bench']);
    expect(groups[0].sets).toHaveLength(2);
    expect(groups[1].sets).toHaveLength(1);
  });

  it('returns nothing for an empty session', () => {
    expect(groupByExercise([])).toEqual([]);
  });
});

describe('formatTonnage / totalTonnage', () => {
  /**
   * The grouping separator comes from the host locale, which the test run does not pin — only the
   * timezone is fixed, in `jest.globalSetup.js`. Comparing against `toLocaleString()` tests what
   * this function actually decides (rounding, grouping at all, the unit suffix) without asserting
   * that the machine running the suite is `en-US`.
   */
  const grouped = (n: number) => n.toLocaleString();

  it('rounds to the kilogram and groups', () => {
    expect(formatTonnage(5240.4)).toBe(`${grouped(5240)} kg`);
    expect(formatTonnage(84119.6)).toBe(`${grouped(84120)} kg`);
  });

  it('reports an empty session as zero rather than blank', () => {
    expect(formatTonnage(0)).toBe('0 kg');
  });

  it('totals the volume the history query already computed per session', () => {
    expect(totalTonnage([{ totalVolume: 5240 }, { totalVolume: 3000 }, { totalVolume: 0 }])).toBe(
      8240,
    );
    expect(totalTonnage([])).toBe(0);
  });
});

describe('formatForgeTotals', () => {
  it('reads as one line of aggregate', () => {
    expect(formatForgeTotals(16, 84120)).toBe(`16 sessions · ${(84120).toLocaleString()} kg lifted`);
  });

  it('does not say "1 sessions"', () => {
    expect(formatForgeTotals(1, 500)).toBe('1 session · 500 kg lifted');
  });

  it('says nothing has been forged rather than "0 sessions · 0 kg lifted"', () => {
    expect(formatForgeTotals(0, 0)).toBe('Nothing forged yet');
  });
});

describe('formatAnvilSummary', () => {
  it('counts lifts and strikes', () => {
    expect(formatAnvilSummary(3, 11)).toBe('3 lifts · 11 strikes');
  });

  it('singularises both halves independently', () => {
    expect(formatAnvilSummary(1, 1)).toBe('1 lift · 1 strike');
    expect(formatAnvilSummary(1, 5)).toBe('1 lift · 5 strikes');
  });

  /** A session opened but not yet logged into — reachable, and "0 lifts · 0 strikes" is noise. */
  it('says nothing has been struck when the session is empty', () => {
    expect(formatAnvilSummary(0, 0)).toBe('Nothing struck yet');
  });
});
