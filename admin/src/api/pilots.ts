/**
 * Ninerdeck - panel 2.0: konta pilotów (`/admin/api/pilots*`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * == HASLA NIE MA W ZADNYM ZADANIU - ANI W ZADNEJ ODPOWIEDZI ==
 * I to zdanie zostaje w mocy także po powrocie haseł w 2.1.0. Klub nie nadaje
 * poświadczeń: `sendPasswordLink` WYSYŁA list, a hasło ustawia jego adresat na stronie
 * z linku. W odpowiedzi jest adres i termin - nigdy link, nigdy kod do podyktowania
 * (`docs/logowanie-haslem.md` §5.4). Dostęp daje więc albo logowanie Googlem kontem
 * o wpisanym `email`, albo hasło ustawione z tego listu - w obu wypadkach e-mail jest
 * polem, od którego zależy, czy konto w ogóle da się użyć.
 *
 * == DOSTEPNOSC KONTA TO OSOBNE ZADANIE ==
 * `active` nie jedzie w `PATCH`-u i to jest decyzja serwera, nie uproszczenie panelu:
 * wyłączenie konta zrywa w JEDNEJ transakcji wszystkie sesje telefonu i przesuwa
 * granicę ważności poświadczeń. To inna operacja niż poprawienie nazwiska.
 */

import type {
  Capability,
  LoginSessionDto,
  PasswordLinkSentDto,
  PilotChangeDto,
  PilotPageDto,
} from './dto';
import { apiDelete, apiGet, apiPatch, apiPost } from './httpClient';

/**
 * Filtr listy tak, jak przyjmuje go trasa. Wszystko opcjonalne poza `limit` - brak
 * filtra znaczy „pokaż wszystkie konta".
 *
 * Trasa umie więcej (okno `from`/`to` dla dni lotnych); panel 2.0 o to nie pyta, bo
 * tych kolumn nie pokazuje.
 */
export interface PilotListQuery {
  /** `'true'`/`'false'` jako NAPIS: query string nie ma typu logicznego. */
  active?: 'true' | 'false';
  /** Fragment kodu, nazwiska albo e-maila - dopasowanie zawierające, nie dokładne. */
  q?: string;
  /**
   * Kierunek sortowania PO NAZWISKU - jedyny, który serwer zna
   * (`ORDER BY active DESC, name <dir>, code ASC`). Konta wyłączone stoją na końcu
   * niezależnie od kierunku i to nie jest parametr - to porządek listy.
   */
  sort?: 'asc' | 'desc';
  limit: number;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Pola nieustawione POMIJAMY zamiast wysyłać puste: `?q=` to dla zoda po drugiej
    // stronie napis pusty, czyli 400, a nie „bez filtra".
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function listPilots(query: PilotListQuery): Promise<PilotPageDto> {
  return apiGet<PilotPageDto>(`/pilots?${queryString(query)}`);
}

// DOPISANIA PILOTA TU NIE MA (issue #100, D3): `POST /pilots` zniknęło z serwera razem
// z drogą, którą opisywało. Nowy członek wchodzi WYŁĄCZNIE kodem klubu, a zatwierdza go
// administrator w karcie ZGŁOSZENIA; pierwszego administratora klubu zakłada moduł
// Organizacje. Klient tych tras dochodzi w epiku E (issue #101), razem z ekranami.

/** `PATCH` opisuje ZMIANĘ, nie stan docelowy - pola nieustawione zostają bez zmian. */
export interface UpdatePilotBody {
  code?: string;
  name?: string;
  email?: string;
  /** ZAKRES w całości - panel wysyła stan docelowy, a serwer liczy z niego różnicę. */
  capabilities?: Capability[];
}

export function updatePilot(id: string, body: UpdatePilotBody): Promise<PilotChangeDto> {
  return apiPatch<PilotChangeDto>(`/pilots/${encodeURIComponent(id)}`, body);
}

export function setPilotActive(id: string, active: boolean): Promise<PilotChangeDto> {
  return apiPost<PilotChangeDto>(`/pilots/${encodeURIComponent(id)}/active`, { active });
}

/**
 * TRWAŁE usunięcie konta - przechodzi WYŁĄCZNIE dla konta wyłączonego i bez historii.
 *
 * Serwer odmawia wszystkiego innego z powodem (`account_active`, `has_history`,
 * `self_delete`), więc panel nie musi (i nie może) zgadywać - lista nie niesie liczby
 * lotów, a zgadywanie „chyba da się usunąć" byłoby obietnicą przy nieodwracalnej akcji.
 */
export function deletePilot(id: string): Promise<void> {
  return apiDelete(`/pilots/${encodeURIComponent(id)}`);
}

// -- dostęp członka: link „ustaw hasło" i urządzenia (2.1.0, issue #134 D4) -----

/**
 * „Wyślij link do ustawienia hasła" w karcie członka.
 *
 * TEN SAM list, który ten człowiek wysłałby sobie sam przez „Nie pamiętam hasła" -
 * inny wyzwalacz, ten sam token, ta sama strona. Służy też osobie, która hasła jeszcze
 * NIE MA (pilot z Googlem, który ma latać ze wspólnego tabletu).
 *
 * Odmowy, które ekran musi umieć nazwać: `409 email_required` (osoba bez adresu -
 * tu wolno powiedzieć wprost, bo pyta administrator o członka swojego klubu),
 * `429 too_many_attempts`, `502 mail_failed` (token jest, list nie doszedł).
 */
export function sendPasswordLink(id: string): Promise<PasswordLinkSentDto> {
  return apiPost<PasswordLinkSentDto>(`/pilots/${encodeURIComponent(id)}/password-link`);
}

/**
 * Urządzenia członka W TYM klubie - i wyłącznie w tym.
 *
 * Sesji tej osoby w innym klubie tu nie ma i mieć nie może: to dane tamtego klubu.
 * Zawężenie robi serwer w zapytaniu, nie panel po odpowiedzi.
 */
export function pilotSessions(id: string): Promise<LoginSessionDto[]> {
  return apiGet<LoginSessionDto[]>(`/pilots/${encodeURIComponent(id)}/sessions`);
}

/** „Wyloguj" przy wierszu urządzenia. Cudza albo nieznana sesja → 404. */
export function revokePilotSession(id: string, sessionId: string): Promise<void> {
  return apiDelete(
    `/pilots/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`,
  );
}

/**
 * „Wyloguj wszędzie w tym klubie".
 *
 * Liczba w odpowiedzi jest jedyną odpowiedzią na „co się właśnie stało": zero znaczy
 * „nie było czego wylogować", a nie „nie udało się".
 */
export function revokeAllPilotSessions(id: string): Promise<{ revoked: number }> {
  return apiPost<{ revoked: number }>(`/pilots/${encodeURIComponent(id)}/sessions/revoke-all`);
}
