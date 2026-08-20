/**
 * The Call — the hours at which Kairo speaks: summon one, recast it, silence it, delete it.
 *
 * Two things drive the layout, and both survive the restyle. A call is defined by three fields that
 * have to be seen at once (name, time, days), so the form is one card that stays on screen rather
 * than becoming a modal. And whether a call can actually *sound* depends on the runtime — Expo Go on
 * Android cannot deliver remote notifications, and a development build is needed for full support —
 * so the notice that says so sits above the form, where it is read before a call is summoned rather
 * than after it fails to arrive.
 *
 * Rows are always saved even when nothing could be scheduled (see `src/db/alarms.ts`), so a row that
 * has no native schedule says so on its face. A saved call that silently never sounds is the failure
 * this screen exists to make impossible.
 *
 * Departures from `5.22_the_call`:
 *
 * - **No in-content display title.** The design draws "THE CALL" twice — once in the top bar and
 *   again as a display-md heading directly beneath it. `AppBar` says it once, and the tagline that
 *   sat under the duplicate ("Kairo speaks at the hour you name") moves inside the form card under
 *   its own heading, where it is describing something rather than repeating it.
 * - **The seven weekday toggles are `Chip shape="circle"`**, not this screen's own 46pt `Pressable`s.
 *   Same 44pt round control, same accent-fill selected state, and the accessibility contract now
 *   comes from the primitive instead of from three props written out by hand. It is the control the
 *   New Rite's "On these days" row already uses, which is the point: two screens that ask for
 *   weekdays now ask with one control.
 * - **The resolved schedule is printed rather than the design's rule.** The design hints "No day
 *   selected repeats every day"; `describeRepeat([])` already answers "Every day", so the line leads
 *   with the answer and explains the mechanism only in the one case where it is not self-evident.
 *   This is *not* the New Rite's rejected hint (`02-ui-rebuild-conventions.md`): the Rite has an
 *   explicit cadence selector, where an empty custom day set contradicts the cadence chosen above it.
 *   Here empty-means-daily is `reminderTriggers`' documented contract.
 * - **Delete stays a visible glyph.** The design's footer caption offers "Long-press to delete" as
 *   the only way out; a destructive action reachable only through a gesture with no affordance is one
 *   nobody finds. The caption goes with it.
 * - **The time field is not set in display-md.** `Field` owns its `TextInput`, and its `style` prop
 *   targets the wrapper — the design's large tabular clock would need a new prop on the primitive and
 *   would leave one form's input unlike every other input in the app.
 * - **A row being edited is tinted, without the accent left rule.** That rule on accent-soft means
 *   "the one thing in play" and is reserved for The Anvil's active lift and The Expedition's live
 *   recording; an edit is a selection, not a live process, and the conventions ask for the
 *   reservation not to be widened again.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import {
  AppBar,
  Card,
  CardHeader,
  Chip,
  Divider,
  EmptyState,
  Eyebrow,
  Field,
  Fluting,
  IconButton,
  Notice,
  Screen,
  Section,
} from '@/components/Layout';
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
import {
  colors,
  fontSize,
  layout,
  lineHeight,
  radius,
  spacing,
  TAP_TARGET,
  type as typeScale,
} from '@/theme';

const WEEKDAYS = weekdayInitials();

export default function CallScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * Gates the empty state. `alarms` starts `[]`, so without this the screen says "No calls stand"
   * for the frame before the first query resolves — on a phone that has a standing call. Only the
   * first load matters: once it is true a re-read shows the previous rows rather than flashing empty.
   */
  const [loaded, setLoaded] = useState(false);
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
      // the screen would sit empty as though there were simply no calls.
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoaded(true);
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
    // notification that sounds from it never disagree about what it is called.
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
      // look saved and simply never sound.
      if (!saved.notificationId && mode !== 'unavailable') {
        Alert.alert(
          'Saved, but not scheduled',
          'Kairo needs notification permission to sound this call.',
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
    Alert.alert('Delete this call', `Remove "${alarm.label}"?`, [
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
      <AppBar title="The Call" onBack={() => router.back()} />

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
              <Notice tone="danger" title="Could not read the calls">
                {loadError}
              </Notice>
            ) : null}

            {mode === 'unavailable' ? (
              <Notice tone="warning" title="Reminders will not fire here">
                Notifications are not available in this build. Calls are saved, but they only sound in
                a development build.
              </Notice>
            ) : null}
            {mode === 'local-only' ? (
              <Notice tone="info" title="Expo Go">
                Local reminders only on this device. Remote notifications need a development build.
              </Notice>
            ) : null}

            <Card>
              <CardHeader title={editing ? 'Recast this call' : 'Summon a new call'} />
              <Text style={styles.tagline}>Kairo speaks at the hour you name.</Text>
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
                <Eyebrow>Days</Eyebrow>
                <View style={styles.days}>
                  {WEEKDAYS.map(({ weekday, initial }) => (
                    <Chip
                      key={weekday}
                      label={initial}
                      selected={repeatDays.includes(weekday)}
                      onPress={() => toggleDay(weekday)}
                      shape="circle"
                      role="checkbox"
                      accessibilityLabel={describeRepeat([weekday])}
                      style={styles.dayChip}
                    />
                  ))}
                </View>
                <Text style={styles.hint}>
                  {repeatDays.length === 0
                    ? 'Every day — naming no day is what makes it every day.'
                    : describeRepeat(repeatDays)}
                </Text>
              </View>
              <Button
                label={editing ? 'Save the call' : 'Sound the call'}
                onPress={() => void save()}
                loading={saving}
              />
              {editing ? <Button label="Cancel" variant="secondary" onPress={reset} /> : null}
            </Card>

            {alarms.length > 0 ? (
              <Section
                title="The standing calls"
                action={<Eyebrow>{alarms.length === 1 ? '1 call' : `${alarms.length} calls`}</Eyebrow>}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loadError || !loaded ? null : (
            <EmptyState
              title="No calls stand"
              body="Summon one above and Kairo will speak at that hour."
            />
          )
        }
        renderItem={({ item }) => (
          <CallRow
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

function CallRow({
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
      accessibilityState={{ selected: editing }}
      accessibilityLabel={`Edit ${alarm.label}, ${formatTimeOfDay(alarm.hour, alarm.minute)}`}
      style={({ pressed }) => [styles.row, editing && styles.rowEditing, pressed && styles.pressed]}
    >
      <Text style={[styles.time, !alarm.isActive && styles.inactive]}>
        {formatTimeOfDay(alarm.hour, alarm.minute)}
      </Text>
      {/* The design's own "fluting divider" between the hour and what is called at it. */}
      <Fluting style={styles.rowFluting} />
      <View style={styles.rowMain}>
        <Text style={[styles.rowLabel, !alarm.isActive && styles.inactive]} numberOfLines={1}>
          {alarm.label}
        </Text>
        <Eyebrow>{`${describeRepeat(alarm.repeatDays)}${alarm.isActive ? '' : ' · off'}`}</Eyebrow>
        {unscheduled ? <Text style={styles.warning}>Saved, not scheduled</Text> : null}
      </View>
      <Switch
        value={alarm.isActive}
        onValueChange={onToggle}
        accessibilityLabel={`${alarm.label} is ${alarm.isActive ? 'on' : 'off'}`}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={colors.text}
      />
      <IconButton icon="trash-can-outline" label={`Delete ${alarm.label}`} onPress={onDelete} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: layout.screenPadding },
  header: { gap: layout.sectionGap, paddingBottom: spacing.sm },
  tagline: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  repeat: { gap: spacing.sm },
  /** Seven 44pt circles across a phone: `space-between` is what puts the gaps where they fit. */
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  /**
   * Seven 44pt circles need 308pt, and a card inside the screen margin gives about 295 on a 375pt
   * phone. React Native's `flexShrink` defaults to 0, so without this the last day overflows the card
   * rather than the row tightening — they hold 44 wherever there is room for it and compress where
   * there is not.
   */
  dayChip: { flexShrink: 1 },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP_TARGET + spacing.md,
    paddingVertical: layout.rowPadding,
  },
  /**
   * The negative margin is what lets the tint reach past the text it highlights without moving that
   * text: the padding it cancels is added back inside. Without the pair, starting an edit shifts the
   * whole row 12px sideways.
   */
  rowEditing: {
    backgroundColor: colors.accentSoft,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  rowMain: { flex: 1, gap: spacing.xs },
  time: { color: colors.text, ...typeScale.headlineSm, fontVariant: ['tabular-nums'] },
  /** The design draws it 32px tall; `Fluting` would otherwise stretch to the whole row. */
  rowFluting: { height: 32, alignSelf: 'center' },
  rowLabel: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  warning: { color: colors.warning, ...typeScale.eyebrow, fontWeight: '700' },
  inactive: { color: colors.textMuted },
  pressed: { opacity: 0.7 },
});
