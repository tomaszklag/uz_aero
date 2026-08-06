/**
 * UZ Aero — przeszukiwanie historii wpisów (oznaczenia klienta, notatki) w arkuszu.
 *
 * Lista „ostatnio używane" przychodzi z serwera raz, przy wejściu na ekran (`/me/task-suggestions`),
 * i od tej chwili filtrujemy ją LOKALNIE, przy każdej literze — bez ani jednego dodatkowego
 * zapytania. Historia to najwyżej kilkadziesiąt krótkich napisów, więc szukanie po stronie
 * telefonu jest natychmiastowe i działa tak samo, gdy zasięg zniknie w połowie pisania.
 *
 * ══ KRÓTKIE SPIĘCIE: PRZEDŁUŻENIE PUSTEGO WYNIKU ══
 * Jeśli wpis „SKY X" nic nie znalazł, to „SKY XY" też nic nie znajdzie — dopisanie znaku
 * może wynik tylko zawęzić, nigdy poszerzyć (dopasowanie jest podciągiem). Zapamiętujemy
 * więc NAJKRÓTSZY wpis, który dał pustkę, i dopóki pilot go tylko przedłuża, w ogóle nie
 * przechodzimy po liście — zwracamy pustkę od razu (`skipped: true`).
 *
 * Skasowanie znaku wychodzi spod tego prefiksu i szukanie wraca do normalnej pracy; wynik
 * niepusty czyści pamięć, bo od tego miejsca w dół znowu może być co znaleźć.
 *
 * Moduł jest czysty (stan wędruje wejściem i wyjściem), więc obie reguły — dopasowanie
 * i spięcie — dają się sprawdzić bez React Native.
 */

import { foldPolish } from '../../../domain';
import type { TextSuggestion } from './TextEntrySheet';

/** Pamięć między wpisami: najkrótszy wpis, który NIC nie znalazł (już znormalizowany). */
export interface SuggestionSearchState {
  readonly emptyFrom: string | null;
}

export const EMPTY_SEARCH: SuggestionSearchState = { emptyFrom: null };

export interface SuggestionSearchResult {
  readonly matches: TextSuggestion[];
  readonly state: SuggestionSearchState;
  /** Czy pominęliśmy przeszukanie, bo krótszy wpis już nic nie dał (do testów i telemetrii). */
  readonly skipped: boolean;
}

/**
 * Podpowiedzi pasujące do wpisu. Pusty wpis oddaje CAŁĄ historię — to jest jej stan
 * spoczynku, czyli lista „ostatnio używane".
 */
export function searchSuggestions(
  rows: readonly TextSuggestion[],
  query: string,
  state: SuggestionSearchState = EMPTY_SEARCH,
): SuggestionSearchResult {
  const needle = foldPolish(query.trim());

  if (needle.length === 0) return { matches: [...rows], state: EMPTY_SEARCH, skipped: false };

  if (state.emptyFrom != null && needle.startsWith(state.emptyFrom)) {
    return { matches: [], state, skipped: true };
  }

  const matches = rows.filter((row) => foldPolish(row.value).includes(needle));
  return {
    matches,
    // Pusty wynik zapamiętujemy jako granicę; niepusty ją kasuje.
    state: matches.length === 0 ? { emptyFrom: needle } : EMPTY_SEARCH,
    skipped: false,
  };
}
