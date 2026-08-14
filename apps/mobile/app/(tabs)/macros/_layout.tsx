/** Stack for the macro module: day log at the root, food and target entry as modals. */

import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function MacrosLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Macros' }} />
      <Stack.Screen name="add" options={{ title: 'Add food', presentation: 'modal' }} />
      <Stack.Screen name="targets" options={{ title: 'Macro targets', presentation: 'modal' }} />
    </Stack>
  );
}
