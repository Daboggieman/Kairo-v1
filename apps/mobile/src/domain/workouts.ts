/**
 * Pure workout calculations. No SQLite, no React, no clock reads — so these are cheap
 * to unit test and safe to reuse from the store, the screens, and (later) the sync
 * layer. Anything time-dependent takes `now` as a parameter.
 */

import type { WeightUnit, WorkoutSet, WorkoutSetWithExercise } from '@/db/types';

/**
 * Exported because the history query in `src/db/workouts.ts` has to do the same lb->kg
 * normalisation in SQL that `setVolume` does here — two hardcoded copies of the factor
 * would be free to drift apart.
 */
export const LB_PER_KG = 2.20462262;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

/** Normalises a weight to kilograms so mixed-unit totals don't lie. */
export function toKg(weight: number, unit: WeightUnit): number {
  return unit === 'kg' ? weight : lbToKg(weight);
}

type VolumeInput = Pick<WorkoutSet, 'reps' | 'weight' | 'weightUnit'>;

/**
 * Volume for one set: reps x weight, in kg.
 *
 * `04-feature-specs.md` lists volume (sets x reps x weight) as the progress-chart stat.
 * Summing per-set products gives exactly that, and normalising to kg keeps a session
 * logged partly in lb from producing a meaningless number.
 */
export function setVolume(set: VolumeInput): number {
  return set.reps * toKg(set.weight, set.weightUnit);
}

/** Total volume across a session's sets, in kg. */
export function sessionVolume(sets: VolumeInput[]): number {
  return sets.reduce((sum, set) => sum + setVolume(set), 0);
}

/**
 * Estimated one-rep max via Epley: w x (1 + reps/30).
 *
 * A 1-rep set returns the weight itself rather than inflating it by 3%.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Best estimated 1RM across a set list, in kg — the personal-record signal. */
export function bestOneRepMax(sets: VolumeInput[]): number {
  return sets.reduce(
    (best, set) => Math.max(best, estimateOneRepMax(toKg(set.weight, set.weightUnit), set.reps)),
    0,
  );
}

/**
 * Starting values for the next set of an exercise.
 *
 * The auto-suggest from `04-feature-specs.md`: repeat what was done last time and let
 * the user adjust. Deliberately does NOT auto-progress the weight — suggesting a heavier
 * load than the lifter actually hit is worse than suggesting the same one.
 */
export function suggestNextSet(
  lastSet: Pick<WorkoutSet, 'reps' | 'weight' | 'weightUnit'> | null,
  defaultUnit: WeightUnit = 'kg',
): { reps: number; weight: number; weightUnit: WeightUnit } {
  if (!lastSet) {
    return { reps: 8, weight: 0, weightUnit: defaultUnit };
  }
  return { reps: lastSet.reps, weight: lastSet.weight, weightUnit: lastSet.weightUnit };
}

/**
 * Seconds elapsed since the rest timer started.
 *
 * `now` is injected rather than read internally so this tests without fake clocks, and
 * clamps at 0 so a clock adjustment can't render a negative timer.
 */
export function restElapsed(startedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

/** "2:05" / "0:09" — the rest-timer readout. */
export function formatRest(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

/** Duration in whole seconds, or null while a session is still running. */
export function sessionDurationSeconds(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return ms > 0 ? Math.floor(ms / 1000) : 0;
}

/** "1h 05m" / "45m 30s" — compact enough for a list row. */
export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return 'In progress';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/**
 * Next set number for an exercise within a session. Numbering restarts per exercise so
 * "Bench Press set 3" reads the way a lifter would say it.
 */
export function nextSetNumber(sets: Pick<WorkoutSet, 'exerciseId'>[], exerciseId: string): number {
  return sets.filter((set) => set.exerciseId === exerciseId).length + 1;
}

export type ExerciseGroup = {
  exerciseId: string;
  exerciseName: string;
  sets: WorkoutSetWithExercise[];
};

/** Groups a flat set list by exercise, preserving first-logged order. */
export function groupByExercise(sets: WorkoutSetWithExercise[]): ExerciseGroup[] {
  const groups = new Map<string, ExerciseGroup>();
  for (const set of sets) {
    const existing = groups.get(set.exerciseId);
    if (existing) {
      existing.sets.push(set);
    } else {
      groups.set(set.exerciseId, {
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        sets: [set],
      });
    }
  }
  return [...groups.values()];
}

/** Rounds for display without dragging in a formatting library. */
export function formatWeight(weight: number, unit: WeightUnit): string {
  return `${Math.round(weight * 100) / 100}${unit}`;
}

/**
 * A load already normalised to kg, rendered in the unit the reader chose.
 *
 * `formatWeight` deliberately does not convert: it prints the number it is handed with the unit it
 * is handed, because a set is logged in a unit and is shown back in that same unit. Anything
 * *derived* — an estimated 1RM, a heaviest-ever lift across sessions logged in both units — has been
 * through `toKg` and no longer carries a unit of its own, so the display unit becomes a preference.
 * That conversion is this function, and it composes over `formatWeight` rather than repeating the
 * rounding: one figure, one formatter.
 */
export function formatLoad(kg: number, unit: WeightUnit): string {
  return formatWeight(unit === 'lb' ? kgToLb(kg) : kg, unit);
}

/* ------------------------------------------------------------------------- *
 * The Forge's vocabulary
 *
 * Sets are **strikes**, volume is **tonnage**, exercises are **lifts** — the workout module's
 * display copy from `09-ui-rebuild-plan.md`. The words live here rather than at the call sites for
 * the same reason `formatProgress` lives in `tasks.ts`: four screens say the same three things
 * about a session, and a phrase written four times is a phrase that ends up worded three ways.
 * Identifiers stay English throughout; only the strings are the theme.
 * ------------------------------------------------------------------------- */

/** "1 strike" / "11 strikes". English pluralisation, which is all the copy needs. */
function count(quantity: number, singular: string): string {
  return `${quantity} ${singular}${quantity === 1 ? '' : 's'}`;
}

/**
 * "5,240 kg" — a load, grouped, in kilograms.
 *
 * Always kg regardless of the unit the sets were logged in: `setVolume` normalises through `toKg`,
 * so a session logged partly in lb has no single unit to report it in. Grouped because a month of
 * training is five figures, and `84120 kg` is not a number anyone reads at a glance.
 */
export function formatTonnage(volumeKg: number): string {
  return `${Math.round(volumeKg).toLocaleString()} kg`;
}

/** Tonnage across many sessions, in kg. The history query has already totalled each one. */
export function totalTonnage(sessions: { totalVolume: number }[]): number {
  return sessions.reduce((sum, session) => sum + session.totalVolume, 0);
}

/** "16 sessions · 84,120 kg lifted" — The Forge's one line of aggregate, under its name. */
export function formatForgeTotals(sessionCount: number, totalVolumeKg: number): string {
  if (sessionCount === 0) return 'Nothing forged yet';
  return `${count(sessionCount, 'session')} · ${formatTonnage(totalVolumeKg)} lifted`;
}

/**
 * "3 lifts · 11 strikes" — what a session amounts to, for a card that has no room for a stat grid.
 *
 * The design writes this as "3 exercises · 11 strikes"; the module's own lexicon calls an exercise
 * a lift, and mixing the two vocabularies in one sentence is worse than either alone.
 */
export function formatAnvilSummary(liftCount: number, strikeCount: number): string {
  if (strikeCount === 0) return 'Nothing struck yet';
  return `${count(liftCount, 'lift')} · ${count(strikeCount, 'strike')}`;
}
