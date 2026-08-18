/**
 * Bottom tabs — one per top-level module, named as places rather than as features.
 *
 * Each module owns a folder under `app/(tabs)/` and a nested stack, keeping modal entry flows
 * out of this top-level navigation file. `alarms` and `wallpaper` are routes without tabs: they are
 * reached from The Citadel's outer ward, because six tabs is already the most a phone can label.
 *
 * The bar itself is the design system's: 80pt tall on top of the safe-area inset, the raised
 * surface, and a 2pt accent rule across the top of the active tab — the theme's marker for "the
 * highest level of focus". The rule is absolutely positioned rather than a `borderTopWidth`, which
 * would add two points of height to whichever tab is active and jog the icons as you switch.
 *
 * The designs ship a five-tab bar with no movement entry at all. Keeping it here is deliberate:
 * Phase 3 built the whole movement module and burying it two taps into the Citadel would strand it.
 * See `docs/09-ui-rebuild-plan.md`.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

/** How tall the bar is above the home indicator. `DESIGN.md`'s `h-20`. */
const TAB_BAR_HEIGHT = 80;

/**
 * The subset of a tab button's props this needs.
 *
 * Structural rather than imported: `BottomTabBarButtonProps` is declared inside `expo-router`'s
 * vendored copy of react-navigation and reaching into `expo-router/build/...` for a type would tie
 * this file to that package's internal layout. Everything named here is contextually checked against
 * the real signature at the `tabBarButton` call below, so a rename upstream still fails the build.
 *
 * `aria-selected` is the one that matters: it is how the item reports focus, and it is the only
 * source of that for a replaced button — the navigator does not pass a `focused` flag.
 */
type TabButtonProps = {
  children?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: ((event: GestureResponderEvent) => void) | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  'aria-label'?: string;
  'aria-selected'?: boolean;
};

function TabButton({
  children,
  onPress,
  onLongPress,
  style,
  testID,
  'aria-label': ariaLabel,
  'aria-selected': selected,
}: TabButtonProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={ariaLabel}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      // `style` last-but-one so the navigator's own layout still applies, then the two overrides:
      // its default packs icon and label to the top of the item, which reads as a mistake in a bar
      // this tall.
      style={({ pressed }) => [style, styles.tab, pressed && styles.pressed]}
    >
      {selected ? <View style={styles.activeRule} /> : null}
      {children}
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        /**
         * The inset has to be added by hand. When `tabBarStyle` carries an explicit `height` the
         * navigator takes it as the whole bar and still pads the bottom by the inset, so a flat 80
         * leaves 46 points of usable bar on a phone with a home indicator.
         */
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          backgroundColor: colors.surfaceRaised,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
        tabBarButton: (props) => <TabButton {...props} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'CITADEL',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="castle" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'RITES',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="checkbox-marked-circle-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: 'FORGE',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="dumbbell" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="macros"
        options={{
          title: 'FEAST',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="silverware-fork-knife" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="weight"
        options={{
          title: 'SCALES',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="scale-balance" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="movement"
        options={{
          title: 'MOVE',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="map-marker-path" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen name="alarms" options={{ href: null, title: 'THE CALL' }} />
      <Tabs.Screen name="wallpaper" options={{ href: null, title: 'THE ORACLE' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  /** Centres icon and label in an 80pt item, and leaves room for the rule above them. */
  tab: { justifyContent: 'center', gap: 2, paddingTop: 2 },
  activeRule: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  pressed: { opacity: 0.7 },
});
