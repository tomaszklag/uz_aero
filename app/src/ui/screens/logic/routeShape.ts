/**
 * Ninerdeck - KSZTAŁT TRASY WYNIKA Z RODZAJU OPERACJI (issue #13).
 *
 * Skoki wracają tam, skąd wystartowały, więc opisuje je JEDNO lotnisko; pozostałe
 * operacje mogą skończyć gdzie indziej i zostają przy parze kodów. O tym, która
 * operacja jest którym kształtem, orzeka domena (`isSameFieldOperation`) - ten sam
 * predykat uzbraja bramkę lądowania w detekcji, więc formularz i detekcja nie mają
 * jak się rozjechać.
 *
 * ══ TRASA SKOKÓW TO JEDNA WARTOŚĆ W DWÓCH POLACH REKORDU ══
 * Formularz pyta o jedno lotnisko, ale szkic trzyma obie wartości RÓWNE. Dzięki temu
 * ani projekcja, ani karta arkusza, ani panel nie muszą znać wyjątku „przy skokach
 * patrz tylko na start": `departureIcao` i `arrivalIcao` znaczą zawsze to samo.
 *
 * Egzekwujemy to przy KAŻDYM zapisie do szkicu - inwariant pilnowany przez pamiętanie
 * o nim w trzech miejscach ekranu jest inwariantem tylko do pierwszej zmiany w tym
 * ekranie.
 *
 * ══ DLACZEGO OSOBNY MODUŁ ══
 * Bo reguła obowiązuje KAŻDY szkic z trasą, a dziś są dwa: przejęcie (02E) i rezerwacja
 * (22A). Pierwsza kopia mieszkała w środku szkicu preflightu; druga rozjechałaby się
 * przy pierwszej poprawce - dokładnie tak, jak rozjechały się dwa logi operacji przed
 * issue #44. Wpis ręczny idzie własną drogą (ma pełny formularz zadania), ale gdyby
 * kiedyś tu trafił, dostanie tę samą regułę za darmo.
 */

import { isSameFieldOperation } from '../../../domain';
import type { OperationType } from '../../../domain';

/** Minimalny kształt, którego ta reguła dotyka. */
export interface RouteFields {
  operation: OperationType | null;
  departureIcao: string;
  arrivalIcao: string;
}

/**
 * Dociąga lotnisko lądowania do startu przy operacji jednoplacowej.
 *
 * Operacja `null` (rezerwacja przed wyborem zadania) NIE jest jednoplacowa - nie wiemy
 * jeszcze, czym będzie, a domyślne zrównanie kodów zjadłoby wpisane lądowanie w chwili,
 * w której pilot go jeszcze nie zmienił.
 */
export function withRouteShape<T extends RouteFields>(draft: T): T {
  if (draft.operation == null || !isSameFieldOperation(draft.operation)) return draft;
  if (draft.arrivalIcao === draft.departureIcao) return draft;
  return { ...draft, arrivalIcao: draft.departureIcao };
}
