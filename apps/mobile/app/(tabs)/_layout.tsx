/**
 * Bottom tabs — one per top-level module.
 *
 * Only Home and Workouts exist this pass. Weight, Tasks and Macros each become another
 * folder under `app/(tabs)/` with its own `_layout.tsx`, which is the structural half of
 * the "one app, modular features" principle in `01-architecture-and-stack.md`.
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
      <Tabs.Screen name="workouts" options={{ title: 'Workouts', headerShown: false }} />
    </Tabs>
  );
}
