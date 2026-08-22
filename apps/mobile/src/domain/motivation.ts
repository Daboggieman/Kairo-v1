/**
 * The daily quote — one line, chosen by the date rather than at random.
 *
 * The Oracle claims the quote "speaks once a day", and this is what makes that true: the same date
 * always yields the same line, so the screen can be opened five times in an evening without the
 * inscription changing under the reader. Random selection was the obvious alternative and is the
 * wrong one — a quotation that changes each time you look at it is decoration, not a day's word.
 */

export type DailyQuote = { text: string; author: string };

export const QUOTES: DailyQuote[] = [
  { text: 'Know thyself.', author: 'Delphic maxim' },
  { text: 'Nothing in excess.', author: 'Delphic maxim' },
  { text: 'Character is destiny.', author: 'Heraclitus' },
  { text: 'First say to yourself what you would be; then do what you have to do.', author: 'Epictetus' },
  { text: 'No man is free who is not master of himself.', author: 'Epictetus' },
  { text: 'Waste no more time arguing what a good person should be. Be one.', author: 'Marcus Aurelius' },
  { text: 'The unexamined life is not worth living.', author: 'Socrates (Plato, Apology)' },
];

/**
 * The quote for a calendar day.
 *
 * `Date.UTC` is fed the date's **local** year, month and day, which is deliberate: it turns a local
 * calendar date into a day count without a timezone in it, so the line changes at local midnight and
 * an hour's DST shift cannot move it. Using the timestamp directly would roll the quote over at UTC
 * midnight — mid-evening for a reader in the Americas.
 *
 * The double modulo is for dates before 1970, where the day count is negative and `%` in JavaScript
 * keeps the sign; `-1 % 7` is `-1`, which would index off the front of the array.
 */
export function quoteForDate(value: Date): DailyQuote {
  const day = Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000);
  return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length];
}
