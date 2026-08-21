/**
 * Decides where the app opens, once per JavaScript context.
 *
 * Two questions, both answered from `user_preferences`: has the user crossed The Gates, and which
 * tab do they want first. Neither can be asked in `app/_layout.tsx` itself — that component *renders*
 * `SQLiteProvider`, so it is above the context it would need to read. This follows `SyncBootstrap`'s
 * precedent instead: a null-rendering child inside the provider that does its work in an effect.
 */

import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { LOCAL_USER_ID } from '@/constants';
import { getFirstScreen, isOnboardingComplete } from '@/db/preferences';

/**
 * Whether launch routing has already happened in this JavaScript context.
 *
 * Module scope, not state, for the same reason `introPlayed` is: the root layout remounts on a Fast
 * Refresh and after an ErrorBoundary retry, and re-running this would yank someone out of the screen
 * they are on and back to their first screen mid-task.
 */
let routed = false;

export function LaunchRouter() {
  const db = useSQLiteContext();

  useEffect(() => {
    if (routed) return;
    routed = true;
    let cancelled = false;
    (async () => {
      try {
        if (!(await isOnboardingComplete(db, LOCAL_USER_ID))) {
          if (!cancelled) router.replace('/gates');
          return;
        }
        const firstScreen = await getFirstScreen(db, LOCAL_USER_ID);
        // `index` is already the tab the router lands on; navigating to it would be a no-op push.
        if (firstScreen !== 'index' && !cancelled) router.replace(`/(tabs)/${firstScreen}`);
      } catch {
        /**
         * A failed preference read leaves the app on The Citadel rather than on The Gates. Showing
         * onboarding to an existing user because one query failed is the worse of the two outcomes:
         * it implies their data is gone.
         */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  return null;
}
