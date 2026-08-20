/**
 * The Oracle — the day's inscription, and the standard rendered from it.
 *
 * The inscription is local and always available (`src/domain/motivation.ts` derives it from the
 * date), so it is rendered first and on its own. The standard is not: it comes from the sync API,
 * which is build-time optional. The screen used to show a bare `ActivityIndicator` for every one of
 * those states at once — unconfigured, in flight, and failed all looked identical, and with sync
 * unset it span forever underneath a line of text saying sync was unset.
 *
 * So each state now says which one it is, and every one that a person could act on offers the
 * action: configure sync, forge another, or install a development build.
 *
 * Departures from `5.23_the_oracle`:
 *
 * - **No helmet mark under the inscription.** The design centres a 16px `sports_mma` glyph at the
 *   foot of the hero and repeats it on the preview card. A boxing glove under a Delphic quotation is
 *   sample content of the same class as the designs' remote hero photographs, and the app's own mark
 *   cannot stand in for it: `KairoMark`'s interior is opaque `background`, so it only reads on
 *   `background` and never inside a `Card` (see `app/(tabs)/index.tsx`). The two frets are the
 *   ornament here, which is what the fret lines are for.
 * - **The inscription is set in `headlineSm`, mixed case.** The design sets its twelve-character
 *   sample in uppercase display-md; the quotations this screen actually draws from are sentences of
 *   40 to 70 characters, which at 28/34 with 3.4pt tracking and no lowercase runs to five or six
 *   lines and overruns the block it sits in.
 * - **The hero's 260pt height is a floor, not a fixed height**, for the same reason — a long
 *   inscription grows the plate rather than spilling out of it.
 * - **The preview is 160pt wide, not the design's 112.** At 112 the inscription rendered into the
 *   image is not legible, and checking what you are about to save is the entire purpose of a preview.
 *   Nor is it the full-width 9:16 the old screen drew: at 327pt across that stands 581pt tall and
 *   pushes both actions below the fold.
 * - **"Forge another" appears only when there is a failure to retry.** The design shows it under
 *   "Take the standard" as a permanent pair, but the render is deterministic from the day's
 *   inscription — forging again on success returns the identical image, which is a button that
 *   appears to do nothing.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { AppBar, Card, Meander, Notice, Screen, ScreenScroll, Section } from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
import { quoteForDate } from '@/domain/motivation';
import { mediaLibraryAvailable, saveImageToLibrary } from '@/services/mediaLibrary';
import { syncConfig } from '@/sync/config';
import {
  colors,
  fontSize,
  layout,
  lineHeight,
  radius,
  spacing,
  type as typeScale,
} from '@/theme';

/** Build-time configuration, so this cannot change while the app is running. */
const CONFIGURED = Boolean(syncConfig.apiUrl && syncConfig.deviceKey);

/** The design's plate height, as a minimum: a long inscription grows it rather than spilling out. */
const HERO_MIN_HEIGHT = 260;

/** Wide enough to read the inscription rendered into the image, short enough to keep the actions up. */
const PREVIEW_WIDTH = 160;

type Status = 'unconfigured' | 'loading' | 'ready' | 'error';
/** The outcome of one attempt. Tagged with its attempt number so a stale reply cannot be shown. */
type Result = { attempt: number; uri: string | null; error: string | null };

function formatDate(value: Date): string {
  return value.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function OracleScreen() {
  const router = useRouter();
  /**
   * Seeded lazily and read once: `new Date()` in a render body is an impure call, which
   * `react-hooks/purity` rejects. One reading per mount is the whole contract here — the oracle
   * speaks once a day, so there is nothing on this screen that needs to tick.
   */
  const [today] = useState(() => new Date());
  const quote = quoteForDate(today);
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
      if (outcome === 'saved') Alert.alert('Saved to Photos');
      else if (outcome === 'permission-denied') {
        Alert.alert('Could not save', 'Photos permission is required to save the standard.');
      } else Alert.alert('Could not save', 'Saving to Photos needs a development build.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <AppBar title="The Oracle" onBack={() => router.back()} />

      <ScreenScroll>
        {/*
          The inscription: a plate with the fret along both edges. It is the one block in the app
          that is read rather than used, which is what the two ornaments are reserved for.
        */}
        <View style={styles.inscription}>
          <Card style={styles.hero}>
            <Meander style={styles.fretTop} />
            <Text style={styles.quote}>{quote.text}</Text>
            <Text style={styles.author}>— {quote.author}</Text>
            <Meander style={styles.fretBottom} />
          </Card>
          <Text style={styles.caption}>
            The oracle speaks once a day. {formatDate(today)}.
          </Text>
        </View>

        <Section title="The standard">
          <View style={styles.standard}>
            {status === 'loading' ? (
              <View style={styles.frame}>
                <LogoLoader size={64} />
                <Text style={styles.frameText}>Forging today&apos;s standard</Text>
              </View>
            ) : null}

            {status === 'ready' && settled?.uri ? (
              <Image
                source={{ uri: settled.uri }}
                style={styles.preview}
                accessibilityIgnoresInvertColors
              />
            ) : null}

            {status === 'unconfigured' || status === 'error' ? (
              <View style={styles.frame}>
                <Text style={styles.frameText}>No standard yet</Text>
              </View>
            ) : null}
          </View>

          {status === 'unconfigured' ? (
            <Notice tone="info" title="Sync is not configured">
              The standard is rendered by the Kairo API. Set the sync environment variables and
              restart the app to render one — the inscription above works offline.
            </Notice>
          ) : null}
          {status === 'error' ? (
            <Notice tone="danger" title="Could not forge the standard">
              {settled?.error}
            </Notice>
          ) : null}

          {status === 'ready' && canSave ? (
            <Button label="Take the standard" onPress={() => void save()} loading={saving} />
          ) : null}
          {status === 'ready' && !canSave ? (
            <Notice tone="warning" title="Preview only">
              Preview only — saving to Photos needs a development build.
            </Notice>
          ) : null}
          {/* Forging again gets a new attempt number, which both re-runs the effect and picks a
              fresh path. Only offered on a failure: the render is deterministic from the day's
              inscription, so on success it would return the same image. */}
          {status === 'error' ? (
            <Button
              label="Forge another"
              variant="secondary"
              onPress={() => setAttempt((n) => n + 1)}
            />
          ) : null}
        </Section>
      </ScreenScroll>
    </Screen>
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
  inscription: { gap: spacing.md },
  /**
   * `overflow: hidden` keeps both frets inside the card's rounded corners, and the extra vertical
   * padding is the room they occupy — 14px each, `Meander`'s default height, below which the Greek
   * key closes up into a plain gold rule.
   */
  hero: {
    minHeight: HERO_MIN_HEIGHT,
    paddingVertical: layout.cardPadding + 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fretTop: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.6 },
  fretBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, opacity: 0.6 },
  quote: { color: colors.text, ...typeScale.headlineSm, textAlign: 'center' },
  author: { color: colors.textMuted, ...typeScale.label, fontWeight: '500' },
  caption: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    textAlign: 'center',
  },
  standard: { alignItems: 'center' },
  preview: {
    width: PREVIEW_WIDTH,
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  frame: {
    width: PREVIEW_WIDTH,
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
  frameText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
});
