/**
 * UZ Aero (serwer) — komenda przyjęcia paczki zdarzeń (`POST /events`, §4.3–4.5).
 *
 * Cała operacja jest JEDNĄ transakcją: wstawienie zdarzeń → przeliczenie projekcji
 * dotkniętych sesji → flagi łańcucha MH. Telefon, który dostał odpowiedź, może
 * oznaczyć zdarzenia jako wysłane; stan `sessions` nigdy nie rozjeżdża się z `events`.
 *
 * Dwie zasady, które ta komenda MUSI utrzymać:
 *
 *  • **Idempotencja** (§4.3): retry tej samej paczki daje `duplicates`, nie podwójne
 *    wiersze. Klucz = uuid nadany przez telefon.
 *  • **Serwer nie blokuje, flaguje** (§4.5): nakładka sesji, dziura albo cofnięcie
 *    łańcucha MH nie odrzucają zdarzeń — trafiają do `flags` do wyjaśnienia. Jedyny
 *    twardy warunek to TOŻSAMOŚĆ: paczkę sesji wysyła wyłącznie telefon jej PIC-a
 *    (single-writer §4.4); cudze zdarzenia to nie konflikt danych, tylko brak
 *    uprawnień.
 *
 * Projekcję liczy `projectSession` z `@uzaero/domain` — DOKŁADNIE ten sam kod, który
 * liczy ekran statystyk na telefonie. Korekty (04c) wchodzą w wynik automatycznie,
 * bo nakłada je sama projekcja.
 */

import type { Event } from '@uzaero/domain';

import { clockDriftFlag } from '../../../domain/clockDrift.ts';
import { chainFlags, type ChainLink } from '../../../domain/mhChain.ts';
import { sessionRowFrom } from '../../common/mappers/sessionRow.ts';
import {
  recomputeConsumptionNorm,
  type ConsumptionNormPorts,
} from '../../common/consumptionNorm.ts';
import type { DayExporter } from '../../common/export/dayExporter.ts';
import type {
  AircraftConfigPort,
  Clock,
  Database,
  EventsStorePort,
  FlagRecord,
  FlagsPort,
  Queryable,
  SessionsProjectionPort,
} from '../../common/ports.ts';

export interface IngestResult {
  accepted: number;
  duplicates: number;
  /** Otwarte flagi dotykające przysłanych sesji — telefon pokaże je na ekranie 11. */
  flags: FlagRecord[];
}

export type IngestOutcome =
  | { ok: true; result: IngestResult }
  | { ok: false; reason: 'not_session_pic' };

