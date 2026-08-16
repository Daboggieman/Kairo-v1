export type DailyQuote = { text: string; author: string };

export const QUOTES: DailyQuote[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { text: 'The future depends on what you do today.', author: 'Mahatma Gandhi' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
];

export function quoteForDate(value: Date): DailyQuote {
  const day = Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000);
  return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length];
}
