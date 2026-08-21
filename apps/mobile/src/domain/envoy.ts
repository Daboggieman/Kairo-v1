/**
 * The Envoy's vocabulary: what the sync outbox is doing, in words.
 *
 * The screen shows rows from `src/db/outbox.ts`, whose columns are transport bookkeeping —
 * `entity_type`, `attempts`, `next_attempt_at`. Turning those into something a person can read is
 * wording, and wording that is tested lives here rather than at the call site, for the reason the
 * conventions give: four screens end up saying the same three things about the same figures, and a
 * phrase written four times ends up worded three ways. This is the sixth link in that chain, after
 * `tasks.ts`, `workouts.ts`, `macros.ts`, `weight.ts` and `movement.ts`.
 *
 * Nothing here touches the database or the network. It takes rows and a clock and returns strings.
 */

import type { OutboxRow, SyncEntity } from '@/db/outbox';

import { relativeTimeLabel, untilTimeLabel } from './dates';

/**
 * Which module an intent belongs to, in the app's own names.
 *
 * Nine entity types collapse onto five screens, because that is the answer to the question being
 * asked: someone looking at a stuck row wants to know *what of mine has not been saved*, and
 * "task_completion" is a table name, not an answer. The three workout types and the two task types
 * each fold into one.
 */
export const SYNC_ENTITY_LABELS: Record<SyncEntity, string> = {
  body_weight_entry: 'The Scales',
  task: 'The Rites',
  task_completion: 'The Rites',
  food_item: 'The Feast',
  nutrition_entry: 'The Feast',
  macro_target: 'The Feast',
  workout_session: 'The Forge',
  workout_set: 'The Forge',
  movement_activity: 'The Expedition',
};

/**
 * What a row is doing, from `next_attempt_at` alone.
 *
 * The design draws three states — sending, waiting, failed — but *sending* is not one of them:
 * it exists only inside one pass of `syncOutbox`'s loop and is never written down, so a screen that
 * showed it would be showing a state no query can return. What the column actually distinguishes is
 * these three:
 *
 * - `due`    — `next_attempt_at` has passed; the next run picks it up.
 * - `waiting` — backing off; `next_attempt_at` says when.
 * - `failed`  — NULL, which is what `markFailed` writes. Invisible to the sync loop until requeued.
 */
export type OutboxState = 'due' | 'waiting' | 'failed';

export function outboxState(row: OutboxRow, nowMs: number): OutboxState {
  if (row.next_attempt_at === null) return 'failed';
  const at = Date.parse(row.next_attempt_at);
  /**
   * An unparseable timestamp counts as due rather than as failed. `listDue`'s comparison is a string
   * comparison in SQLite, so such a row may well be picked up on the next run — calling it failed
   * here would contradict what the loop then does with it.
   */
  if (!Number.isFinite(at)) return 'due';
  return at <= nowMs ? 'due' : 'waiting';
}

export const OUTBOX_STATE_LABELS: Record<OutboxState, string> = {
  due: 'WAITING',
  waiting: 'HOLDING',
  failed: 'FAILED',
};

/**
 * One outbox row as two lines: what it is, and where it stands.
 *
 * `attempts` is only mentioned once it is greater than zero. A row that has never been tried is the
 * normal case, and "0 tries" reads as a failure rather than as a queue working correctly.
 */
export function describeOutboxRow(
  row: OutboxRow,
  nowMs: number,
): { title: string; detail: string; state: OutboxState } {
  const state = outboxState(row, nowMs);
  const module = SYNC_ENTITY_LABELS[row.entity_type] ?? 'Unknown';
  const created = Date.parse(row.created_at);
  const queued = Number.isFinite(created)
    ? `queued ${relativeTimeLabel(created, nowMs)}`
    : 'queued';

  const parts: string[] = [queued];
  if (row.attempts > 0) {
    parts.push(`${row.attempts} ${row.attempts === 1 ? 'try' : 'tries'}`);
  }
  if (state === 'waiting' && row.next_attempt_at !== null) {
    const next = Date.parse(row.next_attempt_at);
    if (Number.isFinite(next)) parts.push(`next ${untilTimeLabel(next, nowMs)}`);
  }

  return { title: `${module} · ${OPERATION_LABELS[row.operation]}`, detail: parts.join(' · '), state };
}

