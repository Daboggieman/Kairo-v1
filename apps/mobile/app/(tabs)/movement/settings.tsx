/**
 * The Compass — what the module measures in, and what it says out loud.
 *
 * No design export exists for this screen, so it is built in the module's idiom: `AppBar` with a back
 * affordance, sections of rows, one sentence under each row saying what it actually does.
 *
 * Two things it says that the old screen did not:
 *
 * - **The unit is a pair of chips, not a "Metric units" switch.** A switch has an on state and an off
 *   state, and "off" here meant miles — a choice hidden inside the absence of one. Two chips name both
 *   answers, and the row that depends on the unit reads back the choice ("at every mile"), so the
 *   effect of the setting is visible on the screen that sets it.
 * - **The dependency between the cue rows is stated.** Distance and time cues are already disabled
 *   while voice cues are off, but nothing said why; the section's own note does.
 *
 * The figures in the detail lines are the domain's real ones — 1 km / 1 mi from `initialCueSchedule`,
 * ten minutes from its 600 s, and the autopause confirmation window from `movementThresholds`. They
 * are written out rather than interpolated because the thresholds differ per activity type and this
 * screen sets none: "about ten seconds" is true of all three where "10" would be true of two.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import {
  AppBar,
  Card,
  Chip,
  Eyebrow,
  Notice,
  RowGroup,
  Screen,
  ScreenScroll,
  Section,
} from '@/components/Layout';
import { LOCAL_USER_ID } from '@/constants';
import {
  getMovementPreferences,
  getUnitSystem,
  MOVEMENT_AUTOPAUSE,
  MOVEMENT_DISTANCE_CUES,
  MOVEMENT_TIME_CUES,
  MOVEMENT_VOICE_CUES,
  setMovementPreference,
  setUnitSystem,
  type UnitSystem,
} from '@/db/preferences';
import { colors, fontSize, layout, lineHeight, spacing } from '@/theme';

type Settings = Awaited<ReturnType<typeof getMovementPreferences>>;

type PreferenceKey =
  | typeof MOVEMENT_VOICE_CUES
  | typeof MOVEMENT_DISTANCE_CUES
  | typeof MOVEMENT_TIME_CUES
  | typeof MOVEMENT_AUTOPAUSE;

/**
 * One setting: its name, what it does, and its switch.
 *
 * `NavRow` is the app's row for something that navigates; this is a row that decides, so it is local
 * rather than a sixth variant of that. The `Switch` colours are the ones `alarms.tsx` set — the
 * platform default track is a system blue that belongs to no part of this theme.
 */
function ToggleRow({
  label,
  detail,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={`${label} is ${value ? 'on' : 'off'}`}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={colors.text}
      />
    </View>
  );
}

export default function CompassScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>({
    voiceCues: true,
    distanceCues: true,
    timeCues: true,
    autopause: true,
  });
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [loaded, loadedUnits] = await Promise.all([
            getMovementPreferences(db, LOCAL_USER_ID),
            getUnitSystem(db, LOCAL_USER_ID),
          ]);
          if (cancelled) return;
          setSettings(loaded);
          setUnits(loadedUnits);
          setError(null);
        } catch (caught) {
          // Without this the rejection was unhandled and every switch silently showed its default.
          if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  const toggle = useCallback(
    async (field: keyof Settings, key: PreferenceKey, value: boolean) => {
      // Optimistic: a switch that waits for SQLite before moving feels broken. If the write fails the
      // notice says so, and the next focus re-reads the stored truth.
      setSettings((current) => ({ ...current, [field]: value }));
      try {
        await setMovementPreference(db, LOCAL_USER_ID, key, value);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [db],
  );

  const chooseUnits = useCallback(
    async (next: UnitSystem) => {
      setUnits(next);
      try {
        await setUnitSystem(db, LOCAL_USER_ID, next);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [db],
  );

  const metric = units === 'metric';

  return (
    <Screen>
      <AppBar title="The Compass" onBack={() => router.back()} />

      <ScreenScroll>
        {error ? (
          <Notice tone="danger" title="The setting was not saved">
            {error}
          </Notice>
        ) : null}

        <Section title="Measure">
          <Card>
            <Eyebrow>Distance and pace</Eyebrow>
            <View style={styles.unitRow}>
              <Chip
                label="Kilometres"
                selected={metric}
                onPress={() => void chooseUnits('metric')}
                style={styles.unitChip}
              />
              <Chip
                label="Miles"
                selected={!metric}
                onPress={() => void chooseUnits('imperial')}
                style={styles.unitChip}
              />
            </View>
            <Text style={styles.note}>
              Every screen in the module follows this, and so do the splits and the spoken cues.
            </Text>
          </Card>
        </Section>

        <Section title="The herald">
          <RowGroup>
            <ToggleRow
              label="Voice cues"
              detail="Spoken updates while a journey is underway"
              value={settings.voiceCues}
              onChange={(value) => void toggle('voiceCues', MOVEMENT_VOICE_CUES, value)}
            />
            <ToggleRow
              label="Distance cues"
              detail={metric ? 'At every kilometre' : 'At every mile'}
              value={settings.distanceCues}
              disabled={!settings.voiceCues}
              onChange={(value) => void toggle('distanceCues', MOVEMENT_DISTANCE_CUES, value)}
            />
            <ToggleRow
              label="Time cues"
              detail="At every ten minutes of moving time"
              value={settings.timeCues}
              disabled={!settings.voiceCues}
              onChange={(value) => void toggle('timeCues', MOVEMENT_TIME_CUES, value)}
            />
          </RowGroup>
          {settings.voiceCues ? null : (
            <Text style={styles.note}>
              Both cue kinds are silent while voice cues are off — the herald has nothing to speak
              through.
            </Text>
          )}
        </Section>

        <Section title="Halting">
          <RowGroup>
            <ToggleRow
              label="Autopause"
              detail="Halts the record when you stop moving for about ten seconds, and resumes when you go again"
              value={settings.autopause}
              onChange={(value) => void toggle('autopause', MOVEMENT_AUTOPAUSE, value)}
            />
          </RowGroup>
          <Text style={styles.note}>
            Held time is kept either way — it is the difference between the journey&apos;s elapsed and
            moving figures, and The Chronicle shows it.
          </Text>
        </Section>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.cardGap,
    paddingVertical: spacing.sm,
  },
  /** Dimmed rather than hidden: a row that has a reason to be off should still be readable. */
  rowDisabled: { opacity: 0.45 },
  rowText: { flex: 1, gap: spacing.xs },
  rowLabel: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  rowDetail: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  unitRow: { flexDirection: 'row', gap: spacing.sm },
  unitChip: { flex: 1 },
  note: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
});
