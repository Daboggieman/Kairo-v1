/**
 * Stack for the movement module: The Expedition at the root, The March / The Chronicle / The
 * Retelling / The Compass pushed, The Threshold as a modal.
 *
 * `headerShown: false` throughout, per the convention in `tasks/_layout.tsx`. A native header can
 * carry a font but not a Greek key, and the theme puts an ornament under every screen name — so the
 * root renders `ScreenHeader` as the first thing in its list and the pushed screens render `AppBar`,
 * both from `src/components/Layout.tsx`. The `contentStyle` background stays, because it is what
 * paints behind the screen during a push transition.
 *
 * `active` keeps **no back affordance at all**. It used to say `headerBackVisible: false`, which has
 * nothing left to hide now the native header is gone, so the intent moves to `gestureEnabled:
 * false`: a live recording must be finished or discarded, not swiped away. The screen offers no
 * chevron and no close glyph either — leaving is a decision, and it goes through the finish
 * confirmation.
 */

import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function MovementLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="active" options={{ gestureEnabled: false }} />
      <Stack.Screen name="[activityId]" />
      <Stack.Screen name="replay" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
