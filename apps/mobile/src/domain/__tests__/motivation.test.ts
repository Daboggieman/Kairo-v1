import { QUOTES, quoteForDate } from '../motivation';

describe('daily motivation', () => {
  it('is stable throughout one local calendar day', () => {
    expect(quoteForDate(new Date(2026, 7, 15, 1))).toEqual(
      quoteForDate(new Date(2026, 7, 15, 23, 59)),
    );
  });

  it('rotates on the next calendar day without leaving the curated set', () => {
    const first = quoteForDate(new Date(2026, 7, 15));
    const next = quoteForDate(new Date(2026, 7, 16));
    expect(next).not.toEqual(first);
    expect(QUOTES).toContainEqual(next);
  });
});
