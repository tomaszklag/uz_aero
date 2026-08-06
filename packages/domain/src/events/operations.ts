/**
 * UZ Aero — co RODZAJ OPERACJI mówi o kształcie dnia.
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

/**
 * Czy w tym dniu w ogóle wynosi się skoczków — czyli czy zdarzenie `drop` ma sens.
 *
 * Zrzut jest STRONĄ PRZYCHODOWĄ dnia skokowego (§3.7): niesie liczbę skoczków w rozbiciu
 * na typy, dziedziczy klienta z preflightu i wchodzi do rozliczenia. Przelot, egzamin,
 * lot techniczny i „inne" nie mają czego wynosić, więc przycisk zrzutu w kokpicie takiego
 * dnia był ofertą zapisania zdarzenia, które nie mogło się wydarzyć (issue #19).
 *
 * Predykat jest osobny od `isSameFieldOperation`, choć dziś oba odpowiadają `true` dla tej
 * samej wartości — bo odpowiadają na różne pytania. Gdyby doszła operacja „zloty" (jedno
 * lotnisko, zero skoczków), rozjechałyby się natychmiast, a złączenie ich w jeden predykat
 * kazałoby wtedy szukać, które z dwóch znaczeń miał na myśli każdy z wołających.
 */
export function isJumpOperation(operation: OperationType): boolean {
  return operation === 'skoki';
}
