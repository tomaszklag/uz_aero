/**
 * Ninerdeck (serwer) - ATRAPA kanału klubu (4.0.0; `docs/kanal-klubu.md`, epik Z-E #246).
 *
 * Zlecenia ogłaszają swoje tematy po każdym zapisie już teraz, a rozsyłanie przychodzi
 * z Z-E: wtedy composition root podmienia tę klasę na rejestr połączeń i nic w komendach
 * się nie zmienia. Do tego czasu sygnał znika - i to jest bezpieczne, bo kanał nie jest
 * źródłem prawdy (K2): ekran zleceń dociąga stan zwykłym odczytem REST.
 */

import type { LiveAudience, LiveSignalsPort } from '../../application/common/ports.ts';

export class SilentLiveSignals implements LiveSignalsPort {
  changed(_orgId: string, _topics: readonly string[], _audiences: readonly LiveAudience[]): void {}

  message(_orgId: string, _audiences: readonly LiveAudience[], _frame: Record<string, unknown>): void {}

  read(_orgId: string, _audiences: readonly LiveAudience[], _frame: Record<string, unknown>): void {}
}
