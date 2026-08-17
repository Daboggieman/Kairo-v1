import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function MovementLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Movement' }} />
      <Stack.Screen name="new" options={{ title: 'Start movement', presentation: 'modal' }} />
      <Stack.Screen name="active" options={{ title: 'Tracking', headerBackVisible: false }} />
      <Stack.Screen name="[activityId]" options={{ title: 'Activity' }} />
      <Stack.Screen name="replay" options={{ title: 'Route replay' }} />
      <Stack.Screen name="settings" options={{ title: 'Movement settings' }} />
    </Stack>
  );
}
