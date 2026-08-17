/**
 * Saving a generated image to the device photo library, gated on the runtime.
 *
 * `expo-media-library`'s default entry resolves the `ExpoMediaLibraryNext` native module at
 * module scope, and Expo Go does not ship it — so importing the package took `wallpaper.tsx`
 * down with `Cannot find native module 'ExpoMediaLibraryNext'` before the screen could render.
 * The default entry is also the wrong entry for this feature: in SDK 57 its
 * `saveToLibraryAsync` is a deprecated stub that throws and tells you to import from
 * `expo-media-library/legacy`, so the save button could not have worked in a development build
 * either.
 *
 * `expo-media-library/legacy` is the supported home of `saveToLibraryAsync` and needs only the
 * older `ExpoMediaLibrary` native module, which Expo Go does have. It is still required lazily
 * and shape-checked, so a runtime without it disables the button instead of killing the route —
 * the same contract as `src/services/notifications.ts`.
 */

type PermissionsStatus = { granted: boolean };

type MediaLibraryApi = {
  requestPermissionsAsync: () => Promise<PermissionsStatus>;
  saveToLibraryAsync: (localUri: string) => Promise<void>;
};

export type SaveImageResult = 'saved' | 'permission-denied' | 'unavailable';

let loaded: MediaLibraryApi | null | undefined;

function load(): MediaLibraryApi | null {
  if (loaded !== undefined) return loaded;
  try {
    // Lazy on purpose — a static import is hoisted past any guard. See the module comment.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const candidate = require('expo-media-library/legacy') as Record<string, unknown>;
    loaded =
      typeof candidate.requestPermissionsAsync === 'function' &&
      typeof candidate.saveToLibraryAsync === 'function'
        ? (candidate as unknown as MediaLibraryApi)
        : null;
  } catch {
    loaded = null;
  }
  return loaded;
}

/** False in Expo Go if the native module is absent — the screen hides the save action. */
export function mediaLibraryAvailable(): boolean {
  return load() !== null;
}

/**
 * Save a local file URI to the photo library. Returns the outcome rather than throwing so the
 * caller can tell a denied permission ("grant it and retry") from an unavailable module
 * ("install a development build"), which are different messages to the user.
 */
export async function saveImageToLibrary(localUri: string): Promise<SaveImageResult> {
  const api = load();
  if (!api) return 'unavailable';

  try {
    const permission = await api.requestPermissionsAsync();
    if (!permission.granted) return 'permission-denied';
    await api.saveToLibraryAsync(localUri);
    return 'saved';
  } catch (error) {
    console.warn('[kairo] could not save to the photo library', error);
    return 'unavailable';
  }
}
