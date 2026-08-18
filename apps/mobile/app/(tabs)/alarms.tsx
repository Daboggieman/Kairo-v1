/**
 * Reminders — create, edit, switch off, and delete local notification schedules.
 *
 * Two things drive the layout. A reminder is defined by three fields that have to be seen at once
 * (name, time, days), so the form is one card and stays on screen rather than becoming a modal.
 * And whether a reminder can actually *fire* depends on the runtime — Expo Go on Android cannot
 * deliver remote notifications, and a development build is needed for full support — so the notice
 * that says so sits at the top, above the form, where it is read before a reminder is created
 * rather than after it fails to arrive.
 *
 * Rows are always saved even when nothing could be scheduled (see `src/db/alarms.ts`), so a row
 * that has no native schedule says so on its face. A saved reminder that silently never fires is
 * the failure this screen exists to make impossible.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card, Divider, EmptyState, Field, Notice, Screen, Section } from '@/components/Layout';
import { LOCAL_USER_ID } from '@/constants';
import { createAlarm, deleteAlarm, listAlarms, updateAlarm, type Alarm } from '@/db/alarms';
import {
  describeRepeat,
  formatTimeInput,
  formatTimeOfDay,
  parseTimeOfDay,
  weekdayInitials,
} from '@/domain/reminders';
import { notificationsMode } from '@/services/notifications';
import { colors, fontSize, layout, lineHeight, radius, spacing, TAP_TARGET } from '@/theme';

const WEEKDAYS = weekdayInitials();

export default function AlarmsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('07:00');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [editing, setEditing] = useState<Alarm | null>(null);
  const [saving, setSaving] = useState(false);
  /** What this runtime can schedule. Rows always save; the notice explains when they cannot fire. */
  const mode = notificationsMode();

  const load = useCallback(async () => {
    try {
      setAlarms(await listAlarms(db, LOCAL_USER_ID));
      setLoadError(null);
    } catch (error) {
      // Surfaced rather than swallowed: an unhandled rejection here is invisible on a phone, and
      // the screen would sit empty as though there were simply no reminders.
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const reset = useCallback(() => {
    setEditing(null);
    setLabel('');
    setTime('07:00');
    setRepeatDays([]);
  }, []);

  const startEditing = useCallback((alarm: Alarm) => {
    setEditing(alarm);
    setLabel(alarm.label);
    setTime(formatTimeOfDay(alarm.hour, alarm.minute));
    setRepeatDays(alarm.repeatDays);
  }, []);

  const toggleDay = useCallback((weekday: number) => {
    setRepeatDays((current) =>
      current.includes(weekday)
        ? current.filter((entry) => entry !== weekday)
        : [...current, weekday],
    );
  }, []);

  async function save() {
    const parsed = parseTimeOfDay(time);
    if (!parsed) {
      Alert.alert('Check the time', 'Enter a 24-hour time as four digits — 0700 is 7 am.');
      return;
    }

    // Blank falls back to the same name `scheduleReminder` would use, so the row and the
    // notification that fires from it never disagree about what it is called.
    const input = {
      label: label.trim() || 'Kairo reminder',
      hour: parsed.hour,
      minute: parsed.minute,
      repeatDays,
      isActive: true,
    };

    setSaving(true);
    try {
      const saved = editing
        ? await updateAlarm(db, editing, input)
        : await createAlarm(db, LOCAL_USER_ID, input);
      // A missing id with a working runtime means permission was denied — otherwise the row would
      // look saved and simply never fire.
      if (!saved.notificationId && mode !== 'unavailable') {
        Alert.alert(
          'Saved, but not scheduled',
          'Kairo needs notification permission to fire this reminder.',
        );
      }
      reset();
      await load();
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(alarm: Alarm, isActive: boolean) {
    try {
      // Everything but `isActive` is carried over: `updateAlarm` cancels the existing schedule and
      // reschedules from this input, so anything omitted here would be dropped from the row.
      await updateAlarm(db, alarm, {
        label: alarm.label,
        hour: alarm.hour,
        minute: alarm.minute,
        repeatDays: alarm.repeatDays,
        isActive,
      });
      await load();
    } catch (error) {
      Alert.alert('Could not update', error instanceof Error ? error.message : String(error));
    }
  }

  function confirmDelete(alarm: Alarm) {
    Alert.alert('Delete reminder', `Remove "${alarm.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAlarm(db, alarm);
            // The row being edited is gone; the form would otherwise save back a deleted id.
            if (editing?.id === alarm.id) reset();
            await load();
          } catch (error) {
            Alert.alert('Could not delete', error instanceof Error ? error.message : String(error));
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <FlatList
        data={alarms}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + layout.scrollFooter },
        ]}
        ItemSeparatorComponent={Divider}
        ListHeaderComponent={
          <View style={styles.header}>
            {loadError ? (
              <Notice tone="danger" title="Could not load reminders">
                {loadError}
              </Notice>
            ) : null}

            {mode === 'unavailable' ? (
              <Notice tone="warning" title="Reminders will not fire here">
                Notifications are not available in this build. Reminders are saved, but they only
                fire in a development build.
              </Notice>
            ) : null}
            {mode === 'local-only' ? (
              <Notice tone="info" title="Expo Go">
                Expo Go: local reminders fire, remote notifications need a development build.
              </Notice>
            ) : null}

            <Card>
              <Text style={styles.formTitle}>{editing ? 'Edit reminder' : 'New reminder'}</Text>
              <Field
                label="Name"
                value={label}
                onChangeText={setLabel}
                placeholder="Morning workout"
                returnKeyType="next"
              />
              <Field
                label="Time"
                value={time}
                onChangeText={(next) => setTime(formatTimeInput(next))}
                placeholder="07:00"
                keyboardType="number-pad"
                maxLength={5}
                hint="Four digits on a 24-hour clock. 1830 is half past six in the evening."
              />
              <View style={styles.repeat}>
                <Text style={styles.fieldLabel}>Repeat</Text>
                <View style={styles.days}>
                  {WEEKDAYS.map(({ weekday, initial }) => {
                    const selected = repeatDays.includes(weekday);
                    return (
                      <Pressable
                        key={weekday}
                        onPress={() => toggleDay(weekday)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={describeRepeat([weekday])}
                        style={({ pressed }) => [
                          styles.day,
                          selected && styles.daySelected,
                          pressed && styles.dayPressed,
                        ]}
                      >
                        <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                          {initial}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.hint}>
                  {repeatDays.length === 0
                    ? 'No day selected repeats every day.'
                    : describeRepeat(repeatDays)}
                </Text>
              </View>
              <Button
                label={editing ? 'Save changes' : 'Add reminder'}
                onPress={() => void save()}
                loading={saving}
              />
              {editing ? (
                <Button label="Cancel" variant="secondary" onPress={reset} />
              ) : null}
            </Card>

            <Section title={alarms.length === 1 ? '1 reminder' : `${alarms.length} reminders`} />
          </View>
        }
        ListEmptyComponent={
          loadError ? null : (
            <EmptyState
              title="No reminders yet"
              body="Add one above and Kairo will nudge you at that time."
            />
          )
        }
        renderItem={({ item }) => (
          <AlarmRow
            alarm={item}
            editing={editing?.id === item.id}
            // A row with no native identifiers was saved but never handed to the OS. In a runtime
            // that cannot schedule at all the top notice already says so, and repeating it on
            // every row would be noise.
            unscheduled={item.isActive && !item.notificationId && mode !== 'unavailable'}
            onPress={() => startEditing(item)}
            onToggle={(next) => void setActive(item, next)}
            onDelete={() => confirmDelete(item)}
          />
        )}
      />
    </Screen>
  );
}

function AlarmRow({
  alarm,
  editing,
  unscheduled,
  onPress,
  onToggle,
  onDelete,
}: {
  alarm: Alarm;
  editing: boolean;
  unscheduled: boolean;
  onPress: () => void;
  onToggle: (isActive: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${alarm.label}, ${formatTimeOfDay(alarm.hour, alarm.minute)}`}
      style={({ pressed }) => [styles.row, editing && styles.rowEditing, pressed && styles.pressed]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.time, !alarm.isActive && styles.inactive]}>
          {formatTimeOfDay(alarm.hour, alarm.minute)}
        </Text>
        <Text style={[styles.rowLabel, !alarm.isActive && styles.inactive]} numberOfLines={1}>
          {alarm.label}
        </Text>
        <Text style={styles.rowMeta}>
          {describeRepeat(alarm.repeatDays)}
          {alarm.isActive ? '' : ' · off'}
        </Text>
        {unscheduled ? <Text style={styles.warning}>Saved, not scheduled</Text> : null}
      </View>
      <Switch
        value={alarm.isActive}
        onValueChange={onToggle}
        accessibilityLabel={`${alarm.label} is ${alarm.isActive ? 'on' : 'off'}`}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={colors.text}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${alarm.label}`}
        onPress={onDelete}
        hitSlop={spacing.md}
        style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: layout.screenPadding },
  header: { gap: layout.sectionGap, paddingBottom: spacing.sm },
  formTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  repeat: { gap: spacing.sm },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  day: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayPressed: { opacity: 0.6 },
  dayText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  dayTextSelected: { color: colors.accentText },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: TAP_TARGET + spacing.md,
    paddingVertical: layout.rowPadding,
  },
  rowEditing: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.md,
    backgroundColor: colors.accentSoft,
  },
  rowMain: { flex: 1, gap: spacing.xs },
  time: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  rowLabel: { color: colors.text, fontSize: fontSize.md },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  warning: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '700' },
  inactive: { color: colors.textMuted },
  delete: { minWidth: TAP_TARGET / 2, alignItems: 'flex-end' },
  pressed: { opacity: 0.7 },
});
