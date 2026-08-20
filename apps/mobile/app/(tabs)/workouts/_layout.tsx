/**
 * Stack for the workouts module: The Forge at the root, The Anvil and The Stele pushed, The Armory
 * as a modal.
 *
 * `headerShown: false` throughout, per the convention in `tasks/_layout.tsx`. A native header can
 * carry a font but not a Greek key, and the theme puts an ornament under every screen name — so the
 * root renders `ScreenHeader` as the first thing in its scroll and the pushed screens render
 * `AppBar`, both from `src/components/Layout.tsx`. The `contentStyle` background stays, because it is
 * what paints behind the screen during a push transition.
 */

import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function WorkoutsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="active" />
      <Stack.Screen name="exercises" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[sessionId]" />
    </Stack>
  );
}
