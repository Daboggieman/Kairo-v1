/**
 * A clock that re-renders its component on an interval.
 *
 * Time-dependent UI (rest timer, session duration) needs the current time, but reading
 * `Date.now()` during render is impure — React may re-render at any moment and the value
 * would change unpredictably. This confines the read to an interval callback and hands
 * components a value that only changes when the clock is meant to advance.
 *
 * Keep it in leaf components: everything that reads it re-renders every tick.
 */

import { useEffect, useState } from 'react';

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
