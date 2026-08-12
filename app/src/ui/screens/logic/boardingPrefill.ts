/**
 * UZ Aero — skład, którym otwierają się liczniki arkuszy skokowych (issue #28).
 *
 * Jeden załadunek CZEKAJĄCY na zrzut (`SessionState.boarding`) zasila DWA arkusze:
 *  • zrzut 05e — pilot w locie tylko potwierdza listę (issue #21 pkt 5),
 *  • załadunek 05i otwarty PONOWNIE — zgłoszenie z urządzenia (issue #28): pilot
 *    deklarował skład przed uruchomieniem silnika, po uruchomieniu wszedł w „Załadunek"
 *    i zobaczył same zera. Arkusz kasował liczniki przy każdym otwarciu, więc jedyna
 *    droga do zmiany deklaracji prowadziła przez wpisanie jej od nowa — z pamięci.
 *
 * Stąd wspólna funkcja: oba arkusze czytają ten sam stan tą samą regułą i nie mają
 * jak się rozjechać.
 *
 * Załadunek BEZ liczb (`jumpers: null` — „skład niepodany", nie „zero skoczków")
 * nie jest prefillem: liczniki startują od zera i podpisu też NIE MA. Zerowa lista
 * z adnotacją „skład z załadunku" wyglądałaby jak deklaracja pustego samolotu,
 * a pilot zadeklarował tylko sam fakt wejścia skoczków na pokład.
 */

import type { BoardingState, EpochMillis, JumperCounts } from '../../../domain';

export interface BoardingPrefill {
  /** Skład do liczników; `null` = arkusz zaczyna od zera. */
  jumpers: JumperCounts | null;
  /** Czas deklaracji do podpisu prefillu; `null` zawsze, gdy nie ma czego podpisać. */
  at: EpochMillis | null;
}

const NONE: BoardingPrefill = { jumpers: null, at: null };

export function boardingPrefill(boarding: BoardingState | null): BoardingPrefill {
  if (boarding == null || boarding.jumpers == null) return NONE;
  return { jumpers: boarding.jumpers, at: boarding.at };
}
