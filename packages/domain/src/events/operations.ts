/**
 * UZ Aero — co RODZAJ OPERACJI mówi o trasie dnia.
 *
 * Operacja to nie jest sama etykieta w statystykach: przesądza, ile lotnisk ma ten dzień.
 * Skoki startują i lądują na tym samym placu — samolot krąży nad polem i wraca tam, skąd
 * wystartował. Przelot (dawniej „ferry"), egzamin, lot techniczny i „inne" mogą skończyć
 * gdzie indziej, więc opisuje je PARA kodów.
 *
 * Ta wiedza już raz zamieszkała w kodzie — detektor lotu włącza bramkę lądowania
 * (`sameFieldOnly`, `LANDING_FIELD_VICINITY_NM`) właśnie dla skoków, żeby fix z drugiego
 * końca Polski nie zamknął lotu. Do issue #13 formularz preflightu o tym nie wiedział
 * i pytał o dwa kody ICAO także przy skokach, każąc pilotowi wpisać ten sam dwa razy.
 * Reguła mieszka więc TUTAJ, w domenie, w jednym egzemplarzu: pyta o nią i formularz
 * (ile pól pokazać), i kokpit (czy uzbroić bramkę).
 */

import type { OperationType } from './events';

/**
 * Czy operacja z definicji zaczyna się i kończy na TYM SAMYM lotnisku.
 *
 * `true` → trasa to jedno pole (rekord i tak trzyma obie wartości równe, żeby projekcje,
 * arkusz i panel nie musiały znać wyjątku).
 */
export function isSameFieldOperation(operation: OperationType): boolean {
  return operation === 'skoki';
}
