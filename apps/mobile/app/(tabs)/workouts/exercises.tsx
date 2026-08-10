/**
 * Exercise Library — searchable list of seeded lifts, plus custom entries.
 *
 * Doubles as the picker for the active session: selecting a row writes it to the store and
 * pops back, since Expo Router params only flow forward into a route, not back out of one.
 */

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import type { Exercise } from '@/db/types';
import { createCustomExercise, listExercises, searchExercises } from '@/db/workouts';
import { useWorkoutStore } from '@/store/workoutStore';
import { colors, fontSize, radius, spacing, TAP_TARGET } from '@/theme';

export default function ExercisesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const selectExercise = useWorkoutStore((state) => state.selectExercise);

  const [query, setQuery] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const trimmed = query.trim();
      const rows = trimmed ? await searchExercises(db, trimmed) : await listExercises(db);
      if (!cancelled) setExercises(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, query]);

  const onSelect = useCallback(
    (exercise: Exercise) => {
      selectExercise(exercise);
      router.back();
    },
    [router, selectExercise],
  );

  // Adding a custom lift from the search box: whatever was typed is already the name, so
  // there is no second form to fill in.
  const onAddCustom = useCallback(async () => {
    const name = query.trim();
    if (!name) return;
    setAdding(true);
    try {
      const created = await createCustomExercise(db, {
        id: randomUUID(),
        name,
        muscleGroup: null,
        equipment: null,
      });
      onSelect(created);
    } finally {
      setAdding(false);
    }
  }, [db, onSelect, query]);

  const trimmed = query.trim();
  const exactMatch = exercises.some((e) => e.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          accessibilityLabel="Search exercises"
        />
      </View>

      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                {[item.muscleGroup, item.equipment].filter(Boolean).join(' · ') || 'Custom'}
              </Text>
            </View>
            {item.isCustom ? <Text style={styles.badge}>custom</Text> : null}
          </Pressable>
        )}
        ListFooterComponent={
          trimmed && !exactMatch ? (
            <Button
              label={`Add "${trimmed}" as a custom exercise`}
              variant="secondary"
              onPress={onAddCustom}
              loading={adding}
              style={styles.addButton}
            />
          ) : null
        }
        ListEmptyComponent={
          trimmed ? null : <Text style={styles.empty}>No exercises in the library.</Text>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchWrap: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  search: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSize.md,
    height: TAP_TARGET,
    paddingHorizontal: spacing.lg,
  },
  list: { paddingHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TAP_TARGET,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1 },
  rowName: { color: colors.text, fontSize: fontSize.md, fontWeight: '500' },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  badge: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '700' },
  addButton: { marginTop: spacing.xl },
  empty: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', padding: spacing.xl },
});
