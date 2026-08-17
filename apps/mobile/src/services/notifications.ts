/**
 * Local reminder scheduling, gated on what the current runtime actually provides.
 *
 * `expo-notifications`' barrel entry has a module-scope side effect —
 * `DevicePushTokenAutoRegistration.fx` registers a device-push-token listener as the module
 * evaluates — and on Android in Expo Go that listener *throws*: SDK 53 removed remote
 * notifications from Expo Go. A static `import * as Notifications from 'expo-notifications'`
 * therefore aborts every importing module, which is exactly what took the whole app down in
 * Expo Go: `app/_layout.tsx` failed to evaluate, Expo Router reported it as "missing the
 * required default export", and rendering died on `Cannot read property 'ErrorBoundary' of
 * undefined`.
 *
 * So the package is required lazily, through three tiers:
 *
 * - **full** — the public barrel. Development builds and production get the whole API.
 * - **local-only** — Expo Go on Android, where the barrel is unusable. The deep modules that
 *   back local scheduling do not import the push side effect, and Expo Go only dropped
 *   *remote* notifications, so scheduled reminders still fire there.
 * - **unavailable** — nothing loaded. Rows still save; the screen says why they will not fire.
 *
 * The deep paths are private API. Each is required behind `tryRequire`, so if a future SDK
 * restructures `build/` the tier degrades to `unavailable` with a banner instead of crashing a
 * route — the failure mode this module exists to prevent.
 */

import { Platform } from 'react-native';

import { reminderTriggers, type ReminderTrigger } from '@/domain/reminders';
import { IS_EXPO_GO } from '@/services/runtime';

export type NotificationsMode = 'full' | 'local-only' | 'unavailable';

export type ReminderInput = { label: string; hour: number; minute: number; repeatDays: number[] };

type PermissionsStatus = { granted: boolean };
type NotificationBehavior = {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
};
type NotificationHandlerConfig = { handleNotification: () => Promise<NotificationBehavior> };

/**
 * Only the surface Kairo uses. Declaring it here rather than reusing the package's types is
 * what lets the full and local-only tiers present one interface, and keeps the private deep
 * imports from leaking their shapes into the screens.
 */
type NotificationsApi = {
  setNotificationHandler?: (handler: NotificationHandlerConfig | null) => void;
  getPermissionsAsync: () => Promise<PermissionsStatus>;
  requestPermissionsAsync: () => Promise<PermissionsStatus>;
  scheduleNotificationAsync: (request: {
    content: { title: string };
    trigger: ReminderTrigger;
  }) => Promise<string>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<void>;
};

/**
 * A lazy `require` is the point of this module: a static import would be hoisted and evaluated
 * before anything could guard it. Metro's transform only accepts a literal module path, so the
 * call has to be written out at each site and handed over as a thunk — `require(someVariable)`
 * fails the bundle with "Invalid call".
 */
function tryRequire(load: () => unknown): Record<string, unknown> | null {
  try {
    return load() as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-require-imports -- every require below is deliberately
   deferred; see the module comment. */
const requireBarrel = () => tryRequire(() => require('expo-notifications'));
const requirePermissions = () =>
  tryRequire(() => require('expo-notifications/build/NotificationPermissions'));
const requireSchedule = () =>
  tryRequire(() => require('expo-notifications/build/scheduleNotificationAsync'));
const requireCancel = () =>
  tryRequire(() => require('expo-notifications/build/cancelScheduledNotificationAsync'));
const requireHandler = () =>
  tryRequire(() => require('expo-notifications/build/NotificationsHandler'));
/* eslint-enable @typescript-eslint/no-require-imports */

function isFunction(value: unknown): boolean {
  return typeof value === 'function';
}

/** A tier only counts if every call Kairo makes is actually there. */
function toApi(candidate: Record<string, unknown> | null): NotificationsApi | null {
  if (!candidate) return null;
  const complete =
    isFunction(candidate.getPermissionsAsync) &&
    isFunction(candidate.requestPermissionsAsync) &&
    isFunction(candidate.scheduleNotificationAsync) &&
    isFunction(candidate.cancelScheduledNotificationAsync);
  return complete ? (candidate as unknown as NotificationsApi) : null;
}

let loaded: { mode: NotificationsMode; api: NotificationsApi | null } | null = null;

function load(): { mode: NotificationsMode; api: NotificationsApi | null } {
  if (loaded) return loaded;

  // Skip the barrel only where it throws. Expo Go on iOS merely warns, and local notifications
  // work there, so it keeps the full API.
  if (!(IS_EXPO_GO && Platform.OS === 'android')) {
    const full = toApi(requireBarrel());
    if (full) {
      loaded = { mode: 'full', api: full };
      return loaded;
    }
  }

  // Each capability is required separately so a missing handler module cannot cost us
  // scheduling, which is the part reminders actually need.
  const composed: Record<string, unknown> = {
    ...requirePermissions(),
    ...requireSchedule(),
    ...requireCancel(),
    ...requireHandler(),
  };
  const local = toApi(composed);
  loaded = local ? { mode: 'local-only', api: local } : { mode: 'unavailable', api: null };
  return loaded;
}

/** What the current runtime can do — the reminders screen renders its notice from this. */
export function notificationsMode(): NotificationsMode {
  return load().mode;
}

/**
 * Foreground presentation behaviour. Called at module scope from `app/_layout.tsx`, so it must
 * never throw: a no-op is the correct outcome when notifications are unavailable.
 */
export function configureNotificationHandler(): void {
  const { api } = load();
  if (!api?.setNotificationHandler) return;
  api.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function hasPermission(api: NotificationsApi): Promise<boolean> {
  try {
    const existing = await api.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await api.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * Schedule one alarm row and return its native identifiers joined by `,` (one per weekday), or
 * `null` when nothing was scheduled — unavailable runtime, denied permission, or a row whose
 * time/weekdays do not describe a schedule. The caller stores `null` and keeps the row, so the
 * reminder starts working once the missing piece is in place.
 */
export async function scheduleReminder(input: ReminderInput): Promise<string | null> {
  const { api } = load();
  if (!api) return null;

  const triggers = reminderTriggers(input);
  if (triggers.length === 0) return null;
  if (!(await hasPermission(api))) return null;

  const title = input.label.trim() || 'Kairo reminder';
  try {
    const ids = await Promise.all(
      triggers.map((trigger) => api.scheduleNotificationAsync({ content: { title }, trigger })),
    );
    return ids.join(',');
  } catch (error) {
    console.warn('[kairo] could not schedule a reminder', error);
    return null;
  }
}

/**
 * Cancel every identifier a row holds.
 *
 * Failures are swallowed per identifier on purpose: a schedule that the OS has already dropped
 * would otherwise reject here and abort the caller's `DELETE`, leaving a row the user cannot
 * remove.
 */
export async function cancelReminder(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  const { api } = load();
  if (!api) return;

  await Promise.all(
    notificationId
      .split(',')
      .filter((identifier) => identifier.length > 0)
      .map(async (identifier) => {
        try {
          await api.cancelScheduledNotificationAsync(identifier);
        } catch {
          // Already gone, or never registered in this install.
        }
      }),
  );
}
