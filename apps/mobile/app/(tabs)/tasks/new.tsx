/**
 * The New Rite — a modal, like the weight quick-entry.
 *
 * Two decisions, then save. The presets from `RECURRENCE_PRESETS` cover the rules people
 * actually keep habits on; "Custom" reveals the seven day toggles and builds a `weekly:…`
 * rule, which is the only shape in the vocabulary that needs more than one tap to express.
 *
 * The rule is assembled with `formatRecurrence` rather than by string concatenation here, so the
 * screen cannot invent a rule `parseRecurrence` would reject — the parser stays the contract.
 *
 * Two deliberate departures from the design. It offers an "OR / Every N days" numeric field beside
 * the day toggles: `interval:` rules do parse and describe correctly, but nothing in the app creates
 * one, and two live ways to express one cadence in a sheet with no explicit apply step leaves "which
 * of the two wins" to be inferred. And its hint reads *"Selecting no day repeats every day"* — here
 * an empty custom selection cannot be saved instead, because a sheet that silently converts your
 * choice into a different rule is the harder thing to notice.
 */

import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { AppBar, Chip, Field, IconButton, Screen, Section } from '@/components/Layout';
import { createTask } from '@/db/tasks';
import { WEEKDAY_LABELS } from '@/domain/dates';
import { formatRecurrence, RECURRENCE_PRESETS } from '@/domain/tasks';
import { LOCAL_USER_ID } from '@/constants';
import { colors, fontSize, layout, lineHeight, spacing } from '@/theme';
import { requestSync } from '@/sync/scheduler';

const CUSTOM = 'custom';

/** Long enough for any habit worth naming, short enough to render on one line. */
const MAX_TITLE = 80;

export default function NewTaskScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
    <Screen>
      {/*
        No `onBack`: this is a modal, and the way out of a modal is its own dismiss. The chevron an
        `AppBar` draws for `onBack` would claim there is a screen underneath to go back to.
      */}
      <AppBar
        title="New rite"
        action={<IconButton icon="close" label="Cancel" onPress={() => router.back()} />}
      />

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + layout.scrollFooter },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Stretch for ten minutes"
            maxLength={MAX_TITLE}
            autoFocus
            accessibilityLabel="Rite title"
          />

          <Section title="Cadence">
            <View style={styles.cadenceGrid}>
              {[...RECURRENCE_PRESETS, { rule: CUSTOM, label: 'Custom' }].map((preset) => (
                <Chip
                  key={preset.rule}
                  label={preset.label}
                  selected={mode === preset.rule}
                  onPress={() => setMode(preset.rule)}
                  style={styles.cadenceChip}
                />
              ))}
            </View>
          </Section>

          {custom ? (
            <Section title="On these days">
              <View style={styles.dayRow}>
                {WEEKDAY_LABELS.map((label, day) => (
                  <Chip
                    key={label}
                    label={label.slice(0, 1)}
                    accessibilityLabel={label}
                    role="checkbox"
                    shape="circle"
                    selected={customDays.includes(day)}
                    onPress={() => toggleDay(day)}
                    style={styles.dayChip}
                  />
                ))}
              </View>
              <Text style={styles.hint}>Pick at least one day.</Text>
            </Section>
          ) : null}

          <View style={styles.actions}>
            <Button label="Swear the rite" onPress={onSave} disabled={!canSave} loading={saving} />
            <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  content: { padding: layout.screenPadding, gap: layout.sectionGap },
  /**
   * Two across, as the design has it: four cadence labels in one row would each get 70 points and
   * "Weekends" does not fit in 70 points.
   */
  cadenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cadenceChip: { flexGrow: 1, flexBasis: '45%' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  /**
   * Seven 44pt circles and six 4pt gaps come to 332pt; the screen margin leaves 327 on a 375pt phone
   * and 312 on a 360pt one. React Native's `flexShrink` defaults to 0, so without this the last day
   * runs off the edge instead of the row tightening. Same fix as The Call's day row.
   */
  dayChip: { flexShrink: 1 },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  actions: { gap: spacing.md, paddingTop: spacing.sm },
});