const OPERATION_LABELS: Record<OutboxRow['operation'], string> = {
  upsert: 'saved',
  update: 'changed',
  delete: 'removed',
};

/**
 * The two-cell strip above the list.
 *
 * Two cells, not the design's three: it shows a DELIVERED count, and there is nothing to count it
 * from. `markSucceeded` deletes the row it succeeded on, so a delivered intent leaves no trace by
 * construction — the outbox is a queue, not a ledger. Reporting a number there would mean adding a
 * table to hold it, which is a feature and not this screen.
 */
export function formatEnvoyTotals(
  rows: readonly OutboxRow[],
  nowMs: number,
): { waiting: number; failed: number } {
  let waiting = 0;
  let failed = 0;
  for (const row of rows) {
    if (outboxState(row, nowMs) === 'failed') failed += 1;
    else waiting += 1;
  }
  return { waiting, failed };
}

/**
 * The hero line: whether sync is set up, and when it last got something through.
 *
 * `lastSyncAtMs` is the last time an intent *reached the server*, not the last time the loop ran —
 * `syncOutbox` only stamps it on a success, because with a sync attempt every 60 seconds "it ran"
 * is true almost always and answers nothing.
 */
export function describeSyncState(
  input: { configured: boolean; lastSyncAtMs: number | null; waiting: number; failed: number },
  nowMs: number,
): { title: string; detail: string; tone: 'ok' | 'idle' | 'warn' } {
  if (!input.configured) {
    return {
      title: 'No envoy sent',
      detail: 'This build carries no server address, so everything stays on this device.',
      tone: 'idle',
    };
  }

  const last = input.lastSyncAtMs === null
    ? 'nothing delivered yet'
    : `last delivered ${relativeTimeLabel(input.lastSyncAtMs, nowMs)}`;

  if (input.failed > 0) {
    return {
      title: `${input.failed} ${input.failed === 1 ? 'intent' : 'intents'} turned back`,
      detail: `${capitalise(last)}. Retry sends them again.`,
      tone: 'warn',
    };
  }
  if (input.waiting > 0) {
    return {
      title: `${input.waiting} ${input.waiting === 1 ? 'intent' : 'intents'} on the road`,
      detail: `${capitalise(last)}.`,
      tone: 'ok',
    };
  }
  return {
    title: 'The satchel is empty',
    detail: `${capitalise(last)}. Everything on this device has been delivered.`,
    tone: 'ok',
  };
}

/**
 * The one-line summary The Sanctum shows on its Envoy row, where there is no room for two.
 */
export function summariseSyncState(
  input: { configured: boolean; lastSyncAtMs: number | null; waiting: number; failed: number },
  nowMs: number,
): string {
  if (!input.configured) return 'Not configured';
  const parts: string[] = [];
  if (input.failed > 0) parts.push(`${input.failed} turned back`);
  if (input.waiting > 0) parts.push(`${input.waiting} waiting`);
  if (parts.length === 0) parts.push('Nothing waiting');
  if (input.lastSyncAtMs !== null) {
    parts.push(relativeTimeLabel(input.lastSyncAtMs, nowMs));
  }
  return parts.join(' · ');
}

/**
 * The retry policy, in the words the code actually implements.
 *
 * The design says "exponential, capped at 10m". `MAX_BACKOFF_MS` in `src/sync/outbox.ts` is one
 * hour. This prints the real cap, because a settings screen that misdescribes the thing it is
 * describing is worse than one that omits it.
 */
export function describeRetryPolicy(maxBackoffMs: number): string {
  const minutes = Math.round(maxBackoffMs / 60_000);
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Doubling, capped at ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `Doubling, capped at ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
