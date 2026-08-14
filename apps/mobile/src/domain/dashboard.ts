/**
 * Cross-module composition for Home.
 *
 * Each feature keeps ownership of its calculations; this module only selects the small,
 * stable summary Home needs. Keeping that composition pure prevents the dashboard screen
 * from becoming a second implementation of streak, nutrition, or weight rules.
 */

import type {
  BodyWeightEntry,
  MacroTarget,
  NutritionEntryWithFood,
  Task,
  WeightUnit,
  WorkoutSession,
  WorkoutSessionSummary,
} from '@/db/types';

import { type MacroSummary, summariseMacros } from './macros';
import { splitByDueToday, type TodayTask } from './tasks';
import {
  dailyWeights,
  displayUnit,
  movingAverage,
  summarise,
  type TrendSummary,
} from './weight';

export type DashboardTaskSummary = {
  due: number;
  done: number;
  remaining: number;
  atRisk: number;
  /** The highest-priority unfinished tasks, in the Today screen's own ordering. */
  next: TodayTask[];
};

export type DashboardWeightSummary = TrendSummary & { unit: WeightUnit };

export type DashboardSummary = {
  tasks: DashboardTaskSummary;
  macros: MacroSummary;
  weight: DashboardWeightSummary;
  workout: {
    active: WorkoutSession | null;
    latestCompleted: WorkoutSessionSummary | null;
  };
};

export type DashboardInput = {
  tasks: Task[];
  completionDatesByTask: Map<string, string[]>;
  nutritionEntries: NutritionEntryWithFood[];
  macroTarget: MacroTarget | null;
  weightEntries: BodyWeightEntry[];
  sessions: WorkoutSessionSummary[];
  activeSession: WorkoutSession | null;
  nowMs: number;
};

/** Produces the complete read model for Home from existing module data. */
export function buildDashboard(input: DashboardInput): DashboardSummary {
  const { due } = splitByDueToday(input.tasks, input.completionDatesByTask, input.nowMs);
  const unfinished = due.filter((entry) => !entry.streak.doneToday);
  const weightDays = dailyWeights(input.weightEntries);
  const weightTrend = movingAverage(weightDays);

  return {
    tasks: {
      due: due.length,
      done: due.length - unfinished.length,
      remaining: unfinished.length,
      atRisk: unfinished.filter((entry) => entry.streak.atRisk).length,
      next: unfinished.slice(0, 3),
    },
    macros: summariseMacros(input.nutritionEntries, input.macroTarget),
    weight: {
      ...summarise(weightDays, weightTrend, input.nowMs),
      unit: displayUnit(input.weightEntries),
    },
    workout: {
      active: input.activeSession,
      latestCompleted: input.sessions.find((session) => session.endedAt !== null) ?? null,
    },
  };
}
