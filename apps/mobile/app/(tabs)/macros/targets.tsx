/**
 * The Decree — the four figures the day is measured against.
 *
 * A decree is effective-dated, which is the whole reason this screen is not just four boxes: a day
 * already logged was measured against the decree that was standing then, and changing today's must
 * not rewrite last week's verdict. The explainer says so in the design's own words, because they are
 * better than the ones that were here.
 *
 * Departures from `5.12_the_decree`:
 *
 * - **The units are in the labels, not a suffix inside the box.** `Field` has no suffix slot, and
 *   adding one for four inputs on one screen buys less than the label does — "Granary (g)" reads the
 *   same and is what a screen reader says.
 * - **The derived total is named, not just printed.** The design shows the macros' own calorie total
 *   as a line of text and leaves the subtraction to you. It is the only thing here that can tell you
 *   a decree is internally impossible before you spend a week failing to hit it, so `checkDecree`
 *   names the gap. See its tolerance note for why small disagreements stay quiet.
 * - **No Change button on the effective date.** The design offers one; there is no date picker in the
 *   app, and future-dating a decree is a feature, not a restyle. The row states the date instead.
 * - **No Cancel button.** The bar's close glyph is the way out of a modal.
 */

import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import {
  AppBar,
  Card,
  CardHeader,
  Eyebrow,
  Field,
  IconButton,
  Notice,
  ScreenScroll,
  Section,
} from '@/components/Layout';
import { LOCAL_USER_ID } from '@/constants';
import { getMacroTargetForDate, setMacroTarget } from '@/db/macros';
import { dayKeyFromDate } from '@/domain/dates';
import { checkDecree, isValidNutritionNumber, MACRO_LABELS } from '@/domain/macros';
import { parseDecimalInput } from '@/domain/numbers';
import { requestSync } from '@/sync/scheduler';
import { colors, fontSize, layout, lineHeight, spacing, type as typeScale } from '@/theme';

const MAX_CALORIES = 20_000;
const MAX_MACRO_GRAMS = 2_000;

export default function DecreeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const today = dayKeyFromDate(new Date());

  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const target = await getMacroTargetForDate(db, LOCAL_USER_ID, today);
        if (cancelled || !target) return;
        setCalories(String(target.calories));
        setProtein(String(target.proteinG));
        setCarbs(String(target.carbsG));
        setFat(String(target.fatG));
      } catch (caught) {
        // Without this the rejection was unhandled and the form sat blank as though no decree stood,
        // which is the one reading that would make you overwrite one.
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, today]);

  const parsedCalories = parseDecimalInput(calories);
  const parsedProtein = parseDecimalInput(protein);
  const parsedCarbs = parseDecimalInput(carbs);
  const parsedFat = parseDecimalInput(fat);
  const canSave =
    isValidNutritionNumber(parsedCalories, MAX_CALORIES) &&
    parsedCalories > 0 &&
    isValidNutritionNumber(parsedProtein, MAX_MACRO_GRAMS) &&
    isValidNutritionNumber(parsedCarbs, MAX_MACRO_GRAMS) &&
    isValidNutritionNumber(parsedFat, MAX_MACRO_GRAMS);

  const check = checkDecree({
    calories: parsedCalories,
    proteinG: Number.isFinite(parsedProtein) ? parsedProtein : 0,
    carbsG: Number.isFinite(parsedCarbs) ? parsedCarbs : 0,
    fatG: Number.isFinite(parsedFat) ? parsedFat : 0,
  });

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await setMacroTarget(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        calories: parsedCalories,
        proteinG: parsedProtein,
        carbsG: parsedCarbs,
        fatG: parsedFat,
        effectiveDate: today,
        createdAt: new Date().toISOString(),
      });
      void requestSync(db).catch(() => {});
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }, [canSave, db, parsedCalories, parsedCarbs, parsedFat, parsedProtein, router, today]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppBar
        title="The Decree"
        action={<IconButton icon="close" label="Close the decree" onPress={() => router.back()} />}
      />

      <ScreenScroll>
        {error ? (
          <Notice tone="danger" title="The decree was not issued">
            {error}
          </Notice>
        ) : null}

        <Text style={styles.explainer}>
          A decree applies from today forward. Past days keep the decree they were measured against.
        </Text>

        <Section title="The four stores">
          <Card>
            <Field
              label={`${MACRO_LABELS.calories} (kcal)`}
              value={calories}
              onChangeText={setCalories}
              keyboardType="decimal-pad"
              placeholder="0"
              selectTextOnFocus
              autoFocus
            />
            <View style={styles.fieldRow}>
              <Field
                label={`${MACRO_LABELS.protein} (g)`}
                style={styles.fieldCell}
                value={protein}
                onChangeText={setProtein}
                keyboardType="decimal-pad"
                placeholder="0"
                selectTextOnFocus
              />
              <Field
                label={`${MACRO_LABELS.carbs} (g)`}
                style={styles.fieldCell}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="decimal-pad"
                placeholder="0"
                selectTextOnFocus
              />
            </View>
            <Field
              label={`${MACRO_LABELS.fat} (g)`}
              value={fat}
              onChangeText={setFat}
              keyboardType="decimal-pad"
              placeholder="0"
              selectTextOnFocus
            />
          </Card>
        </Section>

        {/* The check on the decree's own arithmetic. Accent-soft rather than a `Notice`: nothing has
            gone wrong here, it is a reading of what you have typed. Held back until there is a macro
            to read — "0 kcal from these macros" on an untouched form is a statement of the obvious. */}
        {check.derived > 0 ? (
          <Card style={styles.derived}>
            <CardHeader title="What the macros come to" tone="accent" />
            <Text style={styles.derivedValue}>{check.summary}</Text>
            {check.divergence ? <Text style={styles.divergence}>{check.divergence}</Text> : null}
          </Card>
        ) : null}

        <View style={styles.effective}>
          <Eyebrow>Effective from</Eyebrow>
          <Text style={styles.effectiveValue}>
            {`Today · ${new Date().toLocaleDateString(undefined, {
              month: 'long',
              day: 'numeric',
            })}`}
          </Text>
        </View>

        <Button
          label="Issue the decree"
          onPress={() => void onSave()}
          disabled={!canSave}
          loading={saving}
        />
      </ScreenScroll>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  explainer: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  fieldRow: { flexDirection: 'row', gap: layout.cardGap },
  fieldCell: { flex: 1 },
  derived: { backgroundColor: colors.accentSoft },
  derivedValue: { color: colors.text, ...typeScale.headlineSm, fontVariant: ['tabular-nums'] },
  divergence: { color: colors.danger, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  effective: {
    gap: spacing.xs,
    paddingTop: layout.cardGap,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  effectiveValue: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
});
