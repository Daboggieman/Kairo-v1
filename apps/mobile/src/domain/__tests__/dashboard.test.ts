import type {
  BodyWeightEntry,
  FoodItem,
  MacroTarget,
  NutritionEntryWithFood,
  Task,
  WorkoutSession,
  WorkoutSessionSummary,
} from '@/db/types';

import { buildDashboard, type DashboardInput } from '../dashboard';

const NOW = Date.parse('2026-08-14T12:00:00.000Z');

function task(id: string, title: string, rule = 'daily'): Task {
  return {
    id,
    userId: 'local-user',
    title,
    recurrenceRule: rule,
    createdAt: '2026-08-01T08:00:00.000Z',
    archived: false,
  };
}

function food(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: 'food-1',
    userId: 'local-user',
    name: 'Lunch',
    caloriesPerServing: 500,
    proteinG: 40,
    carbsG: 50,
    fatG: 15,
    servingLabel: 'meal',
    createdAt: '2026-08-14T11:00:00.000Z',
    ...overrides,
  };
}

function nutritionEntry(quantity = 1): NutritionEntryWithFood {
  const item = food();
  return {
    id: 'nutrition-1',
    userId: 'local-user',
    foodItemId: item.id,
    loggedAt: '2026-08-14T12:00:00.000Z',
    loggedDate: '2026-08-14',
    quantity,
    mealType: 'lunch',
    food: item,
  };
}

function target(): MacroTarget {
  return {
    id: 'target-1',
    userId: 'local-user',
    calories: 2000,
    proteinG: 160,
    carbsG: 200,
    fatG: 60,
    effectiveDate: '2026-08-01',
    createdAt: '2026-08-01T08:00:00.000Z',
  };
}

function weight(date: string, value: number, unit: 'kg' | 'lb' = 'kg'): BodyWeightEntry {
  return {
    id: `weight-${date}`,
    userId: 'local-user',
    recordedAt: `${date}T08:00:00.000Z`,
    weight: value,
    weightUnit: unit,
    note: null,
  };
}

function session(id: string, startedAt: string, ended = true): WorkoutSessionSummary {
  return {
    id,
    userId: 'local-user',
    startedAt,
    endedAt: ended ? startedAt.replace('10:00', '11:00') : null,
    notes: null,
    setCount: 4,
    totalVolume: 1200,
    exerciseNames: ['Back Squat'],
  };
}

function input(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return {
    tasks: [],
    completionDatesByTask: new Map(),
    nutritionEntries: [],
    macroTarget: null,
    weightEntries: [],
    sessions: [],
    activeSession: null,
    nowMs: NOW,
    ...overrides,
  };
}

describe('buildDashboard', () => {
  it('counts only tasks scheduled today', () => {
    // 2026-08-14 is Friday: weekdays is due, weekends is not.
    const summary = buildDashboard(input({
      tasks: [task('daily', 'Daily'), task('weekday', 'Weekday', 'weekdays'), task('weekend', 'Weekend', 'weekends')],
    }));
    expect(summary.tasks).toMatchObject({ due: 2, done: 0, remaining: 2 });
    expect(summary.tasks.next.map((entry) => entry.task.title)).toEqual(['Daily', 'Weekday']);
  });

  it('separates completed, remaining, and at-risk tasks', () => {
    const summary = buildDashboard(input({
      tasks: [task('done', 'Done'), task('risk', 'At risk'), task('new', 'New')],
      completionDatesByTask: new Map([
        ['done', ['2026-08-13', '2026-08-14']],
        ['risk', ['2026-08-12', '2026-08-13']],
      ]),
    }));
    expect(summary.tasks).toMatchObject({ due: 3, done: 1, remaining: 2, atRisk: 1 });
    expect(summary.tasks.next[0].task.title).toBe('At risk');
  });

  it('limits the unfinished preview to three tasks', () => {
    const tasks = ['One', 'Two', 'Three', 'Four'].map((title, index) => task(String(index), title));
    expect(buildDashboard(input({ tasks })).tasks.next).toHaveLength(3);
  });

  it('uses the macro module’s serving and target calculations', () => {
    const macros = buildDashboard(input({
      nutritionEntries: [nutritionEntry(1.5)],
      macroTarget: target(),
    })).macros;
    expect(macros.totals).toEqual({ calories: 750, proteinG: 60, carbsG: 75, fatG: 22.5 });
    expect(macros.calories.fillRatio).toBe(0.375);
  });

  it('returns consumed macro totals even before targets exist', () => {
    const calories = buildDashboard(input({ nutritionEntries: [nutritionEntry()] })).macros.calories;
    expect(calories).toMatchObject({ consumed: 500, target: null, fillRatio: 0 });
  });

  it('shows the smoothed weight trend rather than the latest raw reading', () => {
    const summary = buildDashboard(input({
      weightEntries: [weight('2026-08-12', 80), weight('2026-08-13', 80), weight('2026-08-14', 86)],
    })).weight;
    expect(summary.latestKg).toBe(86);
    expect(summary.trendKg).toBe(82);
  });

  it('follows the latest logged weight unit', () => {
    const summary = buildDashboard(input({
      weightEntries: [weight('2026-08-13', 80), weight('2026-08-14', 176, 'lb')],
    })).weight;
    expect(summary.unit).toBe('lb');
  });

  it('is empty-safe across all modules', () => {
    const summary = buildDashboard(input());
    expect(summary.tasks).toMatchObject({ due: 0, done: 0, remaining: 0, atRisk: 0, next: [] });
    expect(summary.macros.totals.calories).toBe(0);
    expect(summary.weight).toMatchObject({ latestKg: null, trendKg: null, unit: 'kg' });
    expect(summary.workout).toEqual({ active: null, latestCompleted: null });
  });

  it('keeps an active workout ahead of completed history', () => {
    const active: WorkoutSession = {
      id: 'active',
      userId: 'local-user',
      startedAt: '2026-08-14T10:00:00.000Z',
      endedAt: null,
      notes: null,
    };
    const completed = session('completed', '2026-08-13T10:00:00.000Z');
    const summary = buildDashboard(input({ activeSession: active, sessions: [completed] }));
    expect(summary.workout.active?.id).toBe('active');
    expect(summary.workout.latestCompleted?.id).toBe('completed');
  });

  it('skips unfinished sessions when selecting recent completed history', () => {
    const openSummary = session('open', '2026-08-14T10:00:00.000Z', false);
    const completed = session('completed', '2026-08-13T10:00:00.000Z');
    expect(buildDashboard(input({ sessions: [openSummary, completed] })).workout.latestCompleted?.id)
      .toBe('completed');
  });
});
