/**
 * Seed exercises.
 *
 * `02-data-model.md` calls Exercise a reference table seeded with common lifts. Without
 * these the app opens to an empty picker and cannot log anything, so the seed runs as
 * part of migration 1 rather than on demand.
 *
 * IDs are deterministic (`seed-*`) rather than random so the same lift carries the same
 * id on every device — that keeps Phase 2 sync from creating duplicate "Squat" rows.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

type SeedExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
};

export const SEED_EXERCISES: SeedExercise[] = [
  { id: 'seed-back-squat', name: 'Back Squat', muscleGroup: 'legs', equipment: 'barbell' },
  { id: 'seed-front-squat', name: 'Front Squat', muscleGroup: 'legs', equipment: 'barbell' },
  { id: 'seed-deadlift', name: 'Deadlift', muscleGroup: 'back', equipment: 'barbell' },
  { id: 'seed-romanian-deadlift', name: 'Romanian Deadlift', muscleGroup: 'hamstrings', equipment: 'barbell' },
  { id: 'seed-bench-press', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell' },
  { id: 'seed-incline-bench-press', name: 'Incline Bench Press', muscleGroup: 'chest', equipment: 'barbell' },
  { id: 'seed-overhead-press', name: 'Overhead Press', muscleGroup: 'shoulders', equipment: 'barbell' },
  { id: 'seed-barbell-row', name: 'Barbell Row', muscleGroup: 'back', equipment: 'barbell' },
  { id: 'seed-pull-up', name: 'Pull-Up', muscleGroup: 'back', equipment: 'bodyweight' },
  { id: 'seed-chin-up', name: 'Chin-Up', muscleGroup: 'back', equipment: 'bodyweight' },
  { id: 'seed-dip', name: 'Dip', muscleGroup: 'chest', equipment: 'bodyweight' },
  { id: 'seed-push-up', name: 'Push-Up', muscleGroup: 'chest', equipment: 'bodyweight' },
  { id: 'seed-lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'cable' },
  { id: 'seed-seated-cable-row', name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable' },
  { id: 'seed-leg-press', name: 'Leg Press', muscleGroup: 'legs', equipment: 'machine' },
  { id: 'seed-leg-curl', name: 'Leg Curl', muscleGroup: 'hamstrings', equipment: 'machine' },
  { id: 'seed-leg-extension', name: 'Leg Extension', muscleGroup: 'quads', equipment: 'machine' },
  { id: 'seed-calf-raise', name: 'Calf Raise', muscleGroup: 'calves', equipment: 'machine' },
  { id: 'seed-dumbbell-curl', name: 'Dumbbell Curl', muscleGroup: 'biceps', equipment: 'dumbbell' },
  { id: 'seed-hammer-curl', name: 'Hammer Curl', muscleGroup: 'biceps', equipment: 'dumbbell' },
  { id: 'seed-triceps-pushdown', name: 'Triceps Pushdown', muscleGroup: 'triceps', equipment: 'cable' },
  { id: 'seed-skull-crusher', name: 'Skull Crusher', muscleGroup: 'triceps', equipment: 'barbell' },
  { id: 'seed-lateral-raise', name: 'Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell' },
  { id: 'seed-face-pull', name: 'Face Pull', muscleGroup: 'shoulders', equipment: 'cable' },
  { id: 'seed-dumbbell-bench-press', name: 'Dumbbell Bench Press', muscleGroup: 'chest', equipment: 'dumbbell' },
  { id: 'seed-dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', muscleGroup: 'shoulders', equipment: 'dumbbell' },
  { id: 'seed-hip-thrust', name: 'Hip Thrust', muscleGroup: 'glutes', equipment: 'barbell' },
  { id: 'seed-lunge', name: 'Lunge', muscleGroup: 'legs', equipment: 'dumbbell' },
  { id: 'seed-plank', name: 'Plank', muscleGroup: 'core', equipment: 'bodyweight' },
  { id: 'seed-hanging-leg-raise', name: 'Hanging Leg Raise', muscleGroup: 'core', equipment: 'bodyweight' },
];

export async function seedExercises(db: SQLiteDatabase): Promise<void> {
  // INSERT OR IGNORE keeps this idempotent if a future migration re-runs the seed to
  // add newly-shipped lifts without clobbering the user's custom ones.
  const statement = await db.prepareAsync(
    `INSERT OR IGNORE INTO exercises (id, name, muscle_group, equipment, is_custom)
     VALUES ($id, $name, $muscleGroup, $equipment, 0)`,
  );
  try {
    for (const exercise of SEED_EXERCISES) {
      await statement.executeAsync({
        $id: exercise.id,
        $name: exercise.name,
        $muscleGroup: exercise.muscleGroup,
        $equipment: exercise.equipment,
      });
    }
  } finally {
    await statement.finalizeAsync();
  }
}
