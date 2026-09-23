/**
 * Ninerdeck - ADAPTER `ServerPort` na fetch (kontrakt §4.6).
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
  AccountMethods,
  LoginMethods,
  MembershipStatusResult,
  OrgRef,
  PasswordLoginResult,
  SetPasswordResult,
  BookingWriteResult,
  DecisionRefusal,
  DecisionResult,
  InboxCursor,
  RemoteApproval,
  RemoteApprovalQueue,
  RemoteAircraftPreview,
  RemoteInbox,
  RemoteBooking,
  RemoteBookingDetail,
  RemotePilotPreview,
  RemoteBookingDraft,
  RemoteBookingPatch,
  RemoteCalendar,
  RemoteSlotSuggestions,
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
import type { Event, PasswordWeakness, SessionTrackPayload } from '../../domain';

/** Pętla okazji - krótko, bo zaraz wróci. */
const TIMEOUT_MS = 8_000;
/** Ponowienie z ręki pilota - tyle, ile trwa obudzenie uśpionej instancji. */
const MANUAL_TIMEOUT_MS = 30_000;

function timeoutFor(trigger: SyncTrigger | undefined): number {
  return trigger === 'manual' ? MANUAL_TIMEOUT_MS : TIMEOUT_MS;
}

export class HttpServerApi implements ServerPort {
  /**
   * `device` to napis, po którym CZŁOWIEK rozpozna swój tablet na liście sesji
   * w panelu („Android 14 · Pixel 7 · Ninerdeck 2.1.0"). Jedzie z KAŻDYM żądaniem,
   * bo serwer używa go dwa razy: przy zakładaniu sesji i przy odświeżaniu stempla
   * „ostatnio aktywny" w bramie (2.1.0, §6).
   *
   * Podaje go WOŁAJĄCY, a nie ten adapter: model i wersję zna React Native, a warstwa
   * infrastruktury nie importuje UI (`architecture.test.ts`). `null` = nie wiemy -
   * wtedy nagłówka po prostu nie ma i panel napisze „urządzenie nieznane", zamiast
   * dostać zmyśloną nazwę.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly device: string | null = null,
  ) {}

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

  /** Co to wdrożenie umie - publiczne, bo pyta o to ekran bez sesji. */
  async methods(): Promise<LoginMethods> {
    return this.request<LoginMethods>('GET', '/auth/methods', {
      timeoutMs: MANUAL_TIMEOUT_MS,
    });
  }

  /** Czym może się zalogować TA osoba - ustawienia, sekcja „Hasło" (§5.3). */
  async account(token: string): Promise<AccountMethods> {
    return this.request<AccountMethods>('GET', '/me/account', { token });
  }

  /**
   * Logowanie hasłem - te same dwa wyjścia, co Google, plus trzy odmowy jako WYNIKI.
   *
   * Przez `send`, nie `request`, z dwóch powodów naraz: `202` nie jest błędem (osoba
   * bez klubu), a odmowy mają na 00F różne drogi wyjścia - zdanie przy polu albo czas
   * w przycisku. Limit jak przy Google: pilot stoi nad tabletem, a serwer liczy scrypt
   * (N = 2¹⁷, czyli ułamek sekundy, ale instancja mogła się uśpić).
   */
  async loginWithPassword(input: {
    login: string;
    password: string;
    orgId?: string | null;
  }): Promise<PasswordLoginResult> {
    const response = await this.send('POST', '/auth/password', {
      body: {
        login: input.login,
        password: input.password,
        // Klub urządzenia jedzie TYLKO, gdy jest: `orgId: null` w ciele to dla zoda
        // po drugiej stronie wartość, a nie brak pola.
        ...(input.orgId != null ? { orgId: input.orgId } : {}),
      },
      timeoutMs: MANUAL_TIMEOUT_MS,
    });

    if (response.status === 200) {
      return { kind: 'signed_in', tokens: (await response.json()) as AuthTokens };
    }
    if (response.status === 202) {
      const body = (await response.json()) as ClubsWire & { personToken: string };
      return { kind: 'no_club', personToken: body.personToken, clubs: clubsOf(body) };
    }

    const body = (await response.json().catch(() => null)) as
      | { error?: string; retryAfterSec?: number }
      | null;
    if (response.status === 429) {
      return { kind: 'rate_limited', retryAfterSec: retryAfterOf(response, body) };
    }
    if (response.status === 401 && body?.error === 'account_disabled') {
      return { kind: 'account_disabled' };
    }
    // Każda inna odmowa 401 to `invalid_credentials`: serwer ma dla trzech stanów
    // (login nieznany / bez hasła / złe hasło) JEDNĄ odpowiedź i adapter nie ma prawa
    // jej rozbijać. `400 bad_request` zostaje wyjątkiem - to błąd nasz, nie pilota.
    if (response.status === 401) return { kind: 'invalid_credentials' };
    throw new ServerRejectedError(response.status, body?.error ?? (await errorCode(response)));
  }

