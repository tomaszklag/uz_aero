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

import type { FlagListQuery } from '../api/flags';

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
   * KORZENIE zasobów, które zmienia rozstrzygnięcie flagi — a których ekranów
   * jeszcze nie ma.
   *
   * Wygląda na klucze „na zapas" i nimi nie jest: unieważnienie jest własnością
   * MUTACJI, nie ekranu (§4.3). Rozwiązanie flagi zmienia stan eksportu karty dnia
   * i kolumnę „Arkusz" na liście dni — jeżeli `useResolveFlag` nie ogłosi tego tutaj
   * i teraz, to w dniu, w którym powstanie `A02`, nikt nie będzie pamiętał, żeby
   * dopisać unieważnienie w cudzym pliku. Unieważnienie prefiksu, pod którym nie ma
   * zapytań, jest operacją pustą — więc ta deklaracja nic nie kosztuje.
   */
  sessions: { all: ['sessions'] as const },
  exports: { all: ['exports'] as const },
  dashboard: ['dashboard'] as const,
};
