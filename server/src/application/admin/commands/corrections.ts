/**
 * UZ Aero (serwer) — korekta zdarzenia po oknie 24 h (panel, mockup `A02b-korekta.html`).
 *
 * Trzeci pionowy przekrój panelu. Jedyne miejsce w całym systemie, w którym zdarzenie
 * trafia do rejestru NIE z telefonu pilota — i dlatego jedyne, które wolno wołać
 * `checkAppend` z uprawnieniem `'administrative'`.
 *
 * TRZY ZASADY, KTÓRE TA KOMENDA MUSI UTRZYMAĆ:
 *
 *  1. **Append-only bez wyjątków.** Korekta DOPISUJE `event_correction`; oryginalne
 *     zdarzenie zostaje w `events` na zawsze i dalej widać je na osi dnia. Projekcja
 *     przestaje je uwzględniać (`void`) albo liczy z nowym czasem (`retime`) — robi to
 *     `applyCorrections` w domenie, więc panel i telefon liczą dzień tym samym kodem.
 *  2. **Ścieżka administratora waliduje się sama.** Kandydata buduje i ocenia wspólny
 *     helper (`../correctionCandidate.ts`), ten sam, którym jedzie podgląd „przed → po"
 *     (`../queries/corrections.ts`). Tam też mieszka literał `'administrative'`
 *     i uzasadnienie, dlaczego ta ocena ma DOKŁADNIE jedną implementację.
 *  3. **Zdarzenie stemplujemy PIC-em sesji, nie administratorem.** `picId` w rejestrze
 *     odpowiada na pytanie „czyja to sesja", nie „kto to wpisał" — wpisanie tam konta
 *     administratora zerwałoby single-writer (`WRITER_MISMATCH`, i słusznie) oraz
 *     zafałszowało atrybucję nalotu. Na pytanie „kto to zrobił" odpowiadają
 *     `events.source_device` i `admin_audit`, i tylko one.
 *
 * Powód korekty (pole obowiązkowe w A02b) idzie do AUDYTU, nie do zdarzenia: rejestr
 * opisuje lot, a nie motywację człowieka przy biurku. Ta sama granica, co przy notatce
 * rozstrzygnięcia flagi.
 *
 * Konstruktor bez `Database`/`Queryable` — komenda nie ma jak zapisać z pominięciem
 * śladu audytu, bo nie ma uchwytu do bazy (`auditedWrite.ts`, `test/architecture.test.ts`).
 */

import {
  projectSession,
  type AircraftLimits,
  type Event,
  type EventCorrectionPayload,
  type RuleViolation,
  type SessionState,
} from '@uzaero/domain';

import { correctionCandidate, correctionViolations } from '../correctionCandidate.ts';
import { sessionRowFrom } from '../../common/mappers/sessionRow.ts';
import type { DayExporter, ExportOutcome } from '../../common/export/dayExporter.ts';
import type {
  AircraftConfigPort,
  Clock,
  EventsStorePort,
  SessionsProjectionPort,
} from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor } from '../ports.ts';

/** Wejście komendy: co poprawić (payload domenowy) i dlaczego (do dziennika audytu). */
export interface CorrectionInput {
  sessionUuid: string;
  /** Kształt bierzemy z domeny — trasa nie modeluje korekty po raz drugi. */
  correction: EventCorrectionPayload;
  /** Uzasadnienie administratora; obowiązkowe (A02b), trafia WYŁĄCZNIE do audytu. */
  reason: string;
}

export interface CorrectionResult {
  sessionUuid: string;
  /** Uuid DOPISANEGO zdarzenia — adres korekty w rejestrze i na osi dnia. */
  correctionUuid: string;
  targetUuid: string;
  action: EventCorrectionPayload['action'];
  recordedAt: Date;
  /**
   * Stan dnia PO korekcie, policzony `projectSession`. Jedzie w odpowiedzi, żeby panel
   * odświeżył kartę dnia bez drugiego żądania i — co ważniejsze — bez własnego liczenia:
   * podgląd „przed → po" z A02b ma pokazywać liczby serwera, nie swoją arytmetykę.
   */
  state: SessionState;
  /**
   * Re-eksport karty dnia. `null` = eksport rzucił — awarię arkuszy łapiemy tak samo
   * jak ingest (§4.7: karta to SKUTEK, nie warunek). Korekta jest wtedy zapisana,
   * a panel musi to pokazać uczciwie: 500 sugerowałoby, że nic się nie zapisało.
   */
  reexport: ExportOutcome | null;
}

/**
 * Uproszczony CQRS repo: komenda zwraca WYNIK, a odmowa jest jego wariantem, nie
 * wyjątkiem na granicy HTTP (wzorzec `IngestOutcome` i `ResolveFlagOutcome`). Trasa
 * mapuje wariant na status i niczego nie interpretuje.
 */
export type CorrectEventOutcome =
  | { ok: true; result: CorrectionResult }
  | { ok: false; reason: 'session_not_found' }
  | { ok: false; reason: 'day_open' }
  | { ok: false; reason: 'rule_violation'; violations: RuleViolation[] };

/**
 * Sygnały przerwania transakcji. Muszą być WYJĄTKAMI, bo tylko wyjątek wycofuje
 * transakcję `AuditedWrite.run` — zwrócenie wartości zostawiłoby wpis audytu
 * o operacji, która się nie zdarzyła. Poza ten plik nie wychodzą.
 */
class SessionNotFound extends Error {}

class DayStillOpen extends Error {}

