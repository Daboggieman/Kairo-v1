/** Single-flight wrapper so lifecycle and mutation triggers cannot overlap replay. */

import type { SQLiteDatabase } from 'expo-sqlite';

import { syncOutbox, type SyncResult } from './outbox';

let activeSync: Promise<SyncResult> | null = null;

export function requestSync(db: SQLiteDatabase): Promise<SyncResult> {
  if (activeSync) return activeSync;
  activeSync = syncOutbox(db).finally(() => {
    activeSync = null;
  });
  return activeSync;
}
