/**
 * The Vow — the target the chart draws a line at.
 *
 * Stored in kg regardless of the unit typed (see `src/db/preferences.ts`), so switching display units
 * later does not silently reinterpret a 75 that meant kilograms as pounds. The toggle here converts
 * on save rather than storing the user's choice alongside it.
 *
 * A vow is device-local on purpose: `user_preferences` has no entity type in `src/sync/outbox.ts`, so
 * there is nothing for `requestSync` to push and calling it here would be a no-op that reads like a
 * promise. A weighing syncs; the line you drew on your own chart does not, yet.
 *
 * Departures from `5.15_the_vow`:
 *
 * - **The insight block has no left rule.** The design draws `border-l-4 border-primary`. In this app
 *   an accent left rule on an accent-soft card means "the one thing in play" — it is The Anvil's card
 *   and nothing else's. A projection is a reading, so it gets The Decree's treatment for the same
 *   kind of block: accent-soft, accent heading, no rule.
 * - **No icons on the buttons.** The design gives them `swords` and `broken_image`. `Button` carries a
 *   label and a loading state and no icon slot, and a glyph slot added for two buttons on one screen
 *   is a component change in service of decoration.
 * - **No Cancel button.** The bar's close glyph is the way out of a modal.
 * - **"About 7 weeks", not "about seven weeks".** See `describeVow`.
 *
 * It loads the whole weight history rather than the one row the old screen needed, because the
 * projection is the point of the screen: the distance needs the trend, and the estimate needs a rate,
 * and both are computed from every weighing.
 */

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import {
  AppBar,
  Card,
  CardHeader,
  Chip,
  IconButton,
  Notice,
  ScreenScroll,
} from '@/components/Layout';
import { LOCAL_USER_ID } from '@/constants';
import { clearGoalWeight, getGoalWeightKg, setGoalWeightKg } from '@/db/preferences';
import type { BodyWeightEntry, WeightUnit } from '@/db/types';
import { listEntriesAscending } from '@/db/weight';
import { parseDecimalInput } from '@/domain/numbers';
import {
  dailyWeights,
  describeVow,
  displayUnit,
  formatWeight,
  movingAverage,
  summarise,
  toDisplayWeight,
  TREND_WINDOW_DAYS,
  weeklyRateKg,
} from '@/domain/weight';
import { toKg } from '@/domain/workouts';
import { colors, fontSize, layout, lineHeight, radius, spacing, type as typeScale } from '@/theme';

const UNITS: WeightUnit[] = ['kg', 'lb'];

const UNIT_NAMES: Record<WeightUnit, string> = { kg: 'Kilograms', lb: 'Pounds' };

const MAX_WEIGHT = 1000;

export default function VowScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [goal, setGoal] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [entries, setEntries] = useState<BodyWeightEntry[]>([]);
  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Captured at load, not read in render — the same purity rule as The Scales' window. */
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The unit follows whatever the user has been logging in, so the field they land on is
        // already in the units they think about their weight in.
        const [existing, rows] = await Promise.all([
          getGoalWeightKg(db, LOCAL_USER_ID),
          listEntriesAscending(db, LOCAL_USER_ID),
        ]);
        if (cancelled) return;
        const preferred = displayUnit(rows);
        setEntries(rows);
        setUnit(preferred);
        setNowMs(Date.now());
        if (existing !== null) {
          setGoal(String(toDisplayWeight(existing, preferred)));
          setHasExisting(true);
        }
      } catch (caught) {
        // Without this the rejection was unhandled and the form sat blank as though no vow stood,
        // which is the one reading that would make you overwrite one.
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const parsed = parseDecimalInput(goal);
  const canSave = Number.isFinite(parsed) && parsed > 0 && parsed < MAX_WEIGHT;

  const daily = dailyWeights(entries);
  const trend = movingAverage(daily, TREND_WINDOW_DAYS);
  const summary = summarise(daily, trend, nowMs);

  /**
   * The projection, against the figure in the box rather than the one on disk — so it moves as you
   * type and you can see what a vow means before you swear it.
   */
  const projection = describeVow({
    goalKg: canSave ? toKg(parsed, unit) : null,
    trendKg: summary.trendKg,
    rateKgPerWeek: weeklyRateKg(trend, nowMs),
    unit,
  });

  // Neither of these is wrapped in `useCallback`, for the reason set out at length in
  // `macros/add.tsx`: they are reached through an arrow that is new every render anyway, and a dep
  // array built from `parsed` is one the React Compiler cannot prove is still valid.
  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await setGoalWeightKg(db, LOCAL_USER_ID, toKg(parsed, unit));
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    try {
      await clearGoalWeight(db, LOCAL_USER_ID);
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppBar
        title="The Vow"
        action={<IconButton icon="close" label="Close the vow" onPress={() => router.back()} />}
      />

      <ScreenScroll>
        {error ? (
          <Notice tone="danger" title="The vow was not sworn">
            {error}
          </Notice>
        ) : null}

        <Text style={styles.explainer}>A vow draws a line on the chart. It changes nothing else.</Text>

        <View style={styles.hero}>
          <TextInput
            style={styles.heroInput}
            value={goal}
            onChangeText={setGoal}
            keyboardType="decimal-pad"
            selectTextOnFocus
            autoFocus
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Vow weight"
          />
          <View style={styles.unitRow}>
            {UNITS.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={unit === option}
                onPress={() => setUnit(option)}
                accessibilityLabel={UNIT_NAMES[option]}
                style={styles.unitChip}
              />
            ))}
          </View>
        </View>

        {/*
          Exactly one of these three always renders: the projection once there is a figure and a
          trend to measure it against, and otherwise the reason there is no projection. A vow typed
          against a blank chart is the case worth explaining, not hiding.
        */}
        {projection ? (
          <Card style={styles.insight}>
            <CardHeader title="What the vow comes to" tone="accent" />
            <Text style={styles.distance}>{projection.distance}</Text>
            {projection.eta ? <Text style={styles.eta}>{projection.eta}</Text> : null}
          </Card>
        ) : summary.trendKg === null ? (
          <Text style={styles.hint}>
            Nothing has been weighed yet, so there is no trend to measure a vow against.
          </Text>
        ) : (
          <Text style={styles.hint}>
            {`Your trend today is ${formatWeight(summary.trendKg, unit)}.`}
          </Text>
        )}

        <Button
          label="Swear the vow"
          onPress={() => void onSave()}
          disabled={!canSave}
          loading={saving}
        />
        {hasExisting ? (
          <Button label="Break the vow" variant="danger" onPress={() => void onClear()} />
        ) : null}
      </ScreenScroll>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  explainer: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  hero: { gap: layout.cardGap },
  /** The same big-number input as The Weighing; see its note on why this is not a `Field`. */
  heroInput: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.accent,
    ...typeScale.timer,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
  },
  unitRow: { flexDirection: 'row', gap: spacing.sm },
  unitChip: { flex: 1 },
  insight: { backgroundColor: colors.accentSoft },
  distance: { color: colors.text, ...typeScale.headlineSm },
  eta: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    textAlign: 'center',
  },
});
