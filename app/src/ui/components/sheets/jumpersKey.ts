/**
 * UZ Aero - klucz składu skoczków do zależności effectów prefillu (issue #28).
 *
 * Arkusze skokowe (05e zrzut, 05i załadunek) przeładowują liczniki, gdy zmieni się
 * skład CZEKAJĄCY na zrzut. „Zmieni się" musi tu znaczyć INNE LICZBY, nie inny obiekt:
 * projekcja przelicza się ze strumienia po każdym zdarzeniu sesji, więc ten sam skład
 * wraca do arkusza jako świeży obiekt (choćby po kołowaniu z autodetekcji). Effect
 * zależny od identyczności kasowałby wtedy liczniki pod palcami pilota - dokładnie
 * w chwili, gdy je ustawia.
 *
 * `null` (brak deklaracji) ma własny klucz, bo „nie zadeklarowano" to inny stan niż
 * „zadeklarowano zero" - i tylko pierwszy jest w ogóle zapisywalny (`declaredJumpers`).
 */

import type { JumperCounts } from './DropSheet';

export function jumpersKey(jumpers: JumperCounts | null): string {
  return jumpers == null ? '-' : `${jumpers.tandem}/${jumpers.aff}/${jumpers.solo}`;
}
