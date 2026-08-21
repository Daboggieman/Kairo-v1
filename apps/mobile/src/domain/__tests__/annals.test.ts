import { describeVerdict, weekNumber, weekRange } from '../annals';
import { dayNumber } from '../dates';

describe('annals', () => {
  it('builds a seven-day Monday week', () => {
    expect(weekRange(dayNumber('2026-08-21'), 'monday')).toEqual({ start: dayNumber('2026-08-17'), end: dayNumber('2026-08-23'), startKey: '2026-08-17', endKey: '2026-08-23' });
  });
  it('derives the ordinal from the selected week start', () => {
    expect(weekNumber(dayNumber('2026-01-01'), 'sunday')).toBe(1);
  });
  it('generates verdict wording', () => {
    expect(describeVerdict({ kept: 6, due: 7, macroDaysOver: 2 })).toBe('An uneven week. 1 rite slipped, the decree broke on 2 days.');
  });
});
