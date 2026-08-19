/**
 * Stack for the weight module: The Scales at the root, The Weighing and The Vow as modals.
 *
 * `headerShown: false` throughout — every screen draws its own `ScreenHeader` or `AppBar`, and the
 * navigator's header would sit above them. `contentStyle` is what paints behind a push transition.
 */

import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function WeightLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="log" options={{ presentation: 'modal' }} />
      <Stack.Screen name="goal" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
