import { parseDecimalInput } from '../numbers';

describe('parseDecimalInput', () => {
  it.each([
    ['1.5', 1.5],
    ['1,5', 1.5],
    ['.5', 0.5],
    [',5', 0.5],
    ['  75,5  ', 75.5],
    ['1\u066B5', 1.5],
    ['-2.25', -2.25],
  ])('parses %s as %s', (input, expected) => {
    expect(parseDecimalInput(input)).toBe(expected);
  });

  it.each(['', ' ', '1,2.3', '1.2,3', '1abc', '1 2', '--1', 'Infinity'])(
    'rejects malformed input %s',
    (input) => {
      expect(parseDecimalInput(input)).toBeNaN();
    },
  );
});
