/**
 * The Weighing — one number, once a morning.
 *
 * The interaction budget is a single weigh-in per day, so the field arrives pre-filled with the last
 * logged weight and unit (the same reasoning as `suggestNextSet` in the workouts module: yesterday's
 * number is a nudge away from today's, where an empty field is a full keyboard entry every day).
 * `autoFocus` and `selectTextOnFocus` mean typing over it is immediate.
 *
 * Departures from `5.14_the_weighing`:
 *
 * - **The kg/lb toggle sits under the number, not beside it.** The design draws an inline pill. A
 *   chip is a 56pt tap target, and two of them stacked beside a 56pt digit is 120pt of column next
 *   to a 70pt figure. Under it, full width, is The Anvil's arrangement for the same control.
 * - **No Change button on the time.** The design offers one; there is no time picker in the app, and
 *   back-dating a weighing is a feature rather than a restyle. The row states the instant instead —
 *   and states it truthfully, because that instant is what gets written. See `openedAt`.
 * - **No Cancel button.** The bar's close glyph is the way out of a modal.
 *
 * The separator in the When row is " · ", not the design's comma: it is what The Decree's effective
 * date already uses, and one screen writing "Today, 07:12" beside another writing "Today · 19
 * August" is two conventions for one idea.
 */

import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import {
  AppBar,
  Chip,
  Eyebrow,
  Field,
  Fluting,
  IconButton,
  Notice,
  ScreenScroll,
} from '@/components/Layout';
import { LOCAL_USER_ID } from '@/constants';
import type { WeightUnit } from '@/db/types';
import { addEntry, latestEntry } from '@/db/weight';
import { parseDecimalInput } from '@/domain/numbers';
import { requestSync } from '@/sync/scheduler';
import { colors, fontSize, layout, lineHeight, radius, spacing, type as typeScale } from '@/theme';

const UNITS: WeightUnit[] = ['kg', 'lb'];

const UNIT_NAMES: Record<WeightUnit, string> = { kg: 'Kilograms', lb: 'Pounds' };

/** A sanity bound, not a medical one — it only catches a slipped decimal point. */
const MAX_WEIGHT = 1000;

export default function WeighingScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The instant this weighing is recorded at, captured when the sheet opens rather than when Save is
   * pressed.
   *
   * Two reasons, and they agree. It is the honest timestamp — the measurement happened when you
   * stepped on the scale, not when you finished typing a note — and it is what lets the When row
   * below promise a time without lying about it. `new Date()` in a render body would be impure, and
   * a sheet left open for an hour would then record an hour it did not measure.
   */
  const [openedAt] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const previous = await latestEntry(db, LOCAL_USER_ID);
        if (cancelled || !previous) return;
        setWeight(String(previous.weight));
        setUnit(previous.weightUnit);
      } catch (caught) {
        // Without this the rejection was unhandled and the field sat empty as though there were no
        // history, which is also the state in which the unit silently reverts to kg.
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const parsed = parseDecimalInput(weight);
  const canSave = Number.isFinite(parsed) && parsed > 0 && parsed < MAX_WEIGHT;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await addEntry(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        // Stored as an instant, not a date: the trend groups by calendar day itself, and the time of
        // day is worth keeping — weight before breakfast and weight after dinner are different
        // measurements.
        recordedAt: openedAt.toISOString(),
        weight: parsed,
        weightUnit: unit,
        note: note.trim() === '' ? null : note.trim(),
      });
      void requestSync(db).catch(() => {});
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppBar
        title="The Weighing"
        action={<IconButton icon="close" label="Close the weighing" onPress={() => router.back()} />}
      />

      <ScreenScroll>
        {error ? (
          <Notice tone="danger" title="The weighing was not recorded">
            {error}
          </Notice>
        ) : null}

        <View style={styles.hero}>
          <TextInput
            style={styles.heroInput}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            selectTextOnFocus
            autoFocus
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Weight"
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
          <Text style={styles.hint}>
            Pre-filled from your last weighing so the unit cannot silently change.
          </Text>
        </View>

        {/* The design's fluting, at the one place in the module with room for an ornament. */}
        <View style={styles.ornamentRow}>
          <Fluting />
          <Fluting />
          <Fluting />
        </View>

        <Field
          label="Note"
          value={note}
          onChangeText={setNote}
          placeholder="Fasted, post-workout, …"
          hint="Whatever makes the number make sense later."
        />

        <View style={styles.when}>
          <Eyebrow>Recorded</Eyebrow>
          <Text style={styles.whenValue}>
            {`Today · ${openedAt.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}`}
          </Text>
        </View>

        <Button
          label="Record it"
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
  hero: { gap: layout.cardGap },
  /**
   * A raw `TextInput` rather than a `Field`: this is the screen's one figure and the design sets it
   * at display size, which a labelled box cannot carry. `typeScale.timer` is the app's big-number
   * role — tabular, so the digits do not reflow the box as they change.
   */
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
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    textAlign: 'center',
  },
  /** Fluting stretches to its parent's height, so the row has to have one. */
  ornamentRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    height: 20,
    opacity: 0.6,
  },
  when: {
    gap: spacing.xs,
    paddingTop: layout.cardGap,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  whenValue: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontVariant: ['tabular-nums'],
  },
});
