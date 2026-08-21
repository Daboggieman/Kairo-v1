/**
 * The Gates — the first launch, and the only screen the app shows before the tabs exist.
 *
 * Three panels paged horizontally: the mark, the measures, and what Kairo will ask permission for.
 * `ONBOARDING_COMPLETE` is written by the last button and read by `LaunchRouter`, which is what
 * keeps this out of the way on every launch after the first.
 *
 * Outside the tab group and outside the back stack: registered in `app/_layout.tsx` with
 * `gestureEnabled: false`, because a swipe-back from the first panel would land on a Citadel the
 * user has not been given yet.
 *
 * Departures from `5.24_the_gates`:
 *
 * - **Two Measures rows, not three.** `preferences.ts` has one `UNIT_SYSTEM` covering weight *and*
 *   distance, and the design's separate KG/LB and KM/MI toggles would mean auditing every `toKg`
 *   and `formatMovementDistance` call site to enable kilograms-with-miles, which nobody asked for.
 *   The locked plan resolved this the same way (`docs/09-ui-rebuild-plan.md`, "Resolved
 *   divergence"), and the note under the row says what the one choice covers.
 * - **The Gatekeepers have no checkboxes.** An OS grant cannot be switched back off from inside the
 *   app, so a checkbox here would be a control that does not control its thing. Kairo already
 *   requests each permission at the point of first use — deliberately, so the request arrives with
 *   a reason attached. These are three informational rows, and each one reports what this runtime
 *   can actually do rather than promising Expo Go what it lacks.
 * - **`pagingEnabled`, not scroll-snap.** React Native has no CSS snap; a horizontal `ScrollView`
 *   with `pagingEnabled` is the idiom, and the three dots are three `View`s.
 * - **The full-width buttons stay.** The rebuild dropped every *docked* footer slab, but these are
 *   in the content flow and advancing is the whole purpose of each panel — the same call
 *   `movement/new.tsx` makes for "Set out".
 * - **"altered in the Citadel later" → "in The Sanctum later."** The Sanctum is where these two
 *   settings actually live; the Citadel is only the door to it.
 *
 * `IntroOverlay` plays over the whole stack on the first launch of a JS context, so on a genuine
 * first install it plays *over* this screen. That is what being above the stack means, and it is
 * written down here so nobody reads it as a bug and removes one of the two ceremonies.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Chip, Meander, Notice } from '@/components/Layout';
import { KairoMark } from '@/components/Logo';
import { LOCAL_USER_ID } from '@/constants';
import {
  getUnitSystem,
  getWeekStart,
  setOnboardingComplete,
  setUnitSystem,
  setWeekStart,
  type UnitSystem,
  type WeekStart,
} from '@/db/preferences';
import { mediaLibraryAvailable } from '@/services/mediaLibrary';
import { notificationsMode } from '@/services/notifications';
import { IS_EXPO_GO } from '@/services/runtime';
import {
  colors,
  fontSize,
  layout,
  lineHeight,
  radius,
  spacing,
  type as typeScale,
} from '@/theme';

const PANEL_COUNT = 3;

export default function GatesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  /**
   * A panel is exactly one page wide and one page tall, in points, because neither can be had from
   * flexbox here.
   *
   * The width cannot be `flex: 1`: a horizontal `ScrollView` lays its content out as a row, so
   * `flex` would size the panels *along the scroll axis* and all three would collapse onto one
   * page. `pagingEnabled` also snaps to multiples of the scroll view's own width, so the number
   * used here has to be that width and not the window's — they differ in landscape on a notched
   * phone, and a paging offset that is off by the inset drifts one inset per swipe.
   *
   * The height cannot be inherited either: the panels have to be as tall as the page for the button
   * to sit at the bottom of each one, and a percentage against a content container that is itself
   * sized by its children resolves to nothing.
   *
   * So: seed from the window, then correct from the real frame on first layout.
   */
  const [page, setPage] = useState({ width: windowSize.width, height: windowSize.height });
  const scrollRef = useRef<ScrollView>(null);

  const [panel, setPanel] = useState(0);
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [weekStart, setWeek] = useState<WeekStart>('monday');
  const [error, setError] = useState<string | null>(null);
  const [crossing, setCrossing] = useState(false);

  /** What this runtime can do. Both are synchronous shape checks over an already-cached require. */
  const notifications = notificationsMode();
  const photos = mediaLibraryAvailable();

  /**
   * Seed the two controls from whatever is stored. On a true first launch both keys are unset and
   * the getters return their defaults, so this is a no-op — but The Gates can be walked again after
   * a raze in The Sanctum, and then the stored values are the ones to show.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedUnits, storedWeek] = await Promise.all([
          getUnitSystem(db, LOCAL_USER_ID),
          getWeekStart(db, LOCAL_USER_ID),
        ]);
        if (cancelled) return;
        setUnits(storedUnits);
        setWeek(storedWeek);
      } catch {
        // The defaults above are already correct for a first launch; a read failure here does not
        // deserve a notice on the welcome screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const goTo = useCallback(
    (index: number) => {
      // Optimistic, so the dots move with the button rather than after the animation lands.
      setPanel(index);
      scrollRef.current?.scrollTo({ x: index * page.width, animated: true });
    },
    [page.width],
  );

  /**
   * The real page size, from the scroll view's own frame. Guarded on a change: `onLayout` fires on
   * every re-layout, and setting an identical object would re-render forever.
   */
  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    if (width === page.width && height === page.height) return;
    setPage({ width, height });
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / page.width);
    setPanel(Math.max(0, Math.min(PANEL_COUNT - 1, next)));
  }

  /** Optimistic, like The Compass's units row: a control that waits on SQLite feels broken. */
  const chooseUnits = useCallback(
    async (next: UnitSystem) => {
      setUnits(next);
      try {
        await setUnitSystem(db, LOCAL_USER_ID, next);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [db],
  );

  const chooseWeekStart = useCallback(
    async (next: WeekStart) => {
      setWeek(next);
      try {
        await setWeekStart(db, LOCAL_USER_ID, next);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [db],
  );

  /**
   * The only way out. `replace`, not `push`: The Gates must not sit under the Citadel in the stack.
   *
   * If the write fails the user is kept here rather than let through — walking the gates again is a
   * minor annoyance, whereas a Citadel whose onboarding flag never landed would send them back
   * through on every launch with no way to say so.
   */
  async function crossTheThreshold() {
    setCrossing(true);
    try {
      await setOnboardingComplete(db, LOCAL_USER_ID);
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setCrossing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={onLayout}
        onMomentumScrollEnd={onScrollEnd}
      >
        {/* PANEL 1 — the mark. `KairoMark`'s interior is opaque `colors.background`, so it sits on
            the screen rather than inside a card, exactly as in the Citadel's brand block. */}
        <Panel page={page} insetTop={insets.top} insetBottom={insets.bottom}>
          <View style={styles.welcome}>
            <KairoMark height={120} />
            <Text style={styles.wordmark}>KAIRO</Text>
            <Text style={styles.tagline}>One app for the work you owe yourself.</Text>
          </View>
          <View style={styles.foot}>
            <Meander />
            <Button label="Enter" onPress={() => goTo(1)} />
          </View>
        </Panel>

        {/* PANEL 2 — the measures. */}
        <Panel page={page} insetTop={insets.top} insetBottom={insets.bottom}>
          <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelBody}>
            <PanelHeading
              title="The Measures"
              body="Set the metrics of your discipline. Both can be altered in The Sanctum later."
            />

            {error ? (
              <Notice tone="danger" title="The setting was not saved">
                {error}
              </Notice>
            ) : null}

            <View style={styles.measures}>
              <View style={styles.measure}>
                <Text style={styles.measureLabel}>Units</Text>
                <View style={styles.choiceRow}>
                  <Chip
                    label="Metric"
                    selected={units === 'metric'}
                    onPress={() => void chooseUnits('metric')}
                    style={styles.choice}
                  />
                  <Chip
                    label="Imperial"
                    selected={units === 'imperial'}
                    onPress={() => void chooseUnits('imperial')}
                    style={styles.choice}
                  />
                </View>
                {/* One choice covers both, so it says so — otherwise a user who wanted pounds has
                    no way to know they have also chosen miles. */}
                <Text style={styles.measureNote}>
                  {units === 'metric'
                    ? 'Kilograms on The Scales, kilometres on The March.'
                    : 'Pounds on The Scales, miles on The March.'}
                </Text>
              </View>

              <View style={styles.rule} />

              <View style={styles.measure}>
                <Text style={styles.measureLabel}>Week starts</Text>
                <View style={styles.choiceRow}>
                  <Chip
                    label="Monday"
                    selected={weekStart === 'monday'}
                    onPress={() => void chooseWeekStart('monday')}
                    style={styles.choice}
                  />
                  <Chip
                    label="Sunday"
                    selected={weekStart === 'sunday'}
                    onPress={() => void chooseWeekStart('sunday')}
                    style={styles.choice}
                  />
                </View>
                <Text style={styles.measureNote}>
                  Which day The Annals reckon a week from.
                </Text>
              </View>
            </View>
          </ScrollView>
          <View style={styles.foot}>
            <Button label="Continue" onPress={() => goTo(2)} />
          </View>
        </Panel>

        {/* PANEL 3 — the gatekeepers. Nothing here requests anything; it says what will be asked
            for and when, so the OS prompt later arrives with a reason already attached. */}
        <Panel page={page} insetTop={insets.top} insetBottom={insets.bottom}>
          <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelBody}>
            <PanelHeading
              title="The Gatekeepers"
              body="Kairo asks for each of these the first time it needs it — nothing is requested now."
            />

            <View style={styles.gates}>
              <GateRow
                icon="bell-outline"
                title="Reminders"
                body="So The Call can sound for a rite."
                note={
                  notifications === 'unavailable'
                    ? 'Not available in this build. Calls are saved, but they only sound in a development build.'
                    : notifications === 'local-only'
                      ? 'Local reminders only in Expo Go.'
                      : 'Asked when you set your first call.'
                }
                degraded={notifications !== 'full'}
              />
              <GateRow
                icon="map-marker-outline"
                title="Location"
                body="So The March can trace the path you forge."
                note={
                  IS_EXPO_GO
                    ? 'Expo Go records only while Kairo is open. Background recording needs the development build.'
                    : 'Asked when you set out on your first journey.'
                }
                degraded={IS_EXPO_GO}
              />
              <GateRow
                icon="image-outline"
                title="Photos"
                body="So The Oracle can save a wallpaper to your library."
                note={
                  photos
                    ? 'Asked when you first save an image.'
                    : 'Not available in this build — saving needs a development build.'
                }
                degraded={!photos}
              />
            </View>
          </ScrollView>
          <View style={styles.foot}>
            {error ? (
              <Notice tone="danger" title="Could not open the gates">
                {error}
              </Notice>
            ) : null}
            <Button
              label="Cross the threshold"
              onPress={() => void crossTheThreshold()}
              loading={crossing}
            />
          </View>
        </Panel>
      </ScrollView>

      {/*
        The dots are decorative and unreachable by touch, so they are collapsed into one
        accessible element that says the same thing a sighted user reads off them.
      */}
      <View
        style={[styles.dots, { bottom: insets.bottom + spacing.lg }]}
        pointerEvents="none"
        accessible
        accessibilityLabel={`Step ${panel + 1} of ${PANEL_COUNT}`}
      >
        {Array.from({ length: PANEL_COUNT }, (_, index) => (
          <View key={index} style={[styles.dot, index === panel && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

/**
 * One page: a full window's width, its own safe-area padding, and a body that grows so the button
 * sits at the bottom of every panel rather than under whatever content happens to be above it.
 */
function Panel({
  page,
  insetTop,
  insetBottom,
  children,
}: {
  page: { width: number; height: number };
  insetTop: number;
  insetBottom: number;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        styles.panel,
        {
          width: page.width,
          height: page.height,
          paddingTop: insetTop + spacing.xxl,
          // Clears the home indicator and leaves the dot row its own band underneath the button.
          paddingBottom: insetBottom + spacing.xxl + spacing.lg,
        },
      ]}
    >
      {children}
    </View>
  );
}

/** A panel's name and its one line of explanation, ruled off from the content below. */
function PanelHeading({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.headingTitle}>{title}</Text>
      <Text style={styles.headingBody}>{body}</Text>
      <View style={styles.rule} />
    </View>
  );
}

/**
 * One permission: what it is for, and what this runtime will actually do about it.
 *
 * A degraded row is `warning`-toned rather than dimmed. Dimming the row that carries the caveat is
 * the readability problem this rebuild exists to fix.
 */
function GateRow({
  icon,
  title,
  body,
  note,
  degraded,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  body: string;
  note: string;
  degraded: boolean;
}) {
  return (
    <View style={styles.gate}>
      <View style={styles.gateIcon}>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={degraded ? colors.warning : colors.accent}
        />
      </View>
      <View style={styles.gateMain}>
        <Text style={styles.gateTitle}>{title}</Text>
        <Text style={styles.gateBody}>{body}</Text>
        <Text style={[styles.gateNote, degraded && styles.gateNoteDegraded]}>{note}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  panel: {
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    gap: layout.sectionGap,
  },
  /**
   * The scrolling region inside a panel. It takes the space the footer does not, and its content
   * grows to fill that — so a short panel still puts its heading at the top, and a long one (large
   * system font, a small phone) scrolls instead of clipping.
   */
  panelScroll: { flex: 1 },
  panelBody: { flexGrow: 1, gap: layout.sectionGap },
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: layout.cardGap },
  wordmark: { color: colors.text, ...typeScale.displayMd, textAlign: 'center' },
  tagline: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    textAlign: 'center',
    maxWidth: 280,
  },
  foot: { gap: layout.cardGap },
  heading: { gap: spacing.sm },
  headingTitle: { color: colors.accent, ...typeScale.headlineSm },
  headingBody: { color: colors.textMuted, fontSize: fontSize.md, lineHeight: lineHeight.md },
  rule: { height: 1, backgroundColor: colors.border },
  measures: { gap: layout.sectionGap },
  measure: { gap: spacing.md },
  measureLabel: { color: colors.text, ...typeScale.label },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1 },
  measureNote: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  gates: { gap: layout.cardGap },
  gate: {
    flexDirection: 'row',
    gap: layout.cardPadding,
    padding: layout.cardPadding,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  gateIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
  },
  /** `flex: 1` so the note wraps inside the card instead of pushing the tile off the edge. */
  gateMain: { flex: 1, gap: spacing.xs },
  gateTitle: { color: colors.text, ...typeScale.label },
  gateBody: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  gateNote: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  gateNoteDegraded: { color: colors.warning },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent },
});
