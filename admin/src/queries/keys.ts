/**
 * UZ Aero - panel 2.0: klucze zapytań TanStack Query, wszystkie w JEDNYM miejscu.
 *
 * Hierarchicznie, żeby unieważnianie prefiksem było jednolinijkowe: mutacja, która
 * zmienia skład listy, unieważnia korzeń zasobu i nie musi znać żadnego konkretnego
 * filtra. Klucze dochodzą razem z ekranami, które ich używają - nigdy „na zapas".
 */

import type { FleetListQuery } from '../api/fleet';
import type { LogRangeQuery, SessionListQuery } from '../api/log';
import type { BugListQuery } from '../api/bugReports';
import type { PilotListQuery } from '../api/pilots';

export const keys = {
  /** Tożsamość i zdolności zalogowanego (`GET /admin/api/me`). */
  me: ['me'] as const,

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
  bugs: {
    all: ['bugs'] as const,
    list: (query: BugListQuery) => ['bugs', 'list', query] as const,
  },
};
