/**
 * The Envoy's vocabulary.
 *
 * Every assertion here is about wording and about which of three states a row is in — the two things
 * the screen would otherwise decide inline, and the two things that would drift if it did. Nothing
 * here needs a database: `outboxState` and its callers take rows and a clock.
 */

import type { OutboxRow, SyncEntity } from '@/db/outbox';

import {
  describeOutboxRow,
  describeRetryPolicy,
  describeSyncState,
  formatEnvoyTotals,
  outboxState,
  summariseSyncState,
  SYNC_ENTITY_LABELS,
} from '../envoy';

const NOW = Date.parse('2026-08-21T12:00:00.000Z');

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 1,
    user_id: 'local-user',
    entity_type: 'workout_set',
    entity_id: 'set-1',
    operation: 'upsert',
    payload: '{}',
    created_at: '2026-08-21T11:48:00.000Z',
    attempts: 0,
    last_error: null,
    next_attempt_at: '2026-08-21T11:48:00.000Z',
    ...overrides,
  };
}

describe('SYNC_ENTITY_LABELS', () => {
  it('names a module for every entity the outbox can hold', () => {
    /**
     * Spelled out rather than derived from the union: if a tenth entity type is added, this fails
     * and someone has to decide which screen it belongs to. A `Record` alone would only fail at
     * compile time, and a screen falling back to "Unknown" is the failure this prevents.
     */
    const entities: SyncEntity[] = [
      'body_weight_entry',
      'task',
      'task_completion',
      'food_item',
      'nutrition_entry',
      'macro_target',
      'workout_session',
      'workout_set',
      'movement_activity',
    ];
    for (const entity of entities) {
      expect(SYNC_ENTITY_LABELS[entity]).toBeTruthy();
    }
  });

  it('folds the table names onto the five screens a person recognises', () => {
    expect(SYNC_ENTITY_LABELS.task).toBe(SYNC_ENTITY_LABELS.task_completion);
    expect(SYNC_ENTITY_LABELS.workout_session).toBe(SYNC_ENTITY_LABELS.workout_set);
    expect(new Set(Object.values(SYNC_ENTITY_LABELS)).size).toBe(5);
  });
});

describe('outboxState', () => {
  it('reads a null next attempt as failed — which is what markFailed writes', () => {
    expect(outboxState(row({ next_attempt_at: null }), NOW)).toBe('failed');
  });

  it('reads a past next attempt as due and a future one as waiting', () => {
    expect(outboxState(row({ next_attempt_at: '2026-08-21T11:00:00.000Z' }), NOW)).toBe('due');
    expect(outboxState(row({ next_attempt_at: '2026-08-21T13:00:00.000Z' }), NOW)).toBe('waiting');
  });

  it('treats the exact boundary as due, matching listDue\'s <= comparison', () => {
    expect(outboxState(row({ next_attempt_at: new Date(NOW).toISOString() }), NOW)).toBe('due');
  });

  it('treats an unparseable timestamp as due rather than failed', () => {
    // SQLite compares it as a string and may well pick it up, so calling it failed here would
    // contradict what the sync loop then does with it.
    expect(outboxState(row({ next_attempt_at: 'not a date' }), NOW)).toBe('due');
  });
});

describe('describeOutboxRow', () => {
  it('names the module and what happened to it', () => {
    const { title } = describeOutboxRow(row({ entity_type: 'body_weight_entry' }), NOW);
    expect(title).toBe('The Scales · saved');
  });

  it('distinguishes the three operations', () => {
    expect(describeOutboxRow(row({ operation: 'update' }), NOW).title).toContain('changed');
    expect(describeOutboxRow(row({ operation: 'delete' }), NOW).title).toContain('removed');
  });

  it('says how long it has been queued', () => {
    expect(describeOutboxRow(row(), NOW).detail).toBe('queued 12 minutes ago');
  });

  it('mentions attempts only once there has been one', () => {
    expect(describeOutboxRow(row({ attempts: 0 }), NOW).detail).not.toContain('tr');
    expect(describeOutboxRow(row({ attempts: 1 }), NOW).detail).toContain('1 try');
    expect(describeOutboxRow(row({ attempts: 3 }), NOW).detail).toContain('3 tries');
  });

  it('says when a backing-off row will next be tried', () => {
    const { detail, state } = describeOutboxRow(
      row({ attempts: 2, next_attempt_at: '2026-08-21T12:04:00.000Z' }),
      NOW,
    );
    expect(state).toBe('waiting');
    expect(detail).toBe('queued 12 minutes ago · 2 tries · next in 4 minutes');
  });

  it('says nothing about a next attempt for a row that has given up', () => {
    const { detail, state } = describeOutboxRow(row({ attempts: 5, next_attempt_at: null }), NOW);
    expect(state).toBe('failed');
    expect(detail).not.toContain('next');
  });

  it('survives an unparseable created_at rather than printing NaN', () => {
    expect(describeOutboxRow(row({ created_at: 'nonsense' }), NOW).detail).toBe('queued');
  });
});

