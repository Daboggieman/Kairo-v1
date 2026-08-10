/** Stack for the workouts module: history at the root, everything else pushed on top. */

import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function WorkoutsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Workouts' }} />
      <Stack.Screen name="active" options={{ title: 'Active Session' }} />
      <Stack.Screen name="exercises" options={{ title: 'Exercises', presentation: 'modal' }} />
      <Stack.Screen name="[sessionId]" options={{ title: 'Session' }} />
    </Stack>
  );
}
