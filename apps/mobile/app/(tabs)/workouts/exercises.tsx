/**
 * The Armory — the lift picker, presented as a modal over The Anvil.
 *
 * Selecting writes to the store and pops: `router.setParams` only flows forward, so a modal that
 * needs to hand something *back* either uses the store or reads a param on the screen it came from,
 * and the store is where the current lift already lives.
 *
 * Two things `5.8_the_armory` shows that are deliberately not built:
 *
 * - **The muscle-group filter chips** (All / Chest / Back / Legs / Shoulders / Arms / Core / Custom).
 *   `seed.ts` stores eleven raw groups, not six — `quads`, `hamstrings`, `glutes` and `calves` are
 *   all separately recorded, `biceps` and `triceps` are not rolled into "arms", and a custom lift has
 *   `muscleGroup: null`. Rendering the design's seven chips means inventing a taxonomy that maps our
 *   values onto them, which is a domain decision hiding inside a UI pass. The search box already
 *   filters this library by name, and it is thirty rows.
 * - **The per-row "4 × 8 @ 80 kg" last-time.** One `lastSetForExercise` per row is thirty queries on
 *   open, and the join to do it in one is a new query. The Anvil prints it for the lift you actually
 *   picked, which is where the number is used.
 *
 * The modal has no back chevron — a modal is dismissed, not navigated out of — so the escape is the
 * close glyph in the bar's action slot.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import {
  AppBar,
  Divider,
  EmptyState,
  Field,
  IconButton,
  Notice,
  Pill,
} from '@/components/Layout';
import type { Exercise } from '@/db/types';
import { createCustomExercise, listExercises, searchExercises } from '@/db/workouts';
import { useWorkoutStore } from '@/store/workoutStore';
import { colors, fontSize, layout, lineHeight, radius, spacing, TAP_TARGET } from '@/theme';

/** "Chest · Barbell" from the lowercase tokens the rows are stored as. */
function describeLineage(exercise: Exercise): string {
  const parts = [exercise.muscleGroup, exercise.equipment]
    .filter((part): part is string => !!part)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return parts.length > 0 ? parts.join(' · ') : 'Forged here';
}

function ExerciseRow({ exercise, onPress }: { exercise: Exercise; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}. ${describeLineage(exercise)}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.glyph}>
        <MaterialCommunityIcons name="dumbbell" size={22} color={colors.textMuted} />
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text style={styles.rowLineage} numberOfLines={1}>
          {describeLineage(exercise)}
        </Text>
      </View>
      {exercise.isCustom ? <Pill label="Custom" tone="accent" /> : null}
    </Pressable>
  );
}

export default function ArmoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const selectExercise = useWorkoutStore((state) => state.selectExercise);

  const [query, setQuery] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  /**
   * Gates the empty state. `exercises` starts empty, so without this the modal renders "nothing by
   * that name" for the frame before the first query resolves — on a library that has thirty rows in
   * it. Only the first load matters: once it is true a re-query shows the previous rows briefly
   * rather than flashing empty, which is the behaviour you want while typing.
   */
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = trimmed ? await searchExercises(db, trimmed) : await listExercises(db);
        if (cancelled) return;
        setExercises(rows);
        setError(null);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, trimmed]);

  const onSelect = (exercise: Exercise) => {
    selectExercise(exercise);
    router.back();
  };

  const onForge = async () => {
    try {
      const exercise: Exercise = {
        id: randomUUID(),
        name: trimmed,
        muscleGroup: null,
        equipment: null,
        isCustom: true,
      };
      await createCustomExercise(db, {
        id: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
      });
      onSelect(exercise);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const exactMatch = exercises.some(
    (exercise) => exercise.name.toLowerCase() === trimmed.toLowerCase(),
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppBar
        title="The Armory"
        action={<IconButton icon="close" label="Close the armory" onPress={() => router.back()} />}
      />

      <View style={styles.head}>
        {error ? (
          <Notice tone="danger" title="Could not read the armory">
            {error}
          </Notice>
        ) : null}
        <Field
          label="Search the armory"
          value={query}
          onChangeText={setQuery}
          placeholder="Bench press"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <ExerciseRow exercise={item} onPress={() => onSelect(item)} />}
        ItemSeparatorComponent={() => <Divider />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          error || !loaded ? null : trimmed ? (
            <EmptyState
              title="Nothing by that name"
              body="Nothing in the armory matches. Forge it yourself and it stays in the library."
            />
          ) : (
            <EmptyState
              title="The armory is bare"
              body="No lifts are in the library. Name one above and forge it."
            />
          )
        }
        ListFooterComponent={
          trimmed && !exactMatch ? (
            <Button
              label={`Forge "${trimmed}"`}
              variant="secondary"
              onPress={() => void onForge()}
              style={styles.forge}
            />
          ) : null
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  head: { padding: layout.screenPadding, gap: layout.cardGap },
  list: { paddingHorizontal: layout.screenPadding, paddingBottom: layout.scrollFooter },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.cardGap,
    minHeight: TAP_TARGET,
    paddingVertical: spacing.md,
  },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  /** The bordered plate the design puts every lift's glyph on. */
  glyph: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  rowLineage: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  forge: { marginTop: layout.sectionGap },
});