class RuleRejection extends Error {
  constructor(readonly violations: RuleViolation[]) {
    super(violations.map((v) => v.message).join(' '));
  }
}

/** Skutek transakcji: dopisane zdarzenie + stan dnia policzony po jego nałożeniu. */
interface Applied {
  candidate: Event;
  state: SessionState;
}

export class AdminCorrectionCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
    /** Pojemność zbiorników → `AircraftLimits` dla reguł; czytana W TEJ transakcji. */
    private readonly aircraft: AircraftConfigPort,
    private readonly exporter: DayExporter,
    private readonly clock: Clock,
    /**
     * Generator uuid korekty. FUNKCJA w konstruktorze, nie port: nie ma tu adaptera
     * do podmiany (composition root podaje `randomUUID`), a port bez drugiej
     * implementacji to koszt bez zysku.
     */
    private readonly newId: () => string,
  ) {}

  async correct(actor: Actor, input: CorrectionInput): Promise<CorrectEventOutcome> {
    const at = this.clock.now();

    let applied: Applied;
    try {
      applied = await this.write.run(actor, async (tx) => {
        // Ta sama tarcza, co w `IngestCommands`: blokada advisory per sesja szereguje
        // nas z paczką, którą właśnie dosyła telefon. Bez niej ingest mógłby policzyć
        // projekcję na strumieniu SPRZED korekty i nadpisać nią wiersz `sessions`
        // — zdarzenie zostałoby w rejestrze, a liczby dnia cofnęłyby się po cichu.
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.sessionUuid]);

        const stream = await this.events.sessionEvents(tx, input.sessionUuid);
        if (stream.length === 0) throw new SessionNotFound();

        const before = projectSession(stream);
        // Dzień OTWARTY = pilot ma pełne prawo zapisu i poprawia sam (04c), więc panel
        // nie ma tu czego naprawiać. Odmowa jest tu uczciwsza niż uprzejme wyręczenie:
        // korekta administratora nie wraca na telefon (sync jest jednokierunkowy), więc
        // wchodzenie w otwarty dzień rozjeżdżałoby dwa żywe obrazy tej samej sesji.
        if (!before.closed) throw new DayStillOpen();

        const candidate = correctionCandidate(before, stream, input.correction, this.newId(), at);
        const limits: AircraftLimits = {
          capacityL: await this.aircraft.capacityL(tx, candidate.aircraftId),
        };

        const errors = correctionViolations(before, candidate, limits);
        if (errors.length > 0) throw new RuleRejection(errors);

        await this.events.insertBatch(tx, [candidate], `admin:${actor.pilotId}`);

        // Projekcję przeliczamy z PEŁNEGO strumienia, nie przyrostowo — korekta zmienia
        // przeszłość dnia (czas cyklu, liczbę lotów), więc żadna arytmetyka „dodaj
        // różnicę" nie byłaby równoważna `projectSession`.
        const after = await this.events.sessionEvents(tx, input.sessionUuid);
        const state = projectSession(after);
        await this.sessions.upsert(tx, sessionRowFrom(input.sessionUuid, after));

        // Flag łańcucha MH i paliwa NIE przeliczamy: ich wejściem są odczyty
        // z `preflight_confirm` i `day_close`, a te są niekorygowalne
        // (`CORRECTION_TARGET_NOT_ALLOWED`). Otwarta flaga `clock_drift` też zostaje —
        // A02b mówi to wprost: „zamyka ją człowiek na A03".
        return {
          result: { candidate, state },
          audit: {
            action: 'event.correct',
            targetType: 'event',
            // Celem akcji jest ZDARZENIE POPRAWIANE, nie korekta: dziennik ma
            // odpowiadać na pytanie „co komu zrobiono", a nie „co powstało".
            targetId: input.correction.targetUuid,
            details: {
              sessionUuid: input.sessionUuid,
              correctionUuid: candidate.uuid,
              action: input.correction.action,
              newTime: input.correction.action === 'retime' ? input.correction.newTime : null,
              reason: input.reason,
            },
          },
        };
      });
    } catch (err) {
      if (err instanceof SessionNotFound) return { ok: false, reason: 'session_not_found' };
      if (err instanceof DayStillOpen) return { ok: false, reason: 'day_open' };
      if (err instanceof RuleRejection) {
        return { ok: false, reason: 'rule_violation', violations: err.violations };
      }
      throw err;
    }

    return {
      ok: true,
      result: {
        sessionUuid: input.sessionUuid,
        correctionUuid: applied.candidate.uuid,
        targetUuid: input.correction.targetUuid,
        action: input.correction.action,
        recordedAt: at,
        state: applied.state,
        reexport: await this.reexport(input.sessionUuid),
      },
    };
  }

  /**
   * Re-eksport karty dnia PO COMMICIE i wymuszony, nie opcjonalny (A02b): karta pokazuje
   * aktualny stan dnia, więc po zmianie liczb dokument klubu musi je dostać, a `export_log`
   * — kolejną rewizję. Eksport przed commitem utrwaliłby w arkuszu stan, który mógł się
   * nie zapisać; eksport WEWNĄTRZ transakcji pozwoliłby awarii arkusza cofnąć decyzję
   * człowieka, poprawną niezależnie od tego, czy karta się zapisała.
   */
  private async reexport(sessionUuid: string): Promise<ExportOutcome | null> {
    try {
      return await this.exporter.exportSession(sessionUuid);
    } catch (err) {
      console.error(`re-eksport karty sesji ${sessionUuid} nie powiódł się:`, err);
      return null;
    }
  }
}
