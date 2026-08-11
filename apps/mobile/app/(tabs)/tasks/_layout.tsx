/** Stack for the tasks module: the Today list at the root, new task as a modal, streak detail pushed. */

import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function TasksLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Today' }} />
      <Stack.Screen name="new" options={{ title: 'New task', presentation: 'modal' }} />
      <Stack.Screen name="[taskId]" options={{ title: 'Streak' }} />
    </Stack>
  );
}
