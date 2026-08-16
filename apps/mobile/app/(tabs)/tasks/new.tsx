/**
 * New task — a modal, like the weight quick-entry.
 *
 * Two decisions, then save. The presets from `RECURRENCE_PRESETS` cover the rules people
 * actually keep habits on; "Custom days" reveals the seven day toggles and builds a `weekly:…`
 * rule, which is the only shape in the vocabulary that needs more than one tap to express.
 *
 * The rule is assembled with `formatRecurrence` rather than by string concatenation here, so the
 * screen cannot invent a rule `parseRecurrence` would reject — the parser stays the contract.
 */

import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { createTask } from '@/db/tasks';
import { WEEKDAY_LABELS } from '@/domain/dates';
import { formatRecurrence, RECURRENCE_PRESETS } from '@/domain/tasks';
import { LOCAL_USER_ID } from '@/constants';
import { colors, fontSize, radius, spacing, TAP_TARGET } from '@/theme';
import { requestSync } from '@/sync/scheduler';

const CUSTOM = 'custom';

/** Long enough for any habit worth naming, short enough to render on one line. */
const MAX_TITLE = 80;

export default function NewTaskScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<string>(RECURRENCE_PRESETS[0].rule);
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const trimmed = title.trim();
  const custom = mode === CUSTOM;
  const canSave = trimmed !== '' && (!custom || customDays.length > 0);

  const toggleDay = useCallback((day: number) => {
    setCustomDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );
  }, []);

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createTask(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        title: trimmed,
        recurrenceRule: custom ? formatRecurrence({ kind: 'weekly', days: customDays }) : mode,
        // The creation instant is also the schedule's anchor: `interval:` rules count from it,
        // and no rule is ever considered due before it. Stored as an instant for the same
        // reason as a weigh-in — the day is what matters, the time is worth keeping.
        createdAt: new Date().toISOString(),
      });
      void requestSync(db).catch(() => {});
      router.back();
    } finally {
      setSaving(false);
    }
  }, [canSave, custom, customDays, db, mode, router, trimmed]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.label}>Task</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Stretch for ten minutes"
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_TITLE}
            autoFocus
            accessibilityLabel="Task title"
          />
        </View>

        <View>
          <Text style={styles.label}>Repeats</Text>
          <View style={styles.chipRow}>
            {[...RECURRENCE_PRESETS, { rule: CUSTOM, label: 'Custom days' }].map((preset) => (
              <Pressable
                key={preset.rule}
                onPress={() => setMode(preset.rule)}
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === preset.rule }}
                style={({ pressed }) => [
                  styles.chip,
                  mode === preset.rule && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipText, mode === preset.rule && styles.chipTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {custom ? (
          <View>
            <Text style={styles.label}>On these days</Text>
            <View style={styles.dayRow}>
              {WEEKDAY_LABELS.map((label, day) => (
                <Pressable
                  key={label}
                  onPress={() => toggleDay(day)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: customDays.includes(day) }}
                  accessibilityLabel={label}
                  style={({ pressed }) => [
                    styles.dayChip,
                    customDays.includes(day) && styles.chipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.dayText, customDays.includes(day) && styles.chipTextActive]}
                  >
                    {label.slice(0, 1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Button label="Add task" onPress={onSave} disabled={!canSave} loading={saving} />
        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  titleInput: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSize.md,
    height: TAP_TARGET,
    paddingHorizontal: spacing.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    minHeight: TAP_TARGET - spacing.lg,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  chipTextActive: { color: colors.accentText },
  dayRow: { flexDirection: 'row', gap: spacing.sm },
  dayChip: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: TAP_TARGET,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
