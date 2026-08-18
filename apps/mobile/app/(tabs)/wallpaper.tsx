/**
 * Today's wallpaper — the daily quote, and the server-rendered image of it.
 *
 * The quote is local and always available (`src/domain/motivation.ts` derives it from the date), so
 * it is rendered first and on its own. The image is not: it comes from the sync API, which is
 * build-time optional. The screen used to show a bare `ActivityIndicator` for every one of those
 * states at once — unconfigured, in flight, and failed all looked identical, and with sync unset it
 * span forever underneath a line of text saying sync was unset.
 *
 * So each state now says which one it is, and every one that a person could act on offers the
 * action: configure sync, retry, or install a development build.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, Notice, ScreenScroll, Section } from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
import { quoteForDate } from '@/domain/motivation';
import { mediaLibraryAvailable, saveImageToLibrary } from '@/services/mediaLibrary';
import { syncConfig } from '@/sync/config';
import { colors, fontSize, layout, lineHeight, radius, spacing } from '@/theme';

/** Build-time configuration, so this cannot change while the app is running. */
const CONFIGURED = Boolean(syncConfig.apiUrl && syncConfig.deviceKey);

type Status = 'unconfigured' | 'loading' | 'ready' | 'error';
/** The outcome of one attempt. Tagged with its attempt number so a stale reply cannot be shown. */
type Result = { attempt: number; uri: string | null; error: string | null };

export default function WallpaperScreen() {
  const quote = useMemo(() => quoteForDate(new Date()), []);
  /** Bumped per attempt so a retry writes a new path — `Image` caches by URI. */
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [saving, setSaving] = useState(false);
  const canSave = mediaLibraryAvailable();

  /**
   * Derived, not stored: while no result has come back for the current attempt, the screen is
   * loading. Storing a status alongside the result is what let the old screen show a spinner and
   * "connect sync settings" at the same time.
   */
  const settled = result?.attempt === attempt ? result : null;
  const status: Status = !CONFIGURED
    ? 'unconfigured'
    : settled === null
      ? 'loading'
      : settled.error !== null
        ? 'error'
        : 'ready';

  useEffect(() => {
    if (!CONFIGURED) return;
    // Superseded by a retry, or unmounted: a late reply must not overwrite a newer one.
    let cancelled = false;
    generateWallpaper(quote, attempt)
      .then((uri) => {
        if (!cancelled) setResult({ attempt, uri, error: null });
      })
      .catch((caught: unknown) => {
        const message = caught instanceof Error ? caught.message : String(caught);
        if (!cancelled) setResult({ attempt, uri: null, error: message });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, quote]);

  async function save() {
    if (!settled?.uri) return;
    setSaving(true);
    try {
      const outcome = await saveImageToLibrary(settled.uri);
      if (outcome === 'saved') Alert.alert('Wallpaper saved');
      else if (outcome === 'permission-denied') {
        Alert.alert('Could not save', 'Photos permission is required to save wallpapers.');
      } else Alert.alert('Could not save', 'Saving to Photos needs a development build.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenScroll>
      <Card>
        <Text style={styles.quote}>{quote.text}</Text>
        <Text style={styles.author}>{quote.author}</Text>
      </Card>

      <Section title="Wallpaper">
        {status === 'loading' ? (
          <View style={styles.placeholder}>
            <LogoLoader size={80} />
            <Text style={styles.placeholderText}>Rendering today&apos;s wallpaper</Text>
          </View>
        ) : null}

        {status === 'ready' && settled?.uri ? (
          <Image source={{ uri: settled.uri }} style={styles.preview} accessibilityIgnoresInvertColors />
        ) : null}

        {status === 'unconfigured' ? (
          <Notice tone="info" title="Sync is not configured">
            Wallpapers are rendered by the Kairo API. Set the sync environment variables and restart
            the app to generate one — everything else on this screen works offline.
          </Notice>
        ) : null}
        {status === 'error' ? (
          <Notice tone="danger" title="Could not generate a wallpaper">
            {settled?.error}
          </Notice>
        ) : null}
        {status === 'unconfigured' || status === 'error' ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>No image yet</Text>
          </View>
        ) : null}

        {status === 'ready' && canSave ? (
          <Button label="Save to Photos" onPress={() => void save()} loading={saving} />
        ) : null}
        {status === 'ready' && !canSave ? (
          <Notice tone="warning" title="Preview only">
            Preview only — saving to Photos needs a development build.
          </Notice>
        ) : null}
        {/* Retry gets a new attempt number, which both re-runs the effect and picks a fresh path. */}
        {status === 'error' ? (
          <Button label="Try again" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
        ) : null}
      </Section>
    </ScreenScroll>
  );
}

/**
 * Fetch a rendered wallpaper and return its local path.
 *
 * Throws with the step that failed rather than returning `null`. The old version swallowed every
 * failure into the same silent spinner, which made a wrong API URL, an expired device key, and a
 * slow network indistinguishable — including to whoever was holding the phone.
 */
async function generateWallpaper(
  quote: { text: string; author: string },
  attempt: number,
): Promise<string> {
  const tokenResponse = await fetch(`${syncConfig.apiUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_key: syncConfig.deviceKey }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Sign-in failed (${tokenResponse.status}). Check the device key.`);
  }
  const token = (await tokenResponse.json()) as { access_token: string };

  const response = await fetch(`${syncConfig.apiUrl}/api/v1/wallpapers/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.access_token}`,
    },
    body: JSON.stringify(quote),
  });
  if (!response.ok) throw new Error(`The server could not render it (${response.status}).`);

  const body = (await response.json()) as { image_base64?: string };
  // A blank preview is indistinguishable from a broken `Image`, so an empty payload is an error
  // here rather than a mystery on screen.
  if (!body.image_base64) throw new Error('The server returned an empty image.');

  const path = `${FileSystem.cacheDirectory}kairo-wallpaper-${attempt}.png`;
  await FileSystem.writeAsStringAsync(path, body.image_base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

const styles = StyleSheet.create({
  quote: { color: colors.text, fontSize: fontSize.lg, lineHeight: lineHeight.lg, fontWeight: '600' },
  author: { color: colors.textMuted, fontSize: fontSize.sm },
  preview: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  placeholder: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    // `background`, not `surface`: `LogoLoader`'s mark has an opaque interior in exactly this
    // colour, and on a lighter fill it would show as dark patches. See `src/components/Logo.tsx`.
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: layout.cardPadding,
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
});
