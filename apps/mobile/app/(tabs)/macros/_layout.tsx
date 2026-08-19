/**
 * Stack for the macro module: The Feast at the root, The Offering and The Decree as modals.
 *
 * `headerShown: false` throughout — every screen draws its own `ScreenHeader` or `AppBar`, and the
 * navigator's header would sit above them. `contentStyle` is what paints behind a push transition.
 */

import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function MacrosLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="targets" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
