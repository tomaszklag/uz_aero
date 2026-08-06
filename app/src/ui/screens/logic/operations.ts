/**
 * UZ Aero — jak nazywamy RODZAJ OPERACJI w aplikacji pilota.
 *
 * Wartość w rejestrze (`skoki`, `ferry`, `egzamin`, `techniczny`, `inne`) jest
 * IDENTYFIKATOREM: siedzi w zdarzeniach, w kolumnie `sessions.operation`, w ograniczeniu
 * bazy i w filtrach panelu. Napis dla pilota to osobna warstwa — i właśnie dlatego
 * zamiana „Ferry" na „Przelot" (issue #13) jest zmianą JEDNEGO wiersza tej tablicy,
 * a nie migracją historii klubu.
 *
 * Moduł istnieje, bo napis pokazywały cztery ekrany na trzy różne sposoby: siatka wyboru
 * miała własne etykiety, a kokpit, podgląd i podsumowanie wypisywały surową wartość przez
 * `toUpperCase()`. Po zmianie nazwy pilot wybierałby „Przelot", a dwa ekrany dalej czytał
 * „FERRY" — więc nazwa mieszka teraz w jednym miejscu.
 */

import { isSameFieldOperation } from '../../../domain';
import type { OperationType } from '../../../domain';

/**
 * Etykiety z mockupu 02e (`.op-label`). „Lot tech." jest skrótem z designu — karta
 * siatki ma szerokość jednej piątej ekranu i pełna nazwa się w niej nie mieści.
 */
const LABELS: Record<OperationType, string> = {
  skoki: 'Skoki',
  ferry: 'Przelot',
  egzamin: 'Egzamin',
  techniczny: 'Lot tech.',
  inne: 'Inne',
};

/** Nazwa operacji dla pilota („Przelot"). */
export function operationLabel(operation: OperationType): string {
  return LABELS[operation];
}

/**
 * Ta sama nazwa WERSALIKAMI — pasek dnia lotnego, plakietka podsumowania i tag podglądu
 * piszą operację jak kod (`CLAUDE.md`: wartości czytane jednym spojrzeniem).
 */
export function operationTag(operation: OperationType): string {
  return LABELS[operation].toUpperCase();
}

/**
 * Trasa dnia jednym napisem: „EPKK → EPWA" albo — przy skokach — samo „EPKK".
 *
 * Skoki mają w rekordzie oba kody równe (`withRouteShape` w szkicu), więc bez tej funkcji
 * pasek kokpitu, podgląd cudzej sesji i podsumowanie preflightu pisałyby „EPKK → EPKK":
 * napis, który wygląda jak pomyłka pilota, a jest poprawnie zapisanym dniem skoków
 * (issue #13). Pusta trasa daje pusty napis — wołający decyduje, czym ją zastąpić.
 */
export function routeLabel(
  operation: OperationType | null,
  departureIcao: string | null,
  arrivalIcao: string | null,
): string {
  if (operation != null && isSameFieldOperation(operation)) return departureIcao ?? '';
  return [departureIcao, arrivalIcao].filter(Boolean).join(' → ');
}
