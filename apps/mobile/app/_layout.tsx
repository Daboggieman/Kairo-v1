/**
 * Root layout: opens the database, runs migrations, and hosts the navigation stack.
 *
 * `SQLiteProvider`'s `onInit` runs `migrate()` before any child renders, so every screen
 * below can assume the schema exists. `useSuspense` + the ErrorBoundary means a failed
 * migration surfaces as an error screen rather than a blank app with silent query failures.
 */

import { SQLiteProvider } from 'expo-sqlite';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SyncBootstrap } from '@/components/SyncBootstrap';
import { DATABASE_NAME } from '@/constants';
import { migrate } from '@/db/migrations';
import '@/services/movementTracking';
import { configureNotificationHandler } from '@/services/notifications';
import { colors, fontSize, spacing } from '@/theme';

/**
 * Never import `expo-notifications` here. Its barrel entry throws as it evaluates on Android in
 * Expo Go, and a module-scope throw in the root layout takes the entire app down before
 * `ErrorBoundary` below can ever render. `@/services/notifications` owns that gate.
 */
configureNotificationHandler();

/** Expo Router renders this instead of crashing when a child throws — including `onInit`. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Kairo could not start</Text>
      <Text style={styles.errorBody}>{error.message}</Text>
      <Text style={styles.retry} onPress={() => retry()}>
        Tap to retry
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <Suspense
      fallback={
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      }
    >
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>
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
      </SQLiteProvider>
    </Suspense>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  errorTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  errorBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  retry: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: spacing.xl,
  },
});