  /**
   * Prośba o link „ustaw hasło". Odpowiedź `202` jest jedyną, jaką serwer daje dla
   * adresu - znanego i nieznanego - więc nie ma czego zwracać i nie ma czego rozróżniać.
   *
   * `429` TEŻ NIE JEST TU BŁĘDEM i to nie jest wygoda, tylko ta sama reguła, przez którą
   * serwer odpowiada `202` na wszystko: gdyby wyczerpany limit dawał na 00G inne zdanie
   * niż wysłany list, byłby JEDYNĄ różnicą widoczną z zewnątrz - a ekran stoi przed
   * każdym, kto zna adres aplikacji. Wyjątkiem zostaje brak sieci, bo wtedy list
   * naprawdę nie poszedł (`send` rzuca `ServerUnreachableError`).
   */
  async forgotPassword(email: string): Promise<void> {
    await this.sendLink('/auth/password/forgot', { email });
  }

  /** „Załóż konto" - ten sam list, nowa osoba powstaje przy realizacji linku (§5.4a). */
  async signUp(input: { name: string; email: string }): Promise<void> {
    await this.sendLink('/auth/signup', { name: input.name, email: input.email });
  }

  /**
   * Wspólny ogon obu próśb o list. Jedna funkcja, bo obie mają odpowiadać CO DO ZNAKU
   * tak samo - rozjazd między nimi wyliczałby konta jedną stroną formularza.
   */
  private async sendLink(path: string, body: Record<string, string>): Promise<void> {
    const response = await this.send('POST', path, { body, timeoutMs: MANUAL_TIMEOUT_MS });
    if (response.ok || response.status === 429) return;
    throw new ServerRejectedError(response.status, await errorCode(response));
  }

  /**
   * Ustawienie albo zmiana własnego hasła (arkusz 13B). Odmowy są WYNIKAMI, bo każda
   * ma w arkuszu inne miejsce: złe obecne hasło - przy polu „Obecne", polityka - przy
   * „Nowe", limit - w przycisku.
   */
  async setPassword(
    token: string,
    input: { current?: string; next: string },
  ): Promise<SetPasswordResult> {
    const response = await this.send('PUT', '/me/password', {
      token,
      body: { ...(input.current != null ? { current: input.current } : {}), next: input.next },
      timeoutMs: MANUAL_TIMEOUT_MS,
    });
    if (response.status === 204) return { kind: 'ok' };

    const body = (await response.json().catch(() => null)) as
      | { error?: string; reason?: PasswordWeakness; retryAfterSec?: number }
      | null;
    if (response.status === 429) {
      return { kind: 'rate_limited', retryAfterSec: retryAfterOf(response, body) };
    }
    if (response.status === 400 && body?.error === 'weak_password' && body.reason != null) {
      return { kind: 'weak_password', reason: body.reason };
    }
    if (response.status === 409 && body?.error === 'email_required') {
      return { kind: 'email_required' };
    }
    // `401` PADA TU Z DWÓCH RÓŻNYCH POWODÓW i wolno zamienić na wynik tylko jeden:
    // `invalid_credentials` mówi o OBECNYM HAŚLE, a `unauthorized` - o tokenie, który
    // wygasł albo został unieważniony. Zwinięte w jedno, arkusz 13B mówiłby pilotowi
    // „złe obecne hasło" godzinę po zalogowaniu, zamiast po cichu odświeżyć token
    // i ponowić (ta sama droga, co w syncu).
    if (response.status === 401 && body?.error === 'invalid_credentials') {
      return { kind: 'invalid_credentials' };
    }
    throw new ServerRejectedError(response.status, body?.error ?? (await errorCode(response)));
  }

