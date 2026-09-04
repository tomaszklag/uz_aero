/**
 * UZ Aero - ADAPTER `ServerPort` na fetch (kontrakt §4.6).
 *
 * Tłumaczy świat HTTP na dwa rodzaje niepowodzeń portu:
 *  • wyjątek fetch / timeout → `ServerUnreachableError` - normalny stan pracy w terenie,
 *  • odpowiedź poza 2xx → `ServerRejectedError(status, code)` - serwer żyje i odmawia.
 *
 * DWA LIMITY CZASU, bo dwa różne pytania (uwaga z urządzenia, 2026-08-30).
 * W tle limit jest krótki: pętla okazji woła nas co minutę, więc lepiej szybko
 * powiedzieć „offline" i wrócić za chwilę, niż wisieć na słabym zasięgu i blokować
 * kolejne okazje. Pod przyciskiem „PONÓW PRÓBĘ" ten sam rachunek jest odwrotny -
 * nikt nie wróci za minutę, bo to pilot właśnie poprosił i patrzy na ekran, a poprosił
 * dokładnie wtedy, gdy długo nic nie szło, czyli gdy serwer zdążył się uśpić.
 * Zimny start bywa dłuższy niż 8 s i to zamieniało udaną wysyłkę w „brak sieci":
 * telefon przerywał, serwer w tym samym czasie przyjmował paczkę i zapisywał ją,
 * a w logach API zostawał sukces przy pilotze patrzącym na napis OFFLINE.
 *
 * Który limit obowiązuje, wynika z `SyncTrigger` - warstwa aplikacji mówi, KTO
 * poprosił, a sekundy zostają tutaj, bo są własnością transportu.
 */

import type {
  AuthTokens,
  BugReportPushResult,
  RemoteBugReport,
  PushResult,
  ReferenceFetch,
  RemoteEventPage,
  RemoteAircraftState,
  RemoteReadingsChain,
  RemoteTaskSuggestions,
  RemoteThemePrefs,
  ServerPort,
  SessionSyncStatus,
} from '../../application/ports';
import { ServerRejectedError, ServerUnreachableError } from '../../application/ports';
import type { SyncTrigger } from '../../application/ports';
import type { Event, SessionTrackPayload } from '../../domain';

/** Pętla okazji - krótko, bo zaraz wróci. */
const TIMEOUT_MS = 8_000;
/** Ponowienie z ręki pilota - tyle, ile trwa obudzenie uśpionej instancji. */
const MANUAL_TIMEOUT_MS = 30_000;

function timeoutFor(trigger: SyncTrigger | undefined): number {
  return trigger === 'manual' ? MANUAL_TIMEOUT_MS : TIMEOUT_MS;
}

export class HttpServerApi implements ServerPort {
  constructor(private readonly baseUrl: string) {}

  login(login: string, password: string): Promise<AuthTokens> {
    return this.request('POST', '/auth/login', { body: { login, password } });
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    return this.request('POST', '/auth/refresh', { body: { refreshToken } });
  }

  pushEvents(
    token: string,
    events: Event[],
    sourceDevice: string | null,
    trigger?: SyncTrigger,
  ): Promise<PushResult> {
    // `syncedAt` jest księgowością TEGO telefonu - kopercie serwera nic po nim.
    const wire = events.map(({ syncedAt: _local, ...event }) => event);
    return this.request('POST', '/events', {
      token,
      body: sourceDevice != null ? { events: wire, sourceDevice } : { events: wire },
      timeoutMs: timeoutFor(trigger),
    });
  }

  /**
   * `GET /me/events` (§4.9) - strona własnego rejestru. Kursor jedzie w query stringu
   * ZAKODOWANY (`encodeURIComponent`), bo jest base64url z serwera i nie mamy prawa
   * zakładać, że każdy jego znak przetrwa sklejenie adresu.
   */
  pullEvents(
    token: string,
    params: { cursor?: string | null; limit?: number } = {},
  ): Promise<RemoteEventPage> {
    const query = new URLSearchParams();
    if (params.cursor != null) query.set('cursor', params.cursor);
    if (params.limit != null) query.set('limit', String(params.limit));
    const suffix = query.toString();
    return this.request('GET', `/me/events${suffix !== '' ? `?${suffix}` : ''}`, { token });
  }

  /**
   * `GET /reference` z ETagiem (§4.8): przy zgodnym `If-None-Match` serwer odpowiada
   * 304 bez ciała - wtedy `data: null`, a cache telefonu zostaje uznany za aktualny.
   */
  async getReference(
    token: string,
    etag: string | null = null,
    trigger?: SyncTrigger,
  ): Promise<ReferenceFetch> {
    const response = await this.send('GET', '/reference', {
      token,
      headers: etag != null ? { 'if-none-match': etag } : {},
      timeoutMs: timeoutFor(trigger),
    });
    if (response.status === 304) return { data: null, etag };
    if (!response.ok) throw new ServerRejectedError(response.status, await errorCode(response));
    return { data: await response.json(), etag: response.headers.get('etag') };
  }

  getAircraftState(token: string, aircraftId: string): Promise<RemoteAircraftState> {
    return this.request('GET', `/aircraft/${encodeURIComponent(aircraftId)}/state`, { token });
  }

  /**
   * `GET /aircraft/:id/readings-chain?at=…` (issue #62) - sąsiedzi w łańcuchu odczytów
   * (paliwo, motogodziny) i kotwica pomiaru oleju na tę chwilę.
   *
   * `except` wysyłamy tylko przy poprawianiu istniejącego wpisu: bez tego sesja byłaby
   * sobie własnym punktem odniesienia i zawsze „zgadzała się" sama ze sobą.
   */
  getReadingsChain(
    token: string,
    aircraftId: string,
    params: { at: number; exceptSessionUuid?: string },
  ): Promise<RemoteReadingsChain> {
    const query = new URLSearchParams({ at: String(params.at) });
    if (params.exceptSessionUuid != null) query.set('except', params.exceptSessionUuid);
    return this.request(
      'GET',
      `/aircraft/${encodeURIComponent(aircraftId)}/readings-chain?${query.toString()}`,
      { token },
    );
  }

  getSyncStatus(token: string, sessionUuid: string): Promise<SessionSyncStatus> {
    return this.request('GET', `/sessions/${encodeURIComponent(sessionUuid)}/sync-status`, {
      token,
    });
  }

  pushTraces(token: string, entries: unknown[]): Promise<{ accepted: number }> {
    return this.request('POST', '/traces', { token, body: { entries } });
  }

  pushBugReports(token: string, reports: RemoteBugReport[]): Promise<BugReportPushResult> {
    return this.request('POST', '/me/bug-reports', { token, body: { reports } });
  }

  getSessionTrack(token: string, sessionUuid: string): Promise<SessionTrackPayload> {
    return this.request('GET', `/me/sessions/${encodeURIComponent(sessionUuid)}/track`, { token });
  }

  getTaskSuggestions(token: string): Promise<RemoteTaskSuggestions> {
    return this.request('GET', '/me/task-suggestions', { token });
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
    options: { token?: string; body?: unknown; timeoutMs?: number },
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
   * interpretację statusu zostawia wołającemu - `getReference` musi odróżnić 304 od błędu.
   */
  private async send(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options: {
      token?: string;
      body?: unknown;
      headers?: Record<string, string>;
      /** Brak = limit tła; patrz nota na górze pliku. */
      timeoutMs?: number;
    },
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);

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
