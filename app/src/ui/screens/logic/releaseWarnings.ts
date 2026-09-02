/**
 * UZ Aero - OSTRZEŻENIA ZDANIA SAMOLOTU (ekran 09B/09C, issue #75 pkt 2).
 *
 * Ta sama granica, co w `manualFlightWarnings.ts`: ostrzeżenie NIGDY nie blokuje.
 * Zdanie maszyny, w której nic się nie zmieniło, jest legalne i potrzebne (samolot
 * trzeba oddać) - ale pilot ma usłyszeć ZANIM tapnie, że taki zapis nie utworzy
 * operacji: nie pojawi się w „Moim dniu", w historii ani w panelu (pusta operacja
 * jest filtrowana wszędzie - `operationSubstance.ts`).
 *
 * Rachunek bierze wartości WPISYWANE (szkic odczytu), nie projekcję: `fuel.endL`
 * w projekcji domknie się dopiero zdarzeniem `day_close`, czyli po tapnięciu.
 * To ten sam powód, dla którego `finalFuelHint` liczy zużycie ze szkicu.
 */

import {
  isEmptyOperation,
  substanceFacts,
  type SessionState,
} from '../../../domain';

/** Szkic odczytu końcowego - to, co stoi w polach ekranu w tej chwili. */
export interface DraftFinalReading {
  fuelL: number | null;
  mh: number | null;
}

/**
 * Ostrzeżenie „nic się nie zmieniło" - `null`, gdy zdanie MA treść (bieg, lot,
 * dolewka, zmieniony odczyt) albo gdy odczytów jeszcze nie ma (wtedy mówi blokada).
 *
 * Tekst mówi o SKUTKU (zapis nie utworzy operacji) i o DRODZE WYJŚCIA (popraw odczyt,
 * jeśli coś się jednak zmieniło) - nie o budowie rejestru.
 */
export function emptyReleaseWarning(
  state: SessionState,
  reading: DraftFinalReading,
): string | null {
  const wouldBe = {
    ...substanceFacts(state),
    fuelEndL: reading.fuelL,
    mhEnd: reading.mh,
    closed: true,
  };
  if (!isEmptyOperation(wouldBe)) return null;

  return (
    'Silnik nie ruszył, a odczyty stoją na wartościach z przejęcia - nic się nie ' +
    'zmieniło, więc nic nie zostanie zapisane: wpis nie pojawi się w Twoim dniu ' +
    'ani w panelu. Jeśli coś się jednak zmieniło, popraw odczyt ołówkiem powyżej.'
  );
}

/**
 * Czy odczyty w polach to nadal wartości podstawione z przejęcia - od tego zależy
 * plakietka „bez zmian" przy karcie liczników na 09C. Statyczna plakietka kłamała
 * w chwili, w której pilot poprawił liczbę: nad zmienioną wartością stało „bez zmian".
 */
export function readingsUntouched(
  initial: DraftFinalReading,
  reading: DraftFinalReading,
): boolean {
  return reading.fuelL === initial.fuelL && reading.mh === initial.mh;
}