describe('formatEnvoyTotals', () => {
  it('counts failed separately and everything else as waiting', () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2, next_attempt_at: '2026-08-21T13:00:00.000Z' }),
      row({ id: 3, next_attempt_at: null }),
    ];
    expect(formatEnvoyTotals(rows, NOW)).toEqual({ waiting: 2, failed: 1 });
  });

  it('is zeroed for an empty satchel', () => {
    expect(formatEnvoyTotals([], NOW)).toEqual({ waiting: 0, failed: 0 });
  });
});

describe('describeSyncState', () => {
  it('says so plainly when the build carries no server address', () => {
    const state = describeSyncState(
      { configured: false, lastSyncAtMs: null, waiting: 3, failed: 0 },
      NOW,
    );
    expect(state.tone).toBe('idle');
    expect(state.title).toBe('No envoy sent');
  });

  it('leads with failures when there are any', () => {
    const state = describeSyncState(
      { configured: true, lastSyncAtMs: NOW - 12 * 60_000, waiting: 4, failed: 2 },
      NOW,
    );
    expect(state.tone).toBe('warn');
    expect(state.title).toBe('2 intents turned back');
    expect(state.detail).toContain('Last delivered 12 minutes ago');
  });

  it('reports the queue when it is merely working', () => {
    const state = describeSyncState(
      { configured: true, lastSyncAtMs: NOW - 60 * 60_000, waiting: 1, failed: 0 },
      NOW,
    );
    expect(state.tone).toBe('ok');
    expect(state.title).toBe('1 intent on the road');
    expect(state.detail).toBe('Last delivered 1 hour ago.');
  });

  it('says the satchel is empty when nothing is queued', () => {
    const state = describeSyncState(
      { configured: true, lastSyncAtMs: NOW - 60_000, waiting: 0, failed: 0 },
      NOW,
    );
    expect(state.title).toBe('The satchel is empty');
  });

  it('does not claim a delivery that has never happened', () => {
    const state = describeSyncState(
      { configured: true, lastSyncAtMs: null, waiting: 0, failed: 0 },
      NOW,
    );
    expect(state.detail).toContain('Nothing delivered yet');
  });
});

describe('summariseSyncState', () => {
  it('fits the Sanctum\'s one line', () => {
    expect(
      summariseSyncState({ configured: false, lastSyncAtMs: null, waiting: 0, failed: 0 }, NOW),
    ).toBe('Not configured');
    expect(
      summariseSyncState(
        { configured: true, lastSyncAtMs: NOW - 12 * 60_000, waiting: 0, failed: 0 },
        NOW,
      ),
    ).toBe('Nothing waiting · 12 minutes ago');
    expect(
      summariseSyncState(
        { configured: true, lastSyncAtMs: null, waiting: 3, failed: 1 },
        NOW,
      ),
    ).toBe('1 turned back · 3 waiting');
  });
});

describe('describeRetryPolicy', () => {
  it('states the cap the code actually implements, not the design caption', () => {
    // The design said "capped at 10m". MAX_BACKOFF_MS is an hour.
    expect(describeRetryPolicy(60 * 60 * 1000)).toBe('Doubling, capped at 1 hour');
  });

  it('reads in whichever unit fits the value', () => {
    expect(describeRetryPolicy(2 * 60 * 60 * 1000)).toBe('Doubling, capped at 2 hours');
    expect(describeRetryPolicy(10 * 60 * 1000)).toBe('Doubling, capped at 10 minutes');
    expect(describeRetryPolicy(60 * 1000)).toBe('Doubling, capped at 1 minute');
    expect(describeRetryPolicy(90 * 60 * 1000)).toBe('Doubling, capped at 90 minutes');
  });
});
