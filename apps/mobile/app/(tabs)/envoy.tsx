/**
 * The Envoy — what has not yet reached the server, and why.
 *
 * The one screen in the app about the app rather than about training. Everything on it comes from
 * `sync_outbox`, whose rows are the durable record of every local mutation that has not been
 * confirmed; the wording is `src/domain/envoy.ts`'s.
 *
 * A hidden tab, like The Call and The Oracle: it has no place in a six-tab bar of training screens,
 * but it is a tab rather than a root route so that returning from it lands back on the tab the user
 * came from.
 *
 * Departures from `5.26_the_envoy`, all for the same reason — the design shows figures the app has
 * no source for, and inventing a source for a diagnostics screen would defeat the point of it:
 *
 * - **No DELIVERED count.** `markSucceeded` deletes the row it succeeded on, so a delivered intent
 *   leaves nothing behind by construction. The design's "214 items delivered" would need a ledger
 *   table that does not exist. The strip is two cells, not three.
 * - **No token row.** "Token expires in 41 minutes" needs a token that outlives one sync and an
 *   `exp` somebody parses; `SyncClient` holds its pair in a private field and `createSyncClient`
 *   builds a fresh instance per run (`src/sync/client.ts`), so there is no such thing to report.
 * - **No "Forget Credentials".** The device key is a build-time constant from
 *   `EXPO_PUBLIC_KAIRO_DEVICE_KEY`, not something stored on the device, so the button would be a
 *   no-op that implies the app is holding a secret it could drop.
 * - **The retry cap is stated as one hour, not the design's ten minutes.** `MAX_BACKOFF_MS` is
 *   3,600,000. The screen reads the constant rather than repeating the caption.
 * - **No SENDING state.** It exists only inside one pass of `syncOutbox`'s loop and is never
 *   written down. The three states a query can actually distinguish are in `outboxState`.
 * - **"Send now" is the `AppBar` action, not a docked footer button**, per the convention that
 *   dropped every full-width footer slab in the rebuild.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  AppBar,
  Card,
  CardHeader,
  EmptyState,
  IconButton,
  Notice,
  Pill,
  RowGroup,
  Screen,
  ScreenScroll,
  Section,
  StatStrip,
} from '@/components/Layout';
import { LOCAL_USER_ID } from '@/constants';
import { discard, failedCount, listAll, requeue, requeueAll, type OutboxRow } from '@/db/outbox';
import { getLastSyncAt } from '@/db/preferences';
import {
  describeOutboxRow,
  describeRetryPolicy,
  describeSyncState,
  formatEnvoyTotals,
  OUTBOX_STATE_LABELS,
} from '@/domain/envoy';
import { syncConfig } from '@/sync/config';
import { MAX_BACKOFF_MS } from '@/sync/outbox';
import { requestSync } from '@/sync/scheduler';
import { colors, fontSize, layout, lineHeight, spacing, type as typeScale } from '@/theme';

/** Build-time configuration, so this cannot change while the app is running. */
const CONFIGURED = Boolean(syncConfig.apiUrl && syncConfig.deviceKey);

