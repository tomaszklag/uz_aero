/**
 * Ninerdeck - panel 2.0: klucze zapytań TanStack Query, wszystkie w JEDNYM miejscu.
 *
 * Hierarchicznie, żeby unieważnianie prefiksem było jednolinijkowe: mutacja, która
 * zmienia skład listy, unieważnia korzeń zasobu i nie musi znać żadnego konkretnego
 * filtra. Klucze dochodzą razem z ekranami, które ich używają - nigdy „na zapas".
 */

import type { CalendarRange } from '../api/bookings';
import type { FleetListQuery } from '../api/fleet';
import type { LogRangeQuery, SessionListQuery } from '../api/log';
import type { BugListQuery } from '../api/bugReports';
import type { OrganizationListQuery } from '../api/organizations';
import type { PilotListQuery } from '../api/pilots';

export const keys = {
  /** Tożsamość i zdolności zalogowanego (`GET /admin/api/me`). */
  me: ['me'] as const,

  /**
   * Metody logowania tego wdrożenia (2.1.0) - konfiguracja serwera, pytana PRZED sesją.
   * Osobno od tożsamości sesji: to pytanie zadaje się PRZED zalogowaniem.
   */
  authMethods: ['authMethods'] as const,

  /**
   * MOJE KONTO (2.1.0): adres, metody logowania i własne urządzenia.
   *
   * Osobny korzeń od `me`, choć oba mówią o zalogowanym - i to jest cała różnica
   * między nimi: `me` przestawia ramę panelu i nie starzeje się nigdy, a to tutaj
   * starzeje się przy każdej zmianie hasła i każdym „Wyloguj" w liście urządzeń.
   * Wspólny korzeń kazałby przerysować kolumnę i pasek po to, żeby zapaliła się
   * plakietka metody.
   */
  account: {
    all: ['account'] as const,
    profile: ['account', 'profile'] as const,
    sessions: ['account', 'sessions'] as const,
  },

  /**
   * Konta pilotów.
   *
   * `detail` nie ma, bo formularz konta nie pobiera niczego osobno: otwiera wiersz,
   * który już jest na liście. Trasy `GET /pilots/:id` serwer nie wystawia - klub ma
   * kilkanaście kont i pobranie kompletu jest tańsze niż druga trasa.
   */
  pilots: {
    all: ['pilots'] as const,
    list: (query: PilotListQuery) => ['pilots', 'list', query] as const,
    /**
     * Urządzenia JEDNEGO członka W TYM klubie (2.1.0) - jedyne pytanie o pilota, które
     * naprawdę pyta serwer o coś, czego nie ma na liście. Pod prefiksem `pilots`, bo
     * starzeje się od tej samej rzeczy: wyłączenie członkostwa gasi też sesje.
     */
    sessions: (id: string) => ['pilots', 'sessions', id] as const,
  },

  /**
   * Kolejka zgłoszeń kodem klubu (issue #101, E3).
   *
   * OSOBNY korzeń od `pilots`, choć oba ekrany stoją na jednej stronie: to inna trasa,
   * inna zdolność i inny byt (kandydat kontra członek). Decyzja unieważnia OBA - i to
   * jest jedyne miejsce, w którym się spotykają.
   */
  memberships: {
    all: ['memberships'] as const,
    pending: ['memberships', 'pending'] as const,
  },

  /**
   * Kod klubu. Bez parametru, bo klub bierze się z SESJI, nie z adresu - panel klubu
   * prowadzi swój kod i tylko swój.
   */
  clubCode: ['clubCode'] as const,

  /**
   * Kluby na serwerze (moduł PLATFORMY, issue #101, E1).
   *
   * `detail` istnieje, inaczej niż przy kontach: karta klubu niesie KOD KLUBU, którego
   * wiersz listy nie ma, więc otwarcie karty naprawdę pyta serwer o coś nowego.
   */
  organizations: {
    all: ['organizations'] as const,
    list: (query: OrganizationListQuery) => ['organizations', 'list', query] as const,
    detail: (id: string) => ['organizations', 'detail', id] as const,
  },

  fleet: {
    /**
     * **Jedyny zasób bez korzenia obejmującego wszystko - i to jest treść, nie
     * niekonsekwencja.**
     *
     * Pod prefiksem `['fleet']` żyją DWA pytania o różnej naturze: skład listy
     * (starzeje się przy każdym zapisie) i próg dla pojemności (funkcja czysta,
     * `staleTime: Infinity`). `invalidateQueries` dopasowuje PREFIKSOWO, więc korzeń
     * unieważniałby jedno razem z drugim - a formularz jest w tej chwili otwarty, więc
     * jego zapytanie o próg jest AKTYWNE i natychmiast pytałoby serwer o liczbę,
     * która nie może się zmienić. Korzeń, który obiecuje więcej, niż którakolwiek
     * mutacja chce unieważnić, jest pułapką, a nie wygodą.
     */
    lists: ['fleet', 'list'] as const,
    list: (query: FleetListQuery) => ['fleet', 'list', query] as const,
    /**
     * Próg kluczowany POJEMNOSCIA, bo to jest całe pytanie: „jaki próg wyjdzie dla
     * 1100 L". Poprawianie liczby w formularzu tam i z powrotem wraca dzięki temu do
     * już policzonej odpowiedzi zamiast pytać serwer drugi raz o to samo.
     */
    tolerance: (capacityL: number) => ['fleet', 'tolerance', capacityL] as const,
  },

  /**
   * Dziennik. Trzy poziomy pod jednym prefiksem, bo starzeją się od tej samej rzeczy:
   * od nowej paczki zdarzeń. Zakres dat JEST częścią tożsamości pytania - „sierpień"
   * i „ostatnie 30 dni" to dwa różne raporty i oba mają prawo żyć w cache obok siebie,
   * żeby przełączanie szybkich filtrów wracało do policzonej odpowiedzi.
   */
  log: {
    all: ['log'] as const,
    fleet: (query: LogRangeQuery) => ['log', 'fleet', query] as const,
    sessions: (query: SessionListQuery) => ['log', 'sessions', query] as const,
    session: (uuid: string) => ['log', 'session', uuid] as const,
    track: (uuid: string) => ['log', 'track', uuid] as const,
  },

  /**
   * Zgłoszenia błędów (issue #87). KORZEŃ obejmuje wszystko i to jest właściwe:
   * pod tym prefiksem żyje jedno pytanie o jednej naturze (lista z licznikami),
   * więc zmiana statusu ma prawo unieważnić je w całości - inaczej niż przy
   * flocie, gdzie obok listy mieszka próg będący funkcją czystą.
   */
  /**
   * Kalendarz zajętości (3.0.0). ZAKRES DAT jest częścią tożsamości pytania - „ten
   * tydzień" i „miesiąc" to dwa różne obrazy i oba mają prawo żyć w cache obok siebie,
   * żeby przełączanie chipów wracało do policzonej odpowiedzi. Tak samo jak w dzienniku.
   *
   * KORZEŃ unieważnia każdy zapis: wyłączenie z użytku na trzy dni dotyka trzech kolumn
   * w każdym zakresie naraz, więc odświeżenie jednego z nich zostawiłoby pozostałe
   * z obrazem sprzed decyzji.
   */
  calendar: {
    all: ['calendar'] as const,
    range: (query: CalendarRange) => ['calendar', query] as const,
  },
  bugs: {
    all: ['bugs'] as const,
    list: (query: BugListQuery) => ['bugs', 'list', query] as const,
  },
};
