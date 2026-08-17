/**
 * Which Expo runtime this bundle is executing in.
 *
 * Expo Go ships a fixed set of native modules. A package whose native side is missing is not a
 * degraded feature there — a module-scope `import` of it aborts evaluation of every module that
 * imports it, and Expo Router reports the casualty as "missing the required default export"
 * rather than as the native error it is. Native capabilities Expo Go lacks are therefore gated
 * on this flag and required lazily (`src/services/notifications.ts`,
 * `src/services/mediaLibrary.ts`, `src/services/movementTracking.ts`).
 */

import Constants from 'expo-constants';

/** `storeClient` is the Expo Go app; a development build reports `standalone`/`bare`. */
export const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';
