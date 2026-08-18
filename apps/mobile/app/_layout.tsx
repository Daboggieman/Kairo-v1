/**
 * Root layout: opens the database, runs migrations, and hosts the navigation stack.
 *
 * `SQLiteProvider`'s `onInit` runs `migrate()` before any child renders, so every screen
 * below can assume the schema exists. `useSuspense` + the ErrorBoundary means a failed
 * migration surfaces as an error screen rather than a blank app with silent query failures.
 */

import { Cinzel_600SemiBold, Cinzel_700Bold, useFonts } from '@expo-google-fonts/cinzel';
import { SQLiteProvider } from 'expo-sqlite';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { AppLoader, IntroOverlay, KairoMark } from '@/components/Logo';
import { SyncBootstrap } from '@/components/SyncBootstrap';
import { DATABASE_NAME } from '@/constants';
import { migrate } from '@/db/migrations';
import '@/services/movementTracking';
import { configureNotificationHandler } from '@/services/notifications';
import { colors, fontSize, layout, lineHeight, spacing } from '@/theme';

/**
 * Never import `expo-notifications` here. Its barrel entry throws as it evaluates on Android in
 * Expo Go, and a module-scope throw in the root layout takes the entire app down before
 * `ErrorBoundary` below can ever render. `@/services/notifications` owns that gate.
 */
configureNotificationHandler();

/**
 * Whether the intro has already run in this JavaScript context.
 *
 * Module scope, not state: the root layout remounts on a Fast Refresh and after an ErrorBoundary
 * retry, and replaying the intro animation on either would be a delay in front of someone who is
 * mid-task, not a brand moment.
 */
let introPlayed = false;

/** Expo Router renders this instead of crashing when a child throws — including `onInit`. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={styles.center}>
      <KairoMark height={72} />
      <Text style={styles.errorTitle}>Kairo could not start</Text>
      <Text style={styles.errorBody}>{error.message}</Text>
      <Button label="Try again" onPress={() => void retry()} style={styles.retry} />
    </View>
  );
}

export default function RootLayout() {
  /**
   * The two display weights, loaded here so the whole tree can name them in `type`.
   *
   * `useFonts` is called above the provider on purpose: it starts fetching on the very first render,
   * at the same moment `SQLiteProvider` starts opening the database, so the two waits overlap
   * instead of queueing. Whichever finishes last decides when the app appears, and both show the
   * same `AppLoader` — one loading state, not two. `AppLoader` itself sets no Cinzel text, so there
   * is no flash of the fallback face while this resolves.
   *
   * A failed load is not fatal and is deliberately not gated on: `useFonts` returns an error, the
   * families fall back to the platform serif, and the app is legible if less inscribed. Refusing to
   * start over a webfont would be worse than the wrong face.
   */
  const [fontsLoaded, fontError] = useFonts({ Cinzel_600SemiBold, Cinzel_700Bold });
  const fontsSettled = fontsLoaded || fontError !== null;

  return (
    <Suspense fallback={<AppLoader label="Opening your training data" />}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>
        {fontsSettled ? (
          <View style={styles.root}>
            <SyncBootstrap />
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.text,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
            <Intro />
          </View>
        ) : (
          <AppLoader label="Opening your training data" />
        )}
      </SQLiteProvider>
    </Suspense>
  );
}

/**
 * The intro, over the top of a mounted app.
 *
 * It renders after `Suspense` resolves, so the database is already open and the first screen is
 * already built behind it — the animation is not on the critical path, and dismissing it reveals a
 * screen with data rather than a spinner.
 */
function Intro() {
  const [visible, setVisible] = useState(() => !introPlayed);
  const finish = useCallback(() => {
    introPlayed = true;
    setVisible(false);
  }, []);

  if (!visible) return null;
  return <IntroOverlay onFinish={finish} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: layout.screenPadding,
    gap: spacing.md,
  },
  errorTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
  errorBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
  retry: { alignSelf: 'stretch', marginTop: spacing.xl },
});
