/**
 * Bottom tabs — one per top-level module.
 *
 * Each module owns a folder under `app/(tabs)/` and a nested stack, keeping modal entry flows
 * out of this top-level navigation file.
 */

import { Tabs } from 'expo-router';

import { colors, fontSize } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Today', headerShown: false }} />
      <Tabs.Screen name="macros" options={{ title: 'Macros', headerShown: false }} />
      <Tabs.Screen name="workouts" options={{ title: 'Workouts', headerShown: false }} />
      <Tabs.Screen name="weight" options={{ title: 'Weight', headerShown: false }} />
    </Tabs>
  );
}
