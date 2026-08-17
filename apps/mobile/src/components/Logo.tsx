/**
 * Kairo's mark, and the two places it appears as motion: the loader and the intro.
 *
 * The artwork is a bitmap (`assets/logo.png`, derived from `assets/source/kairo-mark.png` by
 * `scripts/generate-icons.py`), which decides how it can be animated. Two things follow from what
 * it is:
 *
 * It is a helmet — a figure with a top and a bottom, no radial symmetry — so it must never be
 * rotated. A spinning logo reads as a rendering fault, not as progress. The loader therefore holds
 * the mark still and turns a ring around it, and the ring is drawn in SVG so it stays crisp at
 * every size the bitmap is shown at.
 *
 * Its interior detail is opaque black rather than transparency, recoloured to `colors.background`
 * when the asset is generated. That is why these components must sit on `background` and not on a
 * card: on a lighter surface the interior would show as dark patches.
 */

import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import logo from '../../assets/logo.png';
import { colors, fontSize, layout, lineHeight, spacing } from '@/theme';

/** Width ÷ height of the trimmed artwork. Hard-coded so layout does not wait on image metadata. */
const ASPECT = 296 / 512;

/**
 * One `Animated.Value` for the life of the component.
 *
 * `useState` with an initialiser rather than `useRef(new Animated.Value(0)).current`: the value is
 * read during render (it goes into a style prop), and reading a ref during render is what
 * `react-hooks/refs` forbids — correctly, since a ref is for things render does not depend on. The
 * setter is never called, so this is a create-once slot, not state that changes.
 */
function useAnimatedValue(initial: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initial));
  return value;
}

export function KairoMark({ height = 96 }: { height?: number }) {
  return (
    <Image
      source={logo}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      style={{ height, width: height * ASPECT }}
    />
  );
}

export function KairoWordmark({ size = fontSize.xl }: { size?: number }) {
  return <Text style={[styles.wordmark, { fontSize: size }]}>KAIRO</Text>;
}

/**
 * The mark inside a turning ring.
 *
 * Replaces `ActivityIndicator` wherever Kairo is waiting on something of its own — opening the
 * database, generating a wallpaper — so a wait is recognisably the app working rather than an
 * anonymous platform spinner. Keep using `ActivityIndicator` inside `Button`, where the spinner
 * has to sit in a 56px control and read as "this button is busy".
 */
export function LogoLoader({ size = 96 }: { size?: number }) {
  const spin = useAnimatedValue(0);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  // Drawn in a 100-unit box and scaled by `size`, so the stroke stays proportional.
  const radius = 46;
  const stroke = 3.5;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={radius} fill="none" stroke={colors.border} strokeWidth={stroke} />
          <Circle
            cx={50}
            cy={50}
            r={radius}
            fill="none"
            stroke={colors.accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.24} ${circumference}`}
          />
        </Svg>
      </Animated.View>
      {/* 0.62 of the ring's diameter: the mark is tall, so its height is what has to clear it. */}
      <KairoMark height={size * 0.62} />
    </View>
  );
}

/** A whole screen that is waiting. The `Suspense` fallback while the database opens. */
export function AppLoader({ label }: { label?: string }) {
  return (
    <View style={styles.full}>
      <LogoLoader />
      {label ? <Text style={styles.loaderLabel}>{label}</Text> : null}
    </View>
  );
}

/**
 * The intro, played over the app once the first frame is ready.
 *
 * It renders as an overlay rather than a gate: the navigation tree and the database open behind
 * it, so the animation costs nothing in time to interactive. It fades in, holds, fades out, and
 * unmounts itself — there is no way to leave it on screen, which matters because it covers the
 * whole app while it is up.
 *
 * The mark rises and settles rather than spinning, for the reason in the module comment.
 */
export function IntroOverlay({ onFinish }: { onFinish?: () => void }) {
  const enter = useAnimatedValue(0);
  const fade = useAnimatedValue(1);

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(enter, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(460),
      Animated.timing(fade, {
        toValue: 0,
        duration: 340,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onFinish?.();
    });
    return () => animation.stop();
  }, [enter, fade, onFinish]);

  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const lift = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <Animated.View style={[styles.full, StyleSheet.absoluteFill, { opacity: fade }]}>
      <Animated.View
        style={[
          styles.introStack,
          { opacity: enter, transform: [{ translateY: lift }, { scale }] },
        ]}
      >
        <KairoMark height={132} />
        <KairoWordmark />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: layout.screenPadding,
    gap: spacing.xl,
  },
  introStack: { alignItems: 'center', gap: spacing.xl },
  wordmark: {
    color: colors.text,
    fontWeight: '800',
    letterSpacing: 8,
    // Letter spacing is applied after the last glyph too, which pushes the word visibly
    // off-centre; half of it back as padding puts the optical centre where it belongs.
    paddingLeft: 8,
  },
  loaderLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
});
