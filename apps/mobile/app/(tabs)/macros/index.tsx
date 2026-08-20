/**
 * The Feast — the day's offerings, and the four stores they fill.
 *
 * Three departures from `5.10_the_feast`, each because the design is a `max-w-2xl` page and this is
 * a phone:
 *
 * - **The day chevrons are their own strip, not the header.** The design flanks `THE FEAST` with a
 *   chevron either side and hangs the date underneath. `ScreenHeader` has one action slot, and the
 *   screen's action is adding an offering — so the day walk becomes a ruled strip directly below,
 *   which is also the only arrangement where the date has room to be spelled out.
 * - **An empty meal is not drawn.** `groupByMeal` returns all four so a caller *can* offer an add
 *   per meal, but four titled empty cards is four rows of furniture; The Offering picks its own
 *   meal, defaulting by the hour, so nothing is unreachable. Same rule as The Forge's aggregate
 *   strip: a section renders when it has something to say.
 * - **No per-meal add.** Neither has the design — that was mine, and one `+` in the header is the
 *   convention the tasks module set.
 *
 * The four stores card is pressable as a whole and leads to The Decree, which is the honest target:
 * the card is a reading of progress against the decree, so the thing you want when you tap it is the
 * decree. That is why there is no second header action for it.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  CardAction,
  CardHeader,
  EmptyState,
  Eyebrow,
  IconButton,
  Notice,
  ProgressBar,
  RowGroup,
  Screen,
  ScreenHeader,
  ScreenScroll,
  Section,
} from '@/components/Layout';
import { LOCAL_USER_ID } from '@/constants';
import {
  deleteNutritionEntry,
  getMacroTargetForDate,
  listNutritionEntriesForDate,
} from '@/db/macros';
import type { MacroTarget, MealType, NutritionEntryWithFood } from '@/db/types';
import { dayKeyFromNumber, relativeDayLabel, todayNumber } from '@/domain/dates';
import {
  describeEntry,
  formatMealHeading,
  formatRemaining,
  formatStore,
  groupByMeal,
  type MacroMetric,
  MACRO_LABELS,
  nutritionFor,
  summariseMacros,
} from '@/domain/macros';
import { requestSync } from '@/sync/scheduler';
import { chartColors, colors, fontSize, layout, lineHeight, spacing, type as typeScale } from '@/theme';

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  // Midday, so a timezone offset either way cannot roll the date over.
  return new Date(year, month - 1, day, 12);
}

/** "Today · Monday 18 August", or the date alone for a day with no relative name. */
function formatFeastDay(day: number, today: number): string {
  const spelled = dateFromKey(dayKeyFromNumber(day)).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const relative = relativeDayLabel(day, today);
  return relative ? `${relative} · ${spelled}` : spelled;
}

/**
 * One store's fill: its name, the figures, and the bar.
 *
 * `size="hero"` is the Caloric Forge at the top of the card — a display figure with its target
 * trailing it and the remainder on the right. The other three are one line and a 6px rule, which is
 * what makes the calorie total read as the headline and the macros as its breakdown.
 */
function StoreRow({
  label,
  metric,
  unit,
  color,
  size = 'compact',
}: {
  label: string;
  metric: MacroMetric;
  unit: 'kcal' | 'g';
  color: string;
  size?: 'hero' | 'compact';
}) {
  const remaining = formatRemaining(metric, unit);
  if (size === 'hero') {
    return (
      <View style={styles.store}>
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Eyebrow>{label}</Eyebrow>
            <Text style={[styles.heroValue, metric.overTarget && styles.over]}>
              {formatStore(metric, unit)}
            </Text>
          </View>
          {remaining ? (
            <Text style={[styles.heroRemaining, metric.overTarget && styles.over]}>{remaining}</Text>
          ) : null}
        </View>
        <ProgressBar value={metric.fillRatio} max={1} color={color} height={10} />
      </View>
    );
  }
  return (
    <View style={styles.store}>
      <View style={styles.compactRow}>
        <Eyebrow>{label}</Eyebrow>
        <Text style={[styles.compactValue, metric.overTarget && styles.over]}>
          {formatStore(metric, unit)}
        </Text>
      </View>
      <ProgressBar value={metric.fillRatio} max={1} color={color} height={6} />
    </View>
  );
}

/** One logged offering. Long-press removes it, which the footnote under the log says out loud. */
function EntryRow({
  entry,
  onDelete,
}: {
  entry: NutritionEntryWithFood;
  onDelete: () => void;
}) {
  const value = nutritionFor(entry.food, entry.quantity);
  return (
    <Pressable
      onLongPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={`${entry.food.name}. ${describeEntry(entry)}`}
      accessibilityHint="Long press to remove this offering"
      style={({ pressed }) => [styles.entryRow, pressed && styles.entryRowPressed]}
    >
      <View style={styles.entryMain}>
        <Text style={styles.entryName} numberOfLines={1}>
          {entry.food.name}
        </Text>
        <Text style={styles.entryDetail} numberOfLines={1}>
          {describeEntry(entry)}
        </Text>
      </View>
      <Text style={styles.entryCalories}>{`${Math.round(value.calories)} kcal`}</Text>
    </Pressable>
  );
}

