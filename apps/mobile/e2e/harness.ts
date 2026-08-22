/**
 * Shared plumbing for the end-to-end sync proofs — transport, credentials, preflight, drain.
 *
 * Extracted when the movement proof joined the workout-set one, because both need the same four
 * things and a copy in each file is how a transport fix lands in only one of them. Nothing here is
 * a test; the filename deliberately does not match `*.e2e.ts`, so the `test:e2e` script does not
 * try to run it as a suite.
 */

import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';

import type { SyncClient } from '@/sync/client';
import { failedCount, pendingCount } from '@/db/outbox';
import { syncOutbox } from '@/sync/outbox';

import type { TestDatabase } from '../src/db/__tests__/testDb';

/**
 * Real HTTP, over `node:http`, because the global `fetch` is not usable here.
 *
 * `jest-expo`'s setup replaces `globalThis.fetch` with Expo's native-backed implementation, whose
 * response object is inert without the native module behind it — a probe against a healthy backend
 * resolved to an object with no `status` and a falsy `ok`. Switching to the `node` test environment
 * changes nothing, because the preset installs it either way, and `undici` is not in the tree.
 *
 * So this is not a mock: it opens a socket and speaks HTTP to the real server. What it substitutes
 * is the *transport*, not the contract under test — the request the outbox builds, the route that
 * answers it, and the status the outbox reads back are all the production ones. The cast to
 * `Response` is the same seam `src/db/__tests__/testDb.ts` uses against `SQLiteDatabase`: only the
 * members the production code touches are implemented, so a new one fails loudly rather than
 * silently passing.
 */
export function nodeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const outgoing = send(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: init.method ?? 'GET',
        headers: (init.headers as Record<string, string>) ?? {},
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = incoming.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: incoming.statusMessage ?? '',
            json: () => Promise.resolve(JSON.parse(text)),
            text: () => Promise.resolve(text),
          } as Response);
        });
      },
    );
    outgoing.on('error', reject);
    if (typeof init.body === 'string') outgoing.write(init.body);
    outgoing.end();
  });
}

/**
 * `.env` is read here rather than through `src/sync/config.ts` because that module reads
 * `EXPO_PUBLIC_*` at **build** time — Expo's CLI inlines them, and nothing loads the file under
 * jest, so `syncConfig` is all-nulls in this process. Reading the file the app is configured from
 * keeps "the script uses the app's own credentials" true without duplicating the values.
 */
function loadCredentials(): { apiUrl: string; deviceKey: string } {
  const fromEnv = {
    apiUrl: process.env.KAIRO_E2E_API_URL,
    deviceKey: process.env.KAIRO_E2E_DEVICE_KEY,
  };
  if (fromEnv.apiUrl && fromEnv.deviceKey) {
    return { apiUrl: fromEnv.apiUrl.replace(/\/$/, ''), deviceKey: fromEnv.deviceKey };
  }

  let file = '';
  try {
    file = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  } catch {
    throw new Error(
      'No credentials. Set KAIRO_E2E_API_URL and KAIRO_E2E_DEVICE_KEY, or create apps/mobile/.env '
        + 'with EXPO_PUBLIC_KAIRO_API_URL and EXPO_PUBLIC_KAIRO_DEVICE_KEY.',
    );
  }
  const read = (key: string): string | undefined =>
    file
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith(`${key}=`))
      .map((line) => line.slice(key.length + 1).trim())
      .pop();

  const apiUrl = fromEnv.apiUrl ?? read('EXPO_PUBLIC_KAIRO_API_URL');
  const deviceKey = fromEnv.deviceKey ?? read('EXPO_PUBLIC_KAIRO_DEVICE_KEY');
  if (!apiUrl || !deviceKey) {
    throw new Error('apps/mobile/.env is missing EXPO_PUBLIC_KAIRO_API_URL or EXPO_PUBLIC_KAIRO_DEVICE_KEY.');
  }
  return { apiUrl: apiUrl.replace(/\/$/, ''), deviceKey };
}

const credentials = loadCredentials();

export const deviceKey = credentials.deviceKey;

/**
 * A `.env` pointing at the LAN IP is right for a phone and wrong for this process when the backend
 * is bound to loopback. The host is swapped only for the private ranges a dev machine hands out, so
 * a deliberately remote `KAIRO_E2E_API_URL` is still honoured.
 */
export const apiUrl = process.env.KAIRO_E2E_API_URL
  ? credentials.apiUrl
  : credentials.apiUrl.replace(/\/\/(?:192\.168|10|172\.(?:1[6-9]|2\d|3[01]))\.[\d.]+/, '//127.0.0.1');

/** Fail with an actionable message rather than a socket error nobody can read. */
export async function requireBackend(): Promise<void> {
  const health = await nodeFetch(`${apiUrl}/health`).catch((error: unknown) => {
    throw new Error(
      `No backend at ${apiUrl}. Start it with \`uvicorn app.main:app --reload\` from apps/backend. `
        + `(${error instanceof Error ? error.message : String(error)})`,
    );
  });
  if (!health.ok) throw new Error(`Backend at ${apiUrl} is unhealthy: ${health.status}`);
}

/**
 * `SyncClient` has no `get` — it exists to replay mutations, and adding a read method to production
 * code so a test can verify itself would be the test shaping the thing it checks. So the read side
 * authenticates on its own here, through the same `/auth/token` exchange.
 */
export async function authorizedGet(path: string): Promise<Response> {
  const auth = await nodeFetch(`${apiUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_key: credentials.deviceKey }),
  });
  if (!auth.ok) throw new Error(`Auth failed: ${auth.status} ${await auth.text()}`);
  const { access_token: token } = (await auth.json()) as { access_token: string };
  return nodeFetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

/**
 * Drain the queue and insist it emptied.
 *
 * `failedCount` is the assertion that matters most. `syncOutbox` reporting `complete` only means it
 * stopped; a row `markFailed` has set `next_attempt_at = NULL` on is invisible to `listDue`
 * **forever**, so a terminal failure looks like a quiet success from the outside. That is the exact
 * shape of the workout-set 409 bug, and checking the count is what makes it visible here.
 */
export async function drain(
  db: TestDatabase,
  client: SyncClient,
): Promise<{ succeeded: number; failed: number }> {
  const result = await syncOutbox(db, { client });
  expect(result.status).toBe('complete');
  expect(result.failed).toBe(0);
  await expect(pendingCount(db)).resolves.toBe(0);
  await expect(failedCount(db)).resolves.toBe(0);
  return result;
}
