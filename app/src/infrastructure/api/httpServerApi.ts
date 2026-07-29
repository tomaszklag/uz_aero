/**
 * UZ Aero — ADAPTER `ServerPort` na fetch (kontrakt §4.6).
 *
 * Tłumaczy świat HTTP na dwa rodzaje niepowodzeń portu:
 *  • wyjątek fetch / timeout → `ServerUnreachableError` — normalny stan pracy w terenie,
 *  • odpowiedź poza 2xx → `ServerRejectedError(status, code)` — serwer żyje i odmawia.
 *
 * Timeout jest krótki (8 s): pętla synca woła nas przy każdej okazji, więc lepiej
 * szybko powiedzieć „offline" i wrócić za chwilę, niż wisieć na słabym zasięgu
 * i blokować kolejne okazje.
 */

import type {
  AuthTokens,
  PushResult,
  ReferenceFetch,
  RemoteAircraftState,
  RemoteThemePrefs,
  ServerPort,
  SessionSyncStatus,
} from '../../application/ports';
import { ServerRejectedError, ServerUnreachableError } from '../../application/ports';
import type { Event } from '../../domain';

const TIMEOUT_MS = 8_000;

export class HttpServerApi implements ServerPort {
  constructor(private readonly baseUrl: string) {}

  login(login: string, password: string): Promise<AuthTokens> {
    return this.request('POST', '/auth/login', { body: { login, password } });
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    return this.request('POST', '/auth/refresh', { body: { refreshToken } });
  }

  pushEvents(token: string, events: Event[], sourceDevice: string | null): Promise<PushResult> {
    // `syncedAt` jest księgowością TEGO telefonu — kopercie serwera nic po nim.
    const wire = events.map(({ syncedAt: _local, ...event }) => event);
    return this.request('POST', '/events', {
      token,
      body: sourceDevice != null ? { events: wire, sourceDevice } : { events: wire },
    });
  }

  /**
   * `GET /reference` z ETagiem (§4.8): przy zgodnym `If-None-Match` serwer odpowiada
   * 304 bez ciała — wtedy `data: null`, a cache telefonu zostaje uznany za aktualny.
   */
  async getReference(token: string, etag: string | null = null): Promise<ReferenceFetch> {
    const response = await this.send('GET', '/reference', {
      token,
      headers: etag != null ? { 'if-none-match': etag } : {},
    });
    if (response.status === 304) return { data: null, etag };
    if (!response.ok) throw new ServerRejectedError(response.status, await errorCode(response));
    return { data: await response.json(), etag: response.headers.get('etag') };
  }

  getAircraftState(token: string, aircraftId: string): Promise<RemoteAircraftState> {
    return this.request('GET', `/aircraft/${encodeURIComponent(aircraftId)}/state`, { token });
  }

  getSyncStatus(token: string, sessionUuid: string): Promise<SessionSyncStatus> {
    return this.request('GET', `/sessions/${encodeURIComponent(sessionUuid)}/sync-status`, {
      token,
    });
  }

  getPrefs(token: string): Promise<RemoteThemePrefs> {
    return this.request('GET', '/me/prefs', { token });
  }

  putPrefs(
    token: string,
    prefs: { theme: string; themeUpdatedAt: string },
  ): Promise<RemoteThemePrefs> {
    return this.request('PUT', '/me/prefs', { token, body: prefs });
  }

  /** Ścieżka standardowa: 2xx z JSON-em albo wyjątek portu. */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options: { token?: string; body?: unknown },
  ): Promise<T> {
    const response = await this.send(method, path, options);
    if (!response.ok) {
      const code = await errorCode(response);
      throw new ServerRejectedError(response.status, code);
    }
    return (await response.json()) as T;
  }

  /**
   * Surowe wysłanie żądania: mapuje wyłącznie awarie SIECI (`ServerUnreachableError`);
   * interpretację statusu zostawia wołającemu — `getReference` musi odróżnić 304 od błędu.
   */
  private async send(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options: { token?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...(options.body != null ? { 'content-type': 'application/json' } : {}),
          ...(options.token != null ? { authorization: `Bearer ${options.token}` } : {}),
          ...options.headers,
        },
        ...(options.body != null ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch (error) {
      throw new ServerUnreachableError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Kod błędu z ciała odpowiedzi; brak/nie-JSON → sam status wystarczy. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `http_${response.status}`;
  } catch {
    return `http_${response.status}`;
  }
}
