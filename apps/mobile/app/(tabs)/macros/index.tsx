/** Daily nutrition log, grouped by meal with calorie and macro progress against targets. */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { LOCAL_USER_ID } from '@/constants';
import {
  deleteNutritionEntry,
  getMacroTargetForDate,
  listNutritionEntriesForDate,
} from '@/db/macros';
import type { MealType, NutritionEntryWithFood } from '@/db/types';
import { dayKeyFromNumber, todayNumber } from '@/domain/dates';
import {
  formatNutrition,
  formatServing,
  groupByMeal,
  type MacroMetric,
  nutritionFor,
  summariseMacros,
} from '@/domain/macros';
import { colors, fontSize, radius, spacing, TAP_TARGET } from '@/theme';
import { requestSync } from '@/sync/scheduler';

const MACRO_COLORS = {
  calories: colors.accent,
  protein: colors.success,
  carbs: '#58A6FF',
  fat: '#D29922',
} as const;

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDay(day: number, today: number): string {
  if (day === today) return 'Today';
  if (day === today - 1) return 'Yesterday';
  return dateFromKey(dayKeyFromNumber(day)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function MacroLogScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedDay, setSelectedDay] = useState(() => todayNumber(Date.now()));
  const [today, setToday] = useState(() => todayNumber(Date.now()));
  const [entries, setEntries] = useState<NutritionEntryWithFood[]>([]);
  const [target, setTarget] = useState<Awaited<ReturnType<typeof getMacroTargetForDate>>>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const date = dayKeyFromNumber(selectedDay);
    const [rows, effectiveTarget] = await Promise.all([
      listNutritionEntriesForDate(db, LOCAL_USER_ID, date),
      getMacroTargetForDate(db, LOCAL_USER_ID, date),
    ]);
    setEntries(rows);
    setTarget(effectiveTarget);
    setToday(todayNumber(Date.now()));
    setLoading(false);
  }, [db, selectedDay]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!cancelled) await load();
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const dateKey = dayKeyFromNumber(selectedDay);
  const summary = summariseMacros(entries, target);
  const groups = groupByMeal(entries);

  const openAdd = useCallback(
    (meal?: MealType) => {
      router.push({ pathname: '/macros/add', params: { date: dateKey, ...(meal ? { meal } : {}) } });
    },
    [dateKey, router],
  );

  const onDelete = useCallback(
    (entry: NutritionEntryWithFood) => {
      Alert.alert('Delete entry', `Remove ${entry.food.name} from this day?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteNutritionEntry(db, entry.id, LOCAL_USER_ID);
            void requestSync(db).catch(() => {});
            await load();
          },
        },
      ]);
    },
    [db, load],
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.dayPicker}>
          <Pressable
            onPress={() => setSelectedDay((day) => day - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            style={({ pressed }) => [styles.dayButton, pressed && styles.pressed]}
          >
            <Text style={styles.dayButtonText}>‹</Text>
          </Pressable>
          <View style={styles.dayTitleArea}>
            <Text style={styles.dayTitle}>{formatDay(selectedDay, today)}</Text>
            <Text style={styles.dayDate}>
              {dateFromKey(dateKey).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectedDay((day) => Math.min(day + 1, today))}
            disabled={selectedDay >= today}
            accessibilityRole="button"
            accessibilityLabel="Next day"
            accessibilityState={{ disabled: selectedDay >= today }}
            style={({ pressed }) => [
              styles.dayButton,
              selectedDay >= today && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.dayButtonText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.summaryPanel}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryEyebrow}>Daily intake</Text>
              <Text style={styles.calorieTotal}>{Math.round(summary.totals.calories)} kcal</Text>
            </View>
            <Pressable
              onPress={() => router.push('/macros/targets')}
              style={({ pressed }) => [styles.targetAction, pressed && styles.pressed]}
            >
              <Text style={styles.targetActionText}>{target ? 'Edit targets' : 'Set targets'}</Text>
            </Pressable>
          </View>
          <ProgressRow label="Calories" metric={summary.calories} color={MACRO_COLORS.calories} unit="kcal" />
          <ProgressRow label="Protein" metric={summary.protein} color={MACRO_COLORS.protein} unit="g" />
          <ProgressRow label="Carbs" metric={summary.carbs} color={MACRO_COLORS.carbs} unit="g" />
          <ProgressRow label="Fat" metric={summary.fat} color={MACRO_COLORS.fat} unit="g" />
        </View>

        {groups.map((group) => (
          <View key={group.mealType} style={styles.mealSection}>
            <View style={styles.mealHeader}>
              <View>
                <Text style={styles.mealTitle}>{group.label}</Text>
                <Text style={styles.mealTotal}>{Math.round(group.totals.calories)} kcal</Text>
              </View>
              <Pressable
                onPress={() => openAdd(group.mealType)}
                accessibilityRole="button"
                accessibilityLabel={`Add food to ${group.label}`}
                style={({ pressed }) => [styles.addMealButton, pressed && styles.pressed]}
              >
                <Text style={styles.addMealText}>+</Text>
              </Pressable>
            </View>

            {group.entries.map((entry) => {
              const value = nutritionFor(entry.food, entry.quantity);
              return (
                <Pressable
                  key={entry.id}
                  onLongPress={() => onDelete(entry)}
                  accessibilityHint="Long press to delete this food entry"
                  style={({ pressed }) => [styles.entryRow, pressed && styles.pressed]}
                >
                  <View style={styles.entryMain}>
                    <Text style={styles.entryName} numberOfLines={1}>{entry.food.name}</Text>
                    <Text style={styles.entryServing} numberOfLines={1}>
                      {formatServing(entry.quantity, entry.food.servingLabel)} · P {value.proteinG.toFixed(1)} · C {value.carbsG.toFixed(1)} · F {value.fatG.toFixed(1)}
                    </Text>
                  </View>
                  <Text style={styles.entryCalories}>{Math.round(value.calories)}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        {entries.length === 0 && !loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing logged</Text>
            <Text style={styles.emptyBody}>Add the foods you eat. Kairo will keep the totals running.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Add food" onPress={() => openAdd()} />
      </View>
    </View>
  );
}

function ProgressRow({
  label,
  metric,
  color,
  unit,
}: {
  label: string;
  metric: MacroMetric;
  color: string;
  unit: 'kcal' | 'g';
}) {
  const consumed = formatNutrition(metric.consumed, unit);
  const target = metric.target === null ? null : formatNutrition(metric.target, unit);
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressLabels}>
        <Text style={styles.progressName}>{label}</Text>
        <Text style={[styles.progressValue, metric.overTarget && styles.progressOver]}>
          {target ? `${consumed} / ${target}` : consumed}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${metric.fillRatio * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  dayPicker: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  dayButton: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  dayButtonText: { color: colors.text, fontSize: fontSize.xl },
  dayTitleArea: { flex: 1, alignItems: 'center' },
  dayTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  dayDate: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
  disabled: { opacity: 0.25 },
  pressed: { opacity: 0.7 },
  summaryPanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryEyebrow: { color: colors.textMuted, fontSize: fontSize.xs, textTransform: 'uppercase' },
  calorieTotal: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', marginTop: spacing.xs },
  targetAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  targetActionText: { color: colors.accent, fontSize: fontSize.sm, fontWeight: '700' },
  progressRow: { gap: spacing.xs },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  progressName: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  progressValue: { color: colors.textMuted, fontSize: fontSize.xs },
  progressOver: { color: colors.danger },
  progressTrack: { height: 7, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  mealSection: { marginTop: spacing.xl },
  mealHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  mealTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  mealTotal: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2, marginBottom: spacing.sm },
  addMealButton: { width: TAP_TARGET, height: TAP_TARGET, alignItems: 'center', justifyContent: 'center' },
  addMealText: { color: colors.accent, fontSize: fontSize.xl, fontWeight: '400' },
  entryRow: { minHeight: TAP_TARGET, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  entryMain: { flex: 1, paddingRight: spacing.md },
  entryName: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  entryServing: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 3 },
  entryCalories: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  emptyBody: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
});
