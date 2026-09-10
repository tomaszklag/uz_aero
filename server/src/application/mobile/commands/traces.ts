/**
 * UZ Aero (serwer) - komenda przyjęcia ŚLADU kalibracyjnego (`POST /traces`, faza 5).
 *
 * Do epiku C wielofirmowości (issue #99) trasa dopisywała wpisy do pliku sesji wprost,
 * bez pytania, CZYJA to sesja: ślad nie jest rejestrem, więc nie miał bramek. Przy
 * wielu klubach ta swoboda jest dziurą - członek klubu A, który zna uuid operacji
 * klubu B (uuid jest losowy, ale krąży w zgłoszeniach i linkach), dopisałby do jej
 * nagrania własne fixy, a mapa w dzienniku klubu B narysowałaby cudzy lot jako swój.
 *
 * ══ TA SAMA REGUŁA, CO W INGEŚCIE - I TA SAMA KOLEJNOŚĆ ══
 * Sesja JUŻ ZNANA serwerowi musi należeć do klubu z tokenu i do nadawcy jako PIC-a
 * (`ownerOf` z projekcji). Sesja NIEZNANA przechodzi: nagranie potrafi wyprzedzić
 * paczkę zdarzeń (telefon wysyła je z osobnych kolejek), a zatrzymanie go do czasu
 * pierwszej paczki gubiłoby początek śladu. Odmowa jest 403 dla CAŁEJ paczki, nie
 * wstrzymaniem per wpis: ślad nie ma outboxa z księgowością per zdarzenie, a wpisy
 * jednej paczki i tak dotyczą jednej sesji. Klub sprawdzamy PRZED pilotem, żeby
 * odpowiedź o cudzej sesji niczego o niej nie mówiła - ten sam argument, co w ingeście.
 */

import type { Database, SessionsProjectionPort, TraceSinkPort } from '../../common/ports.ts';
import type { IngestSender } from './ingest.ts';

export type TraceIntakeOutcome =
  | { ok: true; accepted: number }
  /** Sesja z paczki należy do innego klubu ALBO innego pilota - dla nadawcy nie istnieje. */
  | { ok: false; reason: 'not_yours' };

export class TraceCommands {
  constructor(
    private readonly db: Database,
    private readonly sessions: SessionsProjectionPort,
    private readonly sink: TraceSinkPort,
  ) {}

  async append(
    sender: IngestSender,
    entries: readonly Record<string, unknown>[],
  ): Promise<TraceIntakeOutcome> {
    const sessionUuids = new Set<string>();
    for (const entry of entries) {
      if (typeof entry.sessionUuid === 'string') sessionUuids.add(entry.sessionUuid);
    }

    for (const sessionUuid of sessionUuids) {
      const owner = await this.sessions.ownerOf(this.db, sessionUuid);
      if (owner == null) continue;
      if (owner.orgId !== sender.orgId || owner.picId !== sender.pilotId) {
        return { ok: false, reason: 'not_yours' };
      }
    }

    await this.sink.append(sender.pilotId, [...entries]);
    return { ok: true, accepted: entries.length };
  }
}
