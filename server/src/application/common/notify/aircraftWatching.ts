/**
 * Ninerdeck (serwer) - ADRESACI powiadomień o maszynie i ich zapis (3.2.0, issue #205;
 * `docs/obserwowanie-samolotu.md` §2.1, §5).
 *
 * Jedna zależność dla wszystkich PRODUCENTÓW (ingest, komendy rezerwacji telefonu
 * i panelu, zakończenie operacji z panelu, zadanie okresowe) zamiast trzech portów
 * w każdym z nich: „kogo obudzić" liczy się WSZĘDZIE tak samo - obserwujący z prawem
 * sprawdzonym przy wysyłce, BEZ SPRAWCÓW - i ma jedno miejsce, w którym da się to
 * zmienić.
 *
 * ══ `audience` → `record` W TRANSAKCJI → `wake` PO COMMICIE ══
 * Ta sama umowa, co przy `Notifier` (przepis „Nowy rodzaj powiadomienia",
 * `docs/architektura-kodu.md` §7): wiadomość o zdaniu maszyny powstaje razem z zapisem
 * zdania, a budzik dzwoni dopiero, gdy zapis jest pewny. `audience` bierze uchwyt
 * transakcji z tego samego powodu - lista adresatów ma opisywać klub z chwili zapisu.
 *
 * `null` z `audience` znaczy „nie ma kogo budzić" i producent nie robi wtedy NIC:
 * maszyna spoza rejestru floty (paczka z terenu, `aircraft_id` bez klucza obcego)
 * nie ma ani obserwujących, ani znaku - i tak ma być.
 */

import type { AircraftConfigPort, AircraftWatchesPort, Queryable } from '../ports.ts';
import type { WatchAudience } from './aircraftNotices.ts';
import type { NotificationDraft } from './bookingNotices.ts';
import type { Notifier } from './notifier.ts';

export class AircraftWatching {
  constructor(
    private readonly watches: AircraftWatchesPort,
    private readonly aircraft: AircraftConfigPort,
    private readonly notifier: Notifier,
  ) {}

  /**
   * Obserwujący maszynę z prawem do powiadomienia, bez osób z `exclude` (sprawcy:
   * PIC i Dual operacji, odwołujący, administrator zamykający). `null` = nikogo.
   */
  async audience(
    tx: Queryable,
    orgId: string,
    aircraftId: string,
    exclude: readonly (string | null)[],
  ): Promise<WatchAudience | null> {
    const watchers = await this.watches.watchersOf(tx, orgId, aircraftId);
    const pilotIds = watchers.filter((id) => !exclude.includes(id));
    if (pilotIds.length === 0) return null;
    const reg = await this.aircraft.regOf(tx, orgId, aircraftId);
    if (reg == null) return null;
    return { pilotIds, reg };
  }

  /** Wiersze skrzynki - w transakcji rzeczy, o której mówią. */
  record(
    tx: Queryable,
    orgId: string,
    drafts: readonly NotificationDraft[],
    at: Date,
  ): Promise<void> {
    return this.notifier.record(tx, orgId, drafts, at);
  }

  /** Budzik PO commicie; nigdy nie rzuca. */
  wake(orgId: string, drafts: readonly NotificationDraft[]): Promise<void> {
    return this.notifier.wake(orgId, drafts);
  }
}
