/** Authenticated HTTP client with one refresh/re-auth retry on `401`. */

import type { SyncConfig } from './config';

type Fetch = typeof fetch;

type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class SyncClient {
  private tokens: TokenPair | null = null;

  constructor(
    private readonly config: { apiUrl: string; deviceKey: string },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async post(path: string, body: unknown): Promise<void> {
    await this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async delete(path: string): Promise<void> {
    await this.request(path, { method: 'DELETE' });
  }

  async patch(path: string, body: unknown): Promise<void> {
    await this.request(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async put(path: string, body: unknown): Promise<void> {
    await this.request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request(path: string, init: RequestInit): Promise<void> {
    if (!this.tokens) await this.authenticate();
    let response = await this.authorizedFetch(path, init);
    if (response.status === 401) {
      await this.refreshOrAuthenticate();
      response = await this.authorizedFetch(path, init);
    }
    if (!response.ok) throw await apiError(response);
  }

  private authorizedFetch(path: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(`${this.config.apiUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.tokens?.access_token ?? ''}`,
      },
    });
  }

  private async authenticate(): Promise<void> {
    const response = await this.fetchImpl(`${this.config.apiUrl}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_key: this.config.deviceKey }),
    });
    if (!response.ok) throw await apiError(response);
    this.tokens = (await response.json()) as TokenPair;
  }

  private async refreshOrAuthenticate(): Promise<void> {
    if (!this.tokens?.refresh_token) {
      await this.authenticate();
      return;
    }
    const response = await this.fetchImpl(`${this.config.apiUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.tokens.refresh_token }),
    });
    if (response.ok) {
      this.tokens = (await response.json()) as TokenPair;
      return;
    }
    this.tokens = null;
    await this.authenticate();
  }
}

async function apiError(response: Response): Promise<ApiError> {
  let detail = response.statusText || `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') {
      detail = body.detail;
    } else if (body.detail !== undefined) {
      // FastAPI/Pydantic validation returns an array of field errors. Preserve it instead of
      // collapsing the useful location/message data to an opaque HTTP status.
      detail = JSON.stringify(body.detail);
    }
  } catch {
    // A proxy or offline gateway may return non-JSON; the status remains actionable.
  }
  return new ApiError(detail, response.status);
}

export function createSyncClient(
  config: SyncConfig,
  fetchImpl: Fetch = fetch,
): SyncClient | null {
  if (!config.apiUrl || !config.deviceKey) return null;
  return new SyncClient({ apiUrl: config.apiUrl, deviceKey: config.deviceKey }, fetchImpl);
}
