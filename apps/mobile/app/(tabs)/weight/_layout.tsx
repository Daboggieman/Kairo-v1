/** Stack for the weight module: the trend chart at the root, entry and goal as modals. */

import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function WeightLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Weight' }} />
      <Stack.Screen name="log" options={{ title: 'Log weight', presentation: 'modal' }} />
      <Stack.Screen name="goal" options={{ title: 'Goal weight', presentation: 'modal' }} />
    </Stack>
  );
}
