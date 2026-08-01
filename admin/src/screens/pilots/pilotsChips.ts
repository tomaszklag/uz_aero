/**
 * UZ Aero — panel: CHIPY FILTRA listy kont na `A06` (moduł CZYSTY).
 *
 * ══ CHIP Z LICZBĄ JEST OBIETNICĄ, NIE OZDOBĄ ══
 * Napis „Nieaktywni 2" znaczy „po kliknięciu zobaczysz dwa wiersze" — i to jest jedyna
 * rzecz, którą ten moduł ma utrzymać. Do 2026-08-01 chipy nosiły liczby KAFLI, czyli
 * liczby po całym klubie: po wpisaniu frazy tabela miała jeden wiersz, chip „Nieaktywni"
 * nadal pokazywał 2, a kliknięcie w niego dawało pustą tabelę. Liczba na chipie
 * pochodzi więc z `scopes` (serwer liczy je W BIEŻĄCYM WYSZUKIWANIU), a nie z `counts`.
 *
 * Osobny plik od `pilotsTiles.ts`, mimo że oba składają liczby nagłówka ekranu: kafel
 * opisuje KLUB i ma nie drgać przy wpisywaniu w wyszukiwarkę, chip opisuje TRAFIENIA
 * i musi drgać. Jeden plik na dwie sprzeczne zasady byłby zaproszeniem do pomylenia ich.
 *
 * Chipy NIE zawężają się wybranym chipem — tylko wyszukiwaniem. Inaczej liczby na
 * czterech chipach przestałyby być porównywalne między sobą, a chip aktywny pokazywałby
 * zawsze tyle, ile właśnie widać.
 */

import type { PilotScopeCountsDto } from '../../api/dto';
import type { PilotScope } from './pilotsFilters';

export interface PilotChip {
  scope: PilotScope;
  label: string;
  /** `undefined` = odpowiedzi jeszcze nie ma; chip renderuje się wtedy bez liczby. */
  count: number | undefined;
}

/** Kolejność jak w mockupie A06: od najszerszego zawężenia do najwęższego. */
const CHIPS: readonly { scope: PilotScope; label: string; of: keyof PilotScopeCountsDto }[] = [
  { scope: 'all', label: 'Wszyscy', of: 'total' },
  { scope: 'active', label: 'Aktywni', of: 'active' },
  { scope: 'inactive', label: 'Nieaktywni', of: 'inactive' },
  { scope: 'panel', label: 'Z rolą panelu', of: 'panel' },
];

/**
 * `null` = serwer jeszcze nie odpowiedział. Chip zostaje wtedy BEZ liczby zamiast
 * pokazać zero: zero jest twierdzeniem o świecie („nie ma ani jednego nieaktywnego
 * konta"), a brak odpowiedzi nim nie jest. Ta sama zasada, co „—" na kaflach.
 */
export function pilotChips(scopes: PilotScopeCountsDto | null): PilotChip[] {
  return CHIPS.map((chip) => ({
    scope: chip.scope,
    label: chip.label,
    count: scopes == null ? undefined : scopes[chip.of],
  }));
}
