/**
 * Ninerdeck (serwer) - WŁĄCZANIE I WYŁĄCZANIE OBSERWOWANIA maszyny (3.2.0, issue #205;
 * `docs/obserwowanie-samolotu.md` §2.1, §7).
 *
 * Ustawienie OSOBY o sobie, jak motyw i PIN: bez wpisu w dzienniku audytu, bez okna
 * korekty, bez transakcji z czymkolwiek innym. Zapisuje się na serwerze WPROST, nie
 * przez outbox (§2.2) - to nie jest fakt z kabiny.
 *
 * W `common/`, bo wołają je obie powierzchnie: karta 27 i sekcja 13C w telefonie
 * oraz karta „Obserwowane samoloty" w `#/konto` panelu (decyzja 12). Panel idzie
 * ŚWIADOMIE poza `AuditedWrite`: ustawienie o sobie nie jest decyzją o kimś.
 */

import type { AircraftConfigPort, AircraftWatchesPort, Clock, Database } from '../ports.ts';

export class AircraftWatchCommands {
  constructor(
    private readonly db: Database,
    private readonly watches: AircraftWatchesPort,
    private readonly aircraft: AircraftConfigPort,
    private readonly clock: Clock,
  ) {}

  /** `false` = maszyny nie ma w tym klubie (trasa: 404). Idempotentne. */
  async watch(orgId: string, pilotId: string, aircraftId: string): Promise<boolean> {
    return this.watches.set(this.db, orgId, aircraftId, pilotId, this.clock.now());
  }

  /** `false` = maszyny nie ma w tym klubie (trasa: 404). Brak wiersza nie jest błędem. */
  async unwatch(orgId: string, pilotId: string, aircraftId: string): Promise<boolean> {
    // Istnienie maszyny W KLUBIE sprawdza się osobno: `DELETE` niczego nie odróżnia,
    // a cudza maszyna ma odpowiadać tak, jakby jej nie było.
    if ((await this.aircraft.regOf(this.db, orgId, aircraftId)) == null) return false;
    await this.watches.unset(this.db, orgId, aircraftId, pilotId);
    return true;
  }
}