export default function FeastScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [selectedDay, setSelectedDay] = useState(() => todayNumber(Date.now()));
  const [today, setToday] = useState(() => todayNumber(Date.now()));
  const [entries, setEntries] = useState<NutritionEntryWithFood[]>([]);
  const [target, setTarget] = useState<MacroTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const date = dayKeyFromNumber(selectedDay);
    try {
      const [rows, effectiveTarget] = await Promise.all([
        listNutritionEntriesForDate(db, LOCAL_USER_ID, date),
        getMacroTargetForDate(db, LOCAL_USER_ID, date),
      ]);
      setEntries(rows);
      setTarget(effectiveTarget);
      setToday(todayNumber(Date.now()));
      setError(null);
    } catch (caught) {
      // Without this the rejection was unhandled and the day sat empty with no explanation.
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
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
  const groups = groupByMeal(entries).filter((group) => group.entries.length > 0);

  const openOffering = useCallback(
    (meal?: MealType) => {
      router.push({ pathname: '/macros/add', params: { date: dateKey, ...(meal ? { meal } : {}) } });
    },
    [dateKey, router],
  );

  const onDelete = useCallback(
    (entry: NutritionEntryWithFood) => {
      Alert.alert('Remove this offering', `Take ${entry.food.name} off this day?`, [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteNutritionEntry(db, entry.id, LOCAL_USER_ID);
                void requestSync(db).catch(() => {});
                await load();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : String(caught));
              }
            })();
          },
        },
      ]);
    },
    [db, load],
  );

  return (
    <Screen>
      <ScreenScroll>
        <ScreenHeader
          title="The Feast"
          action={
            <IconButton
              icon="plus"
              label="Make an offering"
              variant="outlined"
              onPress={() => openOffering()}
            />
          }
        />

        {/* The day walk. Forward stops at today: there is nothing to log against a day not lived. */}
        <View style={styles.dayStrip}>
          <IconButton
            icon="chevron-left"
            label="The day before"
            onPress={() => setSelectedDay((day) => day - 1)}
          />
          <Text style={styles.dayLabel} numberOfLines={1}>
            {formatFeastDay(selectedDay, today)}
          </Text>
          <IconButton
            icon="chevron-right"
            label="The day after"
            disabled={selectedDay >= today}
            onPress={() => setSelectedDay((day) => Math.min(day + 1, today))}
          />
        </View>

        {error ? (
          <Notice tone="danger" title="Could not read this day">
            {error}
          </Notice>
        ) : null}

        <Pressable
          onPress={() => router.push('/macros/targets')}
          accessibilityRole="button"
          accessibilityLabel={target ? 'Amend the decree' : 'Issue a decree'}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Card>
            <CardHeader
              title="The four stores"
              action={<CardAction label={target ? 'The decree' : 'Issue one'} />}
            />
            <StoreRow
              size="hero"
              label={MACRO_LABELS.calories}
              metric={summary.calories}
              unit="kcal"
              color={colors.accent}
            />
            <StoreRow
              label={MACRO_LABELS.protein}
              metric={summary.protein}
              unit="g"
              color={chartColors.protein}
            />
            <StoreRow
              label={MACRO_LABELS.carbs}
              metric={summary.carbs}
              unit="g"
              color={chartColors.carbs}
            />
            <StoreRow
              label={MACRO_LABELS.fat}
              metric={summary.fat}
              unit="g"
              color={chartColors.fat}
            />
          </Card>
        </Pressable>

        {groups.map((group) => (
          <Section
            key={group.mealType}
            title={formatMealHeading(group.mealType)}
            action={
              <Text style={styles.mealTotal}>{`${Math.round(group.totals.calories)} kcal`}</Text>
            }
          >
            <RowGroup>
              {group.entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onDelete={() => onDelete(entry)} />
              ))}
            </RowGroup>
          </Section>
        ))}

        {entries.length > 0 ? (
          <Text style={styles.footnote}>Long-press an offering to remove it.</Text>
        ) : null}

        {entries.length === 0 && !loading && !error ? (
          <EmptyState
            title="The table is bare"
            body="Nothing has been offered on this day. Log what you eat and the four stores keep themselves."
          />
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Ruled top and bottom, so the walk reads as a control strip rather than as a line of text. */
  dayStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    ...typeScale.label,
    fontWeight: '600',
  },
  store: { gap: spacing.sm },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  heroText: { flexShrink: 1, gap: spacing.xs },
  heroValue: { color: colors.accent, ...typeScale.displayMd },
  heroRemaining: { color: colors.textMuted, ...typeScale.label, fontVariant: ['tabular-nums'] },
  compactRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  compactValue: { color: colors.textMuted, ...typeScale.label, fontVariant: ['tabular-nums'] },
  /** Past the decree, the figure and its remainder go red. The bar cannot — it is capped at full. */
  over: { color: colors.danger },
  mealTotal: { color: colors.textMuted, ...typeScale.eyebrow, fontVariant: ['tabular-nums'] },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: layout.rowPadding,
  },
  entryRowPressed: { backgroundColor: colors.surfaceRaised },
  entryMain: { flex: 1, gap: 2 },
  entryName: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  entryDetail: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  entryCalories: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  footnote: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