export default function EnvoyScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  /**
   * One clock reading per load, seeded lazily — `Date.now()` in a render body is impure and
   * `react-hooks/purity` rejects it. Every relative label on the screen is computed against the
   * same instant, which is also what stops two rows disagreeing about what "now" is.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [failed, setFailed] = useState(0);
  const [lastSyncAtMs, setLastSyncAtMs] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  /**
   * `isCurrent` lets a caller abandon a read whose results have been superseded. The focus effect
   * below passes one; the button handlers do not, because a press is by definition the current
   * intent.
   */
  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    try {
      const [all, failures, lastSync] = await Promise.all([
        listAll(db),
        failedCount(db),
        getLastSyncAt(db, LOCAL_USER_ID),
      ]);
      if (!isCurrent()) return;
      setRows(all);
      setFailed(failures);
      setLastSyncAtMs(lastSync);
      setNowMs(Date.now());
      setError(null);
    } catch (caught) {
      if (isCurrent()) setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (isCurrent()) setLoaded(true);
    }
  }, [db]);

  /**
   * On focus, not on mount. The satchel is filled by every other screen in the app and drained by
   * `SyncBootstrap` on its own 60-second timer, so what the queue held when this tab first mounted
   * is stale by the time anyone comes back to it — the same reason the Citadel reads on focus
   * (`app/(tabs)/index.tsx`). The `cancelled` flag stops a slow read that was already in flight when
   * the tab lost focus from overwriting the fresh one that replaced it.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void load(() => !cancelled);
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  /**
   * Send, then reload. `requestSync` is single-flight already, so a second press while one is in
   * flight joins the run rather than starting a second one; `sending` is about the button, not
   * about mutual exclusion.
   */
  async function sendNow() {
    setSending(true);
    try {
      const result = await requestSync(db);
      if (result.status === 'disabled') {
        Alert.alert('No envoy sent', 'This build carries no server address.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
      await load();
    }
  }

  async function retry(id: number) {
    try {
      await requeue(db, id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function retryAll() {
    try {
      await requeueAll(db);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  /**
   * Abandoning an intent throws away the only record of it, so it asks first — the same safeguard
   * The March uses for finishing a recording. It exists because a payload the server will never
   * accept (a 422) is terminal by definition: retrying it forever is not a way out of the queue.
   */
  function confirmDiscard(row: OutboxRow) {
    const { title } = describeOutboxRow(row, nowMs);
    Alert.alert(
      'Abandon this intent?',
      `${title} will never reach the server. The change stays on this device.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await discard(db, row.id);
                await load();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : String(caught));
              }
            })();
          },
        },
      ],
    );
  }

  const totals = formatEnvoyTotals(rows, nowMs);
  const state = describeSyncState(
    { configured: CONFIGURED, lastSyncAtMs, waiting: totals.waiting, failed },
    nowMs,
  );

  return (
    <Screen>
      <AppBar
        title="The Envoy"
        onBack={() => router.back()}
        action={
          <IconButton
            icon="send-outline"
            label="Send now"
            variant="outlined"
            onPress={() => void sendNow()}
            disabled={!CONFIGURED || sending}
          />
        }
      />

      <ScreenScroll>
        {error ? (
          <Notice tone="danger" title="Could not read the satchel">
            {error}
          </Notice>
        ) : null}

        {/*
          Unconfigured is a degraded runtime, not a reading, so it is a `Notice` — the same call
          The Oracle makes for the same condition. Everything else is a computed read-back of the
          queue, which is the accent-soft card.
        */}
        {CONFIGURED ? (
          <Card style={styles.hero}>
            <CardHeader
              title={state.tone === 'warn' ? 'Turned back' : 'The road'}
              tone={state.tone === 'warn' ? 'danger' : 'accent'}
              action={failed > 0 ? <Pill label={`${failed} FAILED`} tone="danger" /> : null}
            />
            <Text style={styles.heroTitle}>{state.title}</Text>
            <Text style={styles.heroDetail}>{state.detail}</Text>
          </Card>
        ) : (
          <Notice tone="info" title={state.title}>
            {state.detail}
          </Notice>
        )}

        {/* Only when there is something to aggregate — three zeroes above an empty list is chrome
            describing nothing. */}
        {rows.length > 0 ? (
          <StatStrip
            items={[
              { label: 'Waiting', value: String(totals.waiting) },
              { label: 'Failed', value: String(failed), tone: failed > 0 ? 'danger' : 'text' },
            ]}
          />
        ) : null}

        <Section
          title="The satchel"
          action={
            failed > 0 ? (
              <IconButton
                icon="refresh"
                label="Retry everything that failed"
                onPress={() => void retryAll()}
              />
            ) : null
          }
        >
          {/* Gated on `loaded`: the list starts `[]`, so without this the empty state flashes
              before the first query resolves. */}
          {!loaded ? null : rows.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              body={
                CONFIGURED
                  ? 'Every change on this device has been delivered.'
                  : 'Changes are kept here until a server address is configured.'
              }
            />
          ) : (
            <RowGroup>
              {rows.map((row) => (
                <OutboxRowView
                  key={row.id}
                  row={row}
                  nowMs={nowMs}
                  onRetry={() => void retry(row.id)}
                  onDiscard={() => confirmDiscard(row)}
                />
              ))}
            </RowGroup>
          )}
        </Section>

        <Section title="The road">
          <RowGroup>
            <InfoRow
              label="Endpoint"
              value={syncConfig.apiUrl ?? 'Not set'}
            />
            <InfoRow label="Retries" value={describeRetryPolicy(MAX_BACKOFF_MS)} />
            <InfoRow label="Batch" value="20 intents per pass, in order" />
          </RowGroup>
          <Text style={styles.footnote}>
            Intents are replayed in the order they were made, and one failure stops the pass — a
            later delete must not overtake a create that has not landed.
          </Text>
        </Section>
      </ScreenScroll>
    </Screen>
  );
}

/**
 * One intent in the satchel.
 *
 * Both affordances appear only on a row that has given up. A row that is merely backing off already
 * has a next attempt scheduled, and offering to retry it invites pressing a button to make something
 * happen that was going to happen anyway.
 */
function OutboxRowView({
  row,
  nowMs,
  onRetry,
  onDiscard,
}: {
  row: OutboxRow;
  nowMs: number;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const { title, detail, state } = describeOutboxRow(row, nowMs);
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
        {row.last_error ? (
          <Text style={styles.rowError} numberOfLines={2}>
            {row.last_error}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowEnd}>
        <Pill
          label={OUTBOX_STATE_LABELS[state]}
          tone={state === 'failed' ? 'danger' : state === 'waiting' ? 'muted' : 'accent'}
        />
        {state === 'failed' ? (
          <View style={styles.rowActions}>
            <IconButton icon="refresh" label={`Retry ${title}`} onPress={onRetry} />
            <IconButton icon="delete-outline" label={`Abandon ${title}`} onPress={onDiscard} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A row that reports rather than navigates, so it takes no chevron and no press. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.accentSoft, gap: spacing.sm },
  heroTitle: { color: colors.text, ...typeScale.headlineSm },
  heroDetail: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  rowMain: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowDetail: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  rowError: { color: colors.danger, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  /** The status and its actions stack right-aligned, so the pills line up down the list. */
  rowEnd: { alignItems: 'flex-end', gap: spacing.sm },
  rowActions: { flexDirection: 'row', gap: spacing.xs },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  infoLabel: { color: colors.text, fontSize: fontSize.md },
  /** `flexShrink: 1` so a long endpoint wraps inside the row instead of pushing the label out. */
  infoValue: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    flexShrink: 1,
    textAlign: 'right',
  },
  footnote: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
});
