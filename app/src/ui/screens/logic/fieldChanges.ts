/**
 * UZ Aero - ILE RAZY POPRAWIANO JEDNO POLE zdarzenia (issue #43).
 *
 * ══ PO CO OSOBNY MODUŁ ══
 * Bo pytają o to trzy miejsca i wszystkie muszą dostać TĘ SAMĄ liczbę: plakietka „popr."
 * przy notatce, plakietka przy drugim pilocie i licznik przy wejściu w historię zmian
 * w arkuszu. Policzone osobno rozjechałyby się przy pierwszej zmianie reguły - a wtedy
 * ekran mówiłby „poprawiane", arkusz „historia pusta", i nie dałoby się rozstrzygnąć,
 * które kłamie.
 *
 * ══ DLACZEGO PER POLE, A NIE PER ZDARZENIE ══
 * `preflight_confirm` niesie CZTERY korygowalne rzeczy naraz: paliwo, licznik motogodzin,
 * notatkę i Duala. Każda ma własny arkusz i własne pytanie, więc licznik per zdarzenie
 * zapalałby znacznik przy notatce po poprawce paliwa - i odwrotnie. Poprawka jednego
 * pola nie jest faktem o pozostałych.
 *
 * Sama historia jest w strumieniu z definicji (rejestr jest append-only), więc nie
 * prowadzimy jej osobno - `correctionHistory` czyta ją z tych samych zdarzeń, z których
 * liczy się reszta ekranu.
 */

import { correctionHistory } from '../../../domain';
import type { CorrectionField, Event } from '../../../domain';

/**
 * Ile poprawek dotknęło wskazanych pól zdarzenia.
 *
 * `targetUuid === null` (nie ma czego adresować - np. sesja bez preflightu w strumieniu)
 * daje zero, a nie wyjątek: brak adresu jest normalnym stanem, nie awarią.
 *
 * Wpisy o samym FAKCIE (`void`, `unvoid`) mają `field: null` i nie liczą się do żadnego
 * pola - unieważnienie nie zmienia wartości, tylko to, czy zdarzenie w ogóle obowiązuje.
 */
export function fieldChanges(
  events: readonly Event[],
  targetUuid: string | null,
  fields: readonly CorrectionField[],
): number {
  if (targetUuid == null) return 0;
  return correctionHistory(events, targetUuid).filter(
    (entry) => entry.field != null && fields.includes(entry.field),
  ).length;
}