export class IngestCommands {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
    private readonly flags: FlagsPort,
    /** Pojemność zbiorników → tolerancja `fuel_mismatch` (§4.5). */
    private readonly aircraft: AircraftConfigPort,
    /** `null` = eksport §4.7 wyłączony (brak konfiguracji Sheets w composition root). */
    private readonly exporter: DayExporter | null,
    /**
     * Porty przeliczenia normy zużycia; `null` = wyłączone. Norma jest podpowiedzią
     * dla pilota (ekrany 04/06/10), więc jej brak nie blokuje niczego — dokładnie tak
     * samo jak brak eksportu arkusza.
     */
    private readonly norms: ConsumptionNormPorts | null,
    private readonly clock: Clock,
  ) {}

  async ingest(
    senderPilotId: string,
    batch: readonly Event[],
    sourceDevice: string | null,
  ): Promise<IngestOutcome> {
    // Samoloty dotknięte paczką — wypełniane w transakcji, używane PO commicie
    // (przeliczenie normy zużycia), więc muszą przeżyć jej zakres.
    const aircraftIds = new Set<string>();
    // Single-writer (§4.4), warstwa 1: każda paczka niesie zdarzenia podpisane PIC-em
    // sesji; nadawca musi nim być. Odrzucamy CAŁĄ paczkę — częściowe przyjęcie
    // rozjechałoby księgowość outboxa (telefon nie wie, które wiersze weszły).
    if (batch.some((e) => e.picId !== senderPilotId)) {
      return { ok: false, reason: 'not_session_pic' };
    }

    // Warstwa 2 (audyt: KRYTYCZNE): sam podpis w paczce nie wystarcza — napastnik
    // wpisałby WŁASNE picId w zdarzenia celujące w CUDZĄ sessionUuid i antydatowanym
    // zdarzeniem przejął sesję, unieważnił loty korektą albo zamknął cudzy dzień.
    // Dlatego nadawcę porównujemy z PIC-em sesji JUŻ ISTNIEJĄCEJ na serwerze; nowa
    // sesja należy do tego, kto ją pierwszy przyniósł.
    for (const sessionUuid of new Set(batch.map((e) => e.sessionUuid))) {
      const existing = await this.sessions.get(this.db, sessionUuid);
      if (existing != null && existing.picId !== senderPilotId) {
        return { ok: false, reason: 'not_session_pic' };
      }
    }

    const { closedNow, ...result } = await this.db.transaction(async (tx) => {
      // Blokada advisory per sesja (audyt: lost update) — dwie równoległe paczki tej
      // samej sesji liczyłyby projekcję każda bez zdarzeń drugiej i ostatni commit
      // nadpisałby `sessions` niekompletnym stanem. Lock szereguje ingest per sesja,
      // zwalnia się sam z końcem transakcji.
      for (const sessionUuid of [...new Set(batch.map((e) => e.sessionUuid))].sort()) {
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [sessionUuid]);
      }

      const { accepted, duplicates } = await this.events.insertBatch(tx, batch, sourceDevice);

      // Projekcje przeliczamy per DOTKNIĘTA sesja — pełny strumień, nie przyrost.
      // Strumień dnia to dziesiątki zdarzeń; odtwarzalność > mikrooptymalizacja.
      const sessionUuids = [...new Set(batch.map((e) => e.sessionUuid))];
      const closedNow: string[] = [];

      for (const sessionUuid of sessionUuids) {
        const stream = await this.events.sessionEvents(tx, sessionUuid);
        if (stream.length === 0) continue;
        const row = sessionRowFrom(sessionUuid, stream);
        await this.sessions.upsert(tx, row);
        aircraftIds.add(row.aircraftId);
        if (row.status === 'closed') closedNow.push(sessionUuid);

        // Rozjazd zegarów jest własnością POJEDYNCZEGO zdarzenia, nie łańcucha sesji,
        // więc liczy się tu — na pełnym strumieniu dnia, który i tak mamy wczytany.
        const drift = clockDriftFlag(sessionUuid, stream);
        if (drift != null) {
          await this.flags.ensureOpen(tx, { ...drift, aircraftId: row.aircraftId });
        }
      }

      // Flagi liczymy per samolot, z CAŁEJ jego historii sesji — anomalia łańcucha
      // z definicji dotyczy pary sesji, więc sama paczka nie wystarcza.
      for (const aircraftId of aircraftIds) {
        const links: ChainLink[] = (await this.sessions.listByAircraft(tx, aircraftId)).map(
          (s) => ({
            sessionUuid: s.sessionUuid,
            mhStart: s.mhStart,
            mhEnd: s.mhEnd,
            fuelStartL: s.fuelStartL,
            fuelEndL: s.fuelEndL,
            closed: s.status === 'closed',
          }),
        );
        const capacityL = await this.aircraft.capacityL(tx, aircraftId);
        for (const flag of chainFlags(links, capacityL)) {
          await this.flags.ensureOpen(tx, { ...flag, aircraftId });
        }
      }

      const flags = await openFlagsFor(this.flags, tx, sessionUuids);
      return { accepted, duplicates, flags, closedNow };
    });

    // Eksport §4.7 — PO commicie i poza gwarancjami odpowiedzi: telefon dostaje 200
    // za PRZYJĘCIE zdarzeń, a arkusz jest skutkiem, nie warunkiem. Awaria Sheets nie
    // może zamienić dostarczonej paczki w wieczny retry outboxa — dlatego wyjątek
    // kończy się logiem, nigdy błędem odpowiedzi. Sesja zamknięta w tej paczce
    // (albo domknięta wcześniej i właśnie uzupełniona spóźnionymi danymi) dostaje
    // świeżą kartę; rewizje nalicza eksporter.
    if (this.exporter != null) {
      for (const sessionUuid of closedNow) {
        try {
          await this.exporter.exportSession(sessionUuid);
        } catch (err) {
          console.error(`eksport arkusza sesji ${sessionUuid} nie powiódł się:`, err);
        }
      }
    }

    // Norma zużycia — dokładnie ta sama umowa, co przy eksporcie: PO commicie, poza
    // gwarancjami odpowiedzi, wyjątek do logu. Model czyta strumienie kilkudziesięciu
    // sesji i puszcza je przez regresję, więc jest to najdroższa rzecz w tym przepływie —
    // a przelicza się wyłącznie wtedy, gdy dzień faktycznie się domknął, bo tylko wtedy
    // przybył nowy interwał paliwowy. Otwarcie dnia niczego w modelu nie zmienia.
    if (this.norms != null && closedNow.length > 0) {
      for (const aircraftId of aircraftIds) {
        try {
          await recomputeConsumptionNorm(this.db, aircraftId, this.norms, this.clock.now());
        } catch (err) {
          console.error(`przeliczenie normy zużycia ${aircraftId} nie powiodło się:`, err);
        }
      }
    }

    return { ok: true, result };
  }
}

async function openFlagsFor(
  flags: FlagsPort,
  db: Queryable,
  sessionUuids: string[],
): Promise<FlagRecord[]> {
  const seen = new Map<number, FlagRecord>();
  for (const uuid of sessionUuids) {
    for (const flag of await flags.openForSession(db, uuid)) {
      seen.set(flag.id, flag);
    }
  }
  return [...seen.values()].sort((a, b) => a.id - b.id);
}
