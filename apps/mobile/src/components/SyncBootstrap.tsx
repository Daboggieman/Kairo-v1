/** Starts a best-effort sync after launch and whenever the app becomes active. */

import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { requestSync } from '@/sync/scheduler';

export function SyncBootstrap() {
  const db = useSQLiteContext();

  useEffect(() => {
    const run = () => {
      void requestSync(db).catch(() => {
        // The outbox remains durable; a later foreground or mutation retries it.
      });
    };
    run();
    const retryTimer = setInterval(run, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      clearInterval(retryTimer);
      subscription.remove();
    };
  }, [db]);

  return null;
}
