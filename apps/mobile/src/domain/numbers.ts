/** Parse a number typed into a user-facing decimal input. */
export function parseDecimalInput(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return Number.NaN;

  // Mobile keyboards in some locales use a comma (or Arabic decimal separator) instead
  // of a dot. Normalize only the decimal mark; strict validation below rejects mixed or
  // partially parsed values instead of silently truncating them.
  const normalized = trimmed.replace(/,/g, '.').replace(/\u066B/g, '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return Number.NaN;

  return Number(normalized);
}
