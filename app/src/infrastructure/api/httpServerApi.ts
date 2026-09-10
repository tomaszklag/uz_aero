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
  ClubsView,
  GoogleLoginResult,
  JoinClubResult,
  MembershipStatusResult,
  OrgRef,
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

  /**
   * Dwie odpowiedzi serwera, dwa stany - i to jest jedyne miejsce w aplikacji, które
   * zna te kody. `202` NIE jest błędem: osoba jest, aktywnego klubu nie ma (wielofirmowość
   * §5), więc jedzie token OSOBY i komplet klubów - to `clubs.status` rozstrzyga, czy
   * ekranem jest 00C, 00D czy 00E. Dlatego przez `send`, a nie `request`: `request`
   * odrzuciłby 202 jako odmowę i zgubił treść. Limit jak przy ponowieniu z ręki:
   * pilot stoi i patrzy.
   */
  async loginWithGoogle(idToken: string): Promise<GoogleLoginResult> {
    const response = await this.send('POST', '/auth/google', {
      body: { idToken },
      timeoutMs: MANUAL_TIMEOUT_MS,
    });

    if (response.status === 200) {
      return { kind: 'signed_in', tokens: (await response.json()) as AuthTokens };
    }
    if (response.status === 202) {
      const body = (await response.json()) as ClubsWire & { personToken: string };
      return { kind: 'no_club', personToken: body.personToken, clubs: clubsOf(body) };
    }
    throw new ServerRejectedError(response.status, await errorCode(response));
  }

  async membershipStatus(token: string): Promise<MembershipStatusResult> {
    const body = await this.request<ClubsWire & { tokens?: AuthTokens }>(
      'GET',
      '/auth/memberships',
      { token, timeoutMs: MANUAL_TIMEOUT_MS },
    );

    if (body.status === 'approved' && body.tokens != null) {
      return { kind: 'approved', tokens: body.tokens };
    }
    if (body.memberships != null) return { kind: 'clubs', clubs: clubsOf(body) };
    // Kształt spoza kontraktu: serwer odpowiedział, ale nie tym, co zna aplikacja.
    // Głośno, nie cicho - inaczej ekran oczekiwania stałby w miejscu bez powodu.
    throw new ServerRejectedError(200, 'bad_response');
  }

  /**
   * Kod klubu → zgłoszenie. Każda odmowa serwera jest tu WYNIKIEM, nie wyjątkiem, bo
   * każda ma na ekranie 00E inną drogę wyjścia (patrz `JoinClubResult`) - stąd `send`
   * zamiast `request`. Limit jak przy logowaniu: pilot właśnie przepisał kod z kartki.
   */
  async joinClub(token: string, code: string): Promise<JoinClubResult> {
    const response = await this.send('POST', '/auth/join', {
      token,
      body: { code },
      timeoutMs: MANUAL_TIMEOUT_MS,
    });
    const body = (await response.json().catch(() => null)) as
      | (Partial<ClubsWire> & {
          error?: string;
          org?: OrgRef;
          rejectReason?: string | null;
          decidedAt?: string | null;
          retryAfterSec?: number;
        })
      | null;

    if (response.status === 202 && body?.org != null) {
      return { kind: 'pending', org: body.org, clubs: clubsOf(body as ClubsWire) };
    }
    if (response.status === 403 && body?.org != null) {
      return {
        kind: 'rejected',
        org: body.org,
        rejectReason: body.rejectReason ?? null,
        decidedAt: body.decidedAt ?? null,
      };
    }
    if (response.status === 404) return { kind: 'unknown_code' };
    if (response.status === 409 && body?.org != null) {
      return body.error === 'membership_disabled'
        ? { kind: 'membership_disabled', org: body.org }
        : { kind: 'already_member', org: body.org };
    }
    if (response.status === 429) {
      // Bez `retryAfterSec` w ciele zostaje nagłówek, a bez niego minuta: powód
      // w przycisku ma podać czas, a nie powiedzieć „kiedyś".
      const header = Number(response.headers.get('retry-after'));
      const sec = body?.retryAfterSec ?? (Number.isFinite(header) ? header : 60);
      return { kind: 'rate_limited', retryAfterSec: Math.max(1, Math.round(sec)) };
    }
    throw new ServerRejectedError(response.status, body?.error ?? (await errorCode(response)));
  }

  async switchClub(token: string, orgId: string): Promise<AuthTokens | null> {
    const response = await this.send('POST', '/auth/switch', {
      token,
      body: { orgId },
      timeoutMs: MANUAL_TIMEOUT_MS,
    });
    // 404 = klub, którego ta osoba nie ma; dla niej NIEISTNIEJĄCY (epik C), więc `null`,
    // a nie wyjątek - ekran 13A pokazuje wtedy odmowę przy karcie, nie awarię.
    if (response.status === 404) return null;
    if (!response.ok) throw new ServerRejectedError(response.status, await errorCode(response));
    return (await response.json()) as AuthTokens;
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

/**
 * Kluby na drucie - ten sam kształt wraca z logowania, ze stanu członkostw i z dołączenia
 * kodem, bo serwer składa go JEDNĄ funkcją (`clubsView`). Osobny typ, żeby trzy miejsca
 * w tym adapterze nie opisywały go na trzy sposoby.
 */
interface ClubsWire {
  status: string;
  memberships: ClubsView['memberships'];
  person?: ClubsView['person'];
}

const clubsOf = (body: ClubsWire): ClubsView => ({
  status: body.status as ClubsView['status'],
  memberships: body.memberships ?? [],
  // Starszy serwer plakietki konta nie zna - ekran pokazuje wtedy sam stan, bez chipa.
  person: body.person ?? { name: '', email: null },
});

/** Kod błędu z ciała odpowiedzi; brak/nie-JSON → sam status wystarczy. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `http_${response.status}`;
  } catch {
    return `http_${response.status}`;
  }
}
