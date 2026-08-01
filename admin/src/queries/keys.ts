/**
 * UZ Aero — panel: klucze zapytań TanStack Query, wszystkie w JEDNYM miejscu.
 *
 * Hierarchicznie, żeby unieważnianie prefiksem było jednolinijkowe
 * (`docs/architektura-panelu-frontend.md` §4.2): mutacja, która zmienia skład listy,
 * unieważnia `keys.<zasób>.all` i nie musi znać żadnego konkretnego filtra.
 *
 * Klucze dochodzą razem z ekranami, które ich używają — z jednym wyjątkiem,
 * opisanym niżej przy `sessions`/`exports`/`dashboard`.
 */

import type { AuditListQuery } from '../api/audit';
import type { CorrectionDraftDto } from '../api/dto';
import type { FlagListQuery } from '../api/flags';
import type { SessionListQuery } from '../api/sessions';

export const keys = {
  /** Tożsamość i zdolności zalogowanego (`GET /admin/api/me`). */
  me: ['me'] as const,

  flags: {
    all: ['flags'] as const,
    list: (query: FlagListQuery) => ['flags', 'list', query] as const,
    /** Sam licznik spraw danego statusu (`limit=1`; liczy się wyłącznie `total`). */
    count: (status: 'open' | 'resolved') => ['flags', 'count', status] as const,
  },

  /**
   * Dni lotne (`A02`, `A02a`).
   *
   * `list` NIE zawiera kursora i to jest istota tego klucza: kursor keyset opisuje
   * pozycję WEWNĄTRZ jednego wyniku filtra, więc jest parametrem strony (`pageParam`
   * zapytania nieskończonego), a nie częścią jego tożsamości. Wpisanie go do klucza
   * dałoby osobny wpis cache'u na każdą stronę i pierwszy powrót „wstecz" zaczynałby
   * listę od nowa.
   *
   * `count` odpowiada na INNE pytanie niż lista: kafle nad tabelą („dni z flagą",
   * „wyeksportowane") potrzebują liczby, którą policzył serwer całym filtrem, a nie
   * sumy z wierszy pobranej strony — ta kłamałaby przy każdym obcięciu `limit`-em.
   */
  sessions: {
    all: ['sessions'] as const,
    list: (query: SessionListQuery) => ['sessions', 'list', query] as const,
    count: (query: SessionListQuery) => ['sessions', 'count', query] as const,
    detail: (sessionUuid: string) => ['sessions', 'detail', sessionUuid] as const,
  },

  /**
   * Dziennik audytu (`A09`).
   *
   * Tak samo jak przy dniach: `list` NIE zawiera kursora (to parametr strony, nie
   * tożsamość pytania), a `count` odpowiada na inne pytanie niż lista — kafle nad
   * tabelą („wpisy dziś") potrzebują liczby policzonej przez serwer całym filtrem,
   * a nie sumy z pobranej strony.
   */
  audit: {
    all: ['audit'] as const,
    list: (query: AuditListQuery) => ['audit', 'list', query] as const,
    count: (query: AuditListQuery) => ['audit', 'count', query] as const,
  },

  /**
   * PODGLĄD korekty (`A02b`) — dry-run, więc zwykłe zapytanie z cache'em.
   *
   * Cały szkic (`targetUuid` + akcja + `newTime`) jest częścią klucza, bo jest częścią
   * PYTANIA: „co się stanie, jeśli przesunę to zdarzenie na 13:01:33" to inne pytanie
   * niż „…na 13:02:00". Dzięki temu przełączanie `retime` ↔ `void` w formularzu wraca
   * do już policzonej odpowiedzi zamiast pytać serwer drugi raz o to samo — a mockup
   * przewiduje właśnie takie przełączanie tam i z powrotem.
   */
  corrections: {
    all: ['corrections'] as const,
    preview: (sessionUuid: string, draft: CorrectionDraftDto) =>
      ['corrections', 'preview', sessionUuid, draft] as const,
  },

  /**
   * KORZENIE zasobów, których ekranów jeszcze nie ma.
   *
   * Wygląda na klucze „na zapas" i nimi nie jest: unieważnienie jest własnością
   * MUTACJI, nie ekranu (§4.3). Rozwiązanie flagi zmienia stan eksportu karty dnia,
   * więc `useResolveFlag` ogłasza to tutaj i teraz — inaczej w dniu, w którym powstanie
   * ekran eksportów, nikt nie będzie pamiętał, żeby dopisać unieważnienie w cudzym
   * pliku. Unieważnienie prefiksu, pod którym nie ma zapytań, jest operacją pustą.
   */
  exports: { all: ['exports'] as const },
  dashboard: ['dashboard'] as const,
};
