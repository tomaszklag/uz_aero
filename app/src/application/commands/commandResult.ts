/**
 * UZ Aero — wynik komendy.
 *
 * Komenda kończy się na dwa sposoby:
 *  - sukces → `CommandResult` ze zdarzeniem, które trafiło do strumienia, i listą
 *    OSTRZEŻEŃ (miękkie flagi) do pokazania pilotowi,
 *  - odrzucenie → wyjątek `DomainRuleError` z twardymi naruszeniami (nic nie zapisano).
 *
 * Dlaczego ostrzeżenia wracają, a nie lądują w zdarzeniu: flagi to §4.5, czyli domena
 * SERWERA — gdybyśmy dopisywali je do payloadu, mielibyśmy dwa źródła prawdy o flagach
 * i migrację schematu przy każdej nowej regule. Lokalnie ostrzeżenie ma jedno zadanie:
 * powiedzieć pilotowi „zapisałem, ale sprawdź to" — zanim wyjdzie z ekranu.
 */

import type { Event } from '../../domain';
import type { RuleViolation } from '../../domain';

export interface CommandResult {
  /** Zdarzenie faktycznie zapisane w strumieniu (po dedupie po `uuid`). */
  event: Event;
  /** Miękkie flagi — zdarzenie zapisane, ale warte uwagi pilota. */
  warnings: RuleViolation[];
}
