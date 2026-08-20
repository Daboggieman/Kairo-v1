/**
 * Stack for the tasks module: The Rites at the root, The New Rite as a modal, The Flame pushed.
 *
 * `headerShown: false` throughout. A native header can carry a font but not a Greek key, and the
 * theme puts an ornament under every screen name — so the root renders `ScreenHeader` as the first
 * thing in its scroll and the two pushed screens render `AppBar`, both from
 * `src/components/Layout.tsx`. The `contentStyle` background stays, because it is what paints behind
 * the screen during a push transition.
 */

import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function TasksLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[taskId]" />
    </Stack>
  );
}