  /**
   * Wylogowanie po stronie serwera - kasuje refresh i stempluje sesję.
   *
   * ODMOWY NIE SĄ TU BŁĘDEM: serwer oddaje `204` także dla poświadczenia martwego, a
   * gdyby kiedyś oddał co innego, wylogowanie na telefonie i tak ma się odbyć. Jedyne,
   * co wołający musi wiedzieć, to czy serwer odpowiedział - stąd wyjątek zostaje
   * wyłącznie przy BRAKU SIECI (`send` rzuca `ServerUnreachableError`).
   */
  async logout(refreshToken: string): Promise<void> {
    await this.send('POST', '/auth/logout', {
      body: { refreshToken },
      timeoutMs: MANUAL_TIMEOUT_MS,
    });
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
      return { kind: 'rate_limited', retryAfterSec: retryAfterOf(response, body) };
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
  getBookings(
    token: string,
    params: { from: number; to: number; aircraftId?: string },
  ): Promise<RemoteCalendar> {
    const query = new URLSearchParams({
      from: new Date(params.from).toISOString(),
      to: new Date(params.to).toISOString(),
    });
    if (params.aircraftId != null) query.set('aircraftId', params.aircraftId);
    return this.request('GET', `/bookings?${query.toString()}`, { token });
  }

  getBooking(token: string, id: string): Promise<RemoteBookingDetail> {
    return this.request('GET', `/bookings/${encodeURIComponent(id)}`, { token });
  }

  getPilotPreview(token: string, bookingId: string, pilotId: string): Promise<RemotePilotPreview> {
    return this.request(
      'GET',
      `/bookings/${encodeURIComponent(bookingId)}/preview/pilot/${encodeURIComponent(pilotId)}`,
      { token },
    );
  }

  getAircraftPreview(token: string, bookingId: string): Promise<RemoteAircraftPreview> {
    return this.request('GET', `/bookings/${encodeURIComponent(bookingId)}/preview/aircraft`, {
      token,
    });
  }

  getSlotSuggestions(
    token: string,
    params: { aircraftId: string; day: number; minutes: number; preferredAt?: number },
  ): Promise<RemoteSlotSuggestions> {
    const query = new URLSearchParams({
      aircraftId: params.aircraftId,
      day: new Date(params.day).toISOString(),
      minutes: String(params.minutes),
    });
    if (params.preferredAt != null) {
      query.set('preferredAt', new Date(params.preferredAt).toISOString());
    }
    return this.request('GET', `/bookings/suggestions?${query.toString()}`, { token });
  }

  /**
   * Zapis rezerwacji idzie przez `send`, a nie `request`, i to nie jest szczegół:
   * `request` zamienia każdą odmowę w wyjątek z samym kodem, a tutaj ODMOWA NIESIE
   * TREŚĆ - przy `slot_taken` serwer dokłada kolidującą zajętość, kosztem punktu
   * zapisu w transakcji (epik R-B). Ekran ma powiedzieć, CO stoi w tym czasie.
   *
   * Awarie SIECI zostają wyjątkiem (`send` mapuje je na `ServerUnreachableError`):
   * „nie wiem, czy zapisano" to inna wiadomość niż „slot zajęty".
   */
  async createBooking(token: string, draft: RemoteBookingDraft): Promise<BookingWriteResult> {
    return this.write(await this.send('POST', '/bookings', { token, body: draft }));
  }

  async patchBooking(
    token: string,
    id: string,
    patch: RemoteBookingPatch,
  ): Promise<BookingWriteResult> {
    const response = await this.send('PATCH', `/bookings/${encodeURIComponent(id)}`, {
      token,
      body: patch,
    });
    return this.write(response);
  }

  async cancelBooking(
    token: string,
    id: string,
    reason: string | null,
  ): Promise<BookingWriteResult> {
    const response = await this.send(
      'DELETE',
      `/bookings/${encodeURIComponent(id)}`,
      { token, body: reason == null ? {} : { reason } },
    );
    return this.write(response);
  }

  getInbox(token: string, page?: { limit?: number; before?: InboxCursor }): Promise<RemoteInbox> {
    const query = new URLSearchParams();
    if (page?.limit != null) query.set('limit', String(page.limit));
    if (page?.before != null) {
      query.set('beforeAt', page.before.beforeAt);
      query.set('beforeId', page.before.beforeId);
    }
    const suffix = query.toString();
    return this.request('GET', suffix === '' ? '/me/notifications' : `/me/notifications?${suffix}`, {
      token,
    });
  }

  async markNotificationRead(token: string, id: string): Promise<void> {
    const response = await this.send('POST', `/me/notifications/${encodeURIComponent(id)}/read`, {
      token,
    });
    if (!response.ok) throw new ServerRejectedError(response.status, await errorCode(response));
  }

  getApprovalQueue(token: string): Promise<RemoteApprovalQueue> {
    return this.request('GET', '/me/approvals/queue', { token });
  }

  async registerPushToken(token: string, deviceToken: string): Promise<void> {
    const response = await this.send('POST', '/me/push-token', { token, body: { token: deviceToken } });
    if (!response.ok) throw new ServerRejectedError(response.status, await errorCode(response));
  }

  /**
   * Decyzja idzie przez `send`, jak zapis rezerwacji: odmowa NIESIE KOD, który ekran
   * nazywa przy przycisku („podaj powód", „to nie Twój krok"), a `request` zamieniłby
   * ją w wyjątek. Awaria sieci zostaje wyjątkiem - „nie wiem, czy zapisano" to inna
   * wiadomość niż odmowa.
   */
  async decideBooking(
    token: string,
    id: string,
    body: { decision: 'approved' | 'rejected'; reason: string | null },
  ): Promise<DecisionResult> {
    const response = await this.send('POST', `/bookings/${encodeURIComponent(id)}/decision`, {
      token,
      body,
    });
    const parsed = (await response.json().catch(() => null)) as
      | { error?: string; status?: string; approval?: RemoteApproval }
      | null;
    if (response.ok) {
      if (parsed?.status == null || parsed.approval == null) {
        throw new ServerRejectedError(response.status, `http_${response.status}`);
      }
      return { ok: true, status: parsed.status, approval: parsed.approval };
    }
    const refusal = parsed?.error;
    if (refusal == null) throw new ServerRejectedError(response.status, `http_${response.status}`);
    // 401 zostaje wyjątkiem, żeby `authorizedFetch` odświeżył token i ponowił.
    if (response.status === 401) throw new ServerRejectedError(response.status, refusal);
    return { ok: false, refusal: refusal as DecisionRefusal };
  }

  /** Odpowiedź zapisu → wynik: sukces z wierszem albo odmowa z tym, co koliduje. */
  private async write(response: Response): Promise<BookingWriteResult> {
    const body = (await response.json().catch(() => null)) as
      | { error?: string; taken?: RemoteBooking; takenAt?: string }
      | RemoteBooking
      | null;

    if (response.ok) {
      if (body == null) throw new ServerRejectedError(response.status, `http_${response.status}`);
      return { ok: true, booking: body as RemoteBooking };
    }

    const refusal = (body as { error?: string } | null)?.error;
    // Bez nazwanego powodu to nie jest odmowa REGUŁY, tylko awaria - i tak ma
    // wyglądać na ekranie (401 po wygaśnięciu tokenu, 500, odpowiedź nie-JSON).
    if (refusal == null) throw new ServerRejectedError(response.status, `http_${response.status}`);
    const taken = (body as { taken?: RemoteBooking }).taken ?? null;
    const at = (body as { takenAt?: string }).takenAt;
    const takenAt = at == null ? null : Date.parse(at);
    return {
      ok: false,
      refusal,
      taken,
      takenAt: takenAt == null || Number.isNaN(takenAt) ? null : takenAt,
    };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
          // Telefon PODAJE SIĘ SAM - przeglądarka nie ma jak, więc serwer składa jej
          // etykietę z `User-Agent`. Nasza jest krótka i rozpoznawalna, bo ma
          // odpowiedzieć na jedno pytanie: „czy to moje urządzenie".
          ...(this.device != null ? { 'x-ninerdeck-device': this.device } : {}),
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
/**
 * Ile odczekać po `429`. Bez `retryAfterSec` w ciele zostaje nagłówek `Retry-After`,
 * a bez niego minuta: powód w przycisku ma podać CZAS, a nie powiedzieć „kiedyś".
 *
 * Jedno miejsce, bo limity ma dziś troje: kod klubu, logowanie hasłem i zmiana hasła -
 * a trzy kopie tego samego rachunku rozjechałyby się przy pierwszej poprawce jednej.
 */
function retryAfterOf(response: Response, body: { retryAfterSec?: number } | null): number {
  const header = Number(response.headers.get('retry-after'));
  const sec = body?.retryAfterSec ?? (Number.isFinite(header) ? header : 60);
  return Math.max(1, Math.round(sec));
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `http_${response.status}`;
  } catch {
    return `http_${response.status}`;
  }
}
