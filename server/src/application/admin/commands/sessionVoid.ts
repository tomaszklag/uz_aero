/**
 * UZ Aero (serwer) - UNIEWAŻNIENIE CAŁEJ SESJI z panelu (zamówienie właściciela
 * produktu, 2026-08-31: „z poziomu admina powinienem mieć możliwość w dowolnym momencie
 * usunięcia sesji (cyklu silnika)").
 *
 * Zdarzenie `session_void` istnieje w domenie od 2026-08-30 - z aplikacji pilota, gdzie
 * ma okno 24 h od zdania samolotu. Ta komenda jest jego drugą drogą: administrator nie
 * jest oknem związany, bo typ stoi na liście `CORRECTION_EVENT_TYPES`, a tryb
 * `'administrative'` uchyla dokładnie tę jedną regułę (`correctionCandidate.ts`).
 *
 * ══ „W DOWOLNYM MOMENCIE" ZNACZY TEŻ „W TRAKCIE LOTU" ══
 * Sesji nie musi być zdana ani nawet zakończona - kolizja z pilotem, który wciąż trzyma
 * maszynę, jest OSTRZEŻENIEM (`ADMIN_EDIT_SESSION_ACTIVE`), nie odmową. To ta sama
 * decyzja, co przy korekcie (2026-08-07): bramka odmawiałaby dokładnie wtedy, gdy
 * unieważnienie bywa najbardziej potrzebne (wpis otwarty przez pomyłkę na cudzej
 * maszynie), a człowiek przy biurku widzi całą sytuację. Twarde reguły zostają w mocy
 * i są IDENTYCZNE jak dla pilota: sesja musi istnieć (`SESSION_VOID_NO_SESSION`)
 * i nie może być już wycofana (`SESSION_ALREADY_VOIDED`).
 *
 * ══ CO SIĘ DZIEJE PO ZAPISIE ══
 *  1. projekcja `sessions` dostaje status `voided` (`sessionRowFrom`) - a to wypycha
 *     sesję z łańcucha MH (`aircraftStateView` pyta o `closed`) i z listy eksportów;
 *  2. karta arkusza tej doby jest budowana OD NOWA, bez wycofanej sesji - inaczej
 *     dokument klubu pokazywałby lot, którego rejestr już nie liczy.
 *
 * Zdarzenie stemplujemy PIC-em sesji, nie administratorem (single-writer §4.4); kto
 * je dopisał, mówią `events.source_device` i `admin_audit`. Konstruktor bez
 * `Database`/`Queryable`: jedyną drogą zapisu jest `AuditedWrite`.
 */

import { projectSession, type AircraftLimits, type Event, type RuleViolation, type SessionState } from '@uzaero/domain';

import { correctionViolations, correctionWarnings, sessionVoidCandidate } from '../correctionCandidate.ts';
import { adminSourceDevice } from '../sourceDevice.ts';
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

/** Wejście komendy: którą sesję wycofać i dlaczego. */
export interface SessionVoidInput {
  sessionUuid: string;
  /**
   * Powód. WYMAGANY po stronie panelu - inaczej niż w telefonie, gdzie pilot wycofuje
   * własny wpis i wie, co zrobił. Tu wycofuje się CUDZY lot, a za rok powód jest jedyną
   * rzeczą, która wyjaśni, czemu w rejestrze stoi sesja, której nikt nie liczy.
   */
  reason: string;
}

export interface SessionVoidResult {
  sessionUuid: string;
  /** Uuid DOPISANEGO zdarzenia - adres wycofania na osi. */
  voidUuid: string;
  recordedAt: Date;
  /** Stan sesji PO unieważnieniu, policzony `projectSession` - panel nic nie liczy sam. */
  state: SessionState;
  /**
   * Miękkie naruszenia policzone PRZED zapisem: pilot nadal prowadzi sesję albo ma
   * otwarte własne okno korekty. Jadą w odpowiedzi POZYTYWNEJ, bo zapis już się odbył -
   * to treść, nie powód odmowy.
   */
  warnings: RuleViolation[];
  /**
   * Przebudowa karty arkusza tej doby. `null` = eksport rzucił (§4.7: karta to SKUTEK,
   * nie warunek) - unieważnienie zostaje w mocy, a panel ma to pokazać uczciwie.
   */
  reexport: ExportOutcome | null;
}

/**
 * Uproszczony CQRS repo: odmowa jest wariantem wyniku, nie wyjątkiem na granicy HTTP.
 * Trasa mapuje wariant na status i niczego nie interpretuje.
 */
export type SessionVoidOutcome =
  | { ok: true; result: SessionVoidResult }
  | { ok: false; reason: 'session_not_found' }
  | { ok: false; reason: 'rule_violation'; violations: RuleViolation[] };

/**
 * Sygnały przerwania transakcji. Muszą być WYJĄTKAMI, bo tylko wyjątek wycofuje
 * transakcję `AuditedWrite.run` - zwrócenie wartości zostawiłoby wpis audytu
 * o operacji, która się nie zdarzyła.
 */
class SessionNotFound extends Error {}

class RuleRejection extends Error {
  constructor(readonly violations: RuleViolation[]) {
    super(violations.map((v) => v.message).join(' '));
  }
}

/** Skutek transakcji: dopisane zdarzenie + stan sesji po jego nałożeniu. */
interface Applied {
  candidate: Event;
  state: SessionState;
  warnings: RuleViolation[];
}

export class AdminSessionVoidCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
    /** Pojemność zbiorników → `AircraftLimits` dla reguł; czytana W TEJ transakcji. */
    private readonly aircraft: AircraftConfigPort,
    private readonly exporter: DayExporter,
    private readonly clock: Clock,
    /** Generator uuid - funkcja, nie port: nie ma tu adaptera do podmiany. */
    private readonly newId: () => string,
  ) {}

  async voidSession(actor: Actor, input: SessionVoidInput): Promise<SessionVoidOutcome> {
    const at = this.clock.now();

    let applied: Applied;
    try {
      applied = await this.write.run(actor, async (tx) => {
        // Ta sama tarcza, co w `IngestCommands` i korekcie: blokada advisory per sesja
        // szereguje nas z paczką, którą właśnie dosyła telefon. Bez niej ingest mógłby
        // policzyć projekcję na strumieniu SPRZED unieważnienia i nadpisać nią wiersz
        // `sessions` - zdarzenie zostałoby w rejestrze, a sesja wróciłaby do sum.
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.sessionUuid]);

        const stream = await this.events.sessionEvents(tx, input.sessionUuid);
        if (stream.length === 0) throw new SessionNotFound();

        const before = projectSession(stream);

        const candidate = sessionVoidCandidate(
          before,
          stream,
          input.reason,
          this.newId(),
          at,
        );
        const limits: AircraftLimits = {
          capacityL: await this.aircraft.capacityL(tx, candidate.aircraftId),
          // Reguły paliwa i oleju nie dotyczą tego typu zdarzenia; limity jadą, bo
          // `checkAppend` ocenia KANDYDATA, a nie wybrany podzbiór reguł.
          oilMinL: null,
          oilCapacityL: null,
        };

        const errors = correctionViolations(before, candidate, limits);
        if (errors.length > 0) throw new RuleRejection(errors);

        const warnings = correctionWarnings(before, candidate, limits);

        await this.events.insertBatch(tx, [candidate], adminSourceDevice(actor.pilotId));

        // Projekcję liczymy z PEŁNEGO strumienia - `status` sesji jest funkcją całości,
        // a nie różnicą do dołożenia.
        const after = await this.events.sessionEvents(tx, input.sessionUuid);
        const state = projectSession(after);
        await this.sessions.upsert(tx, sessionRowFrom(input.sessionUuid, after));

        return {
          result: { candidate, state, warnings },
          audit: {
            action: 'session.void',
            targetType: 'session',
            targetId: input.sessionUuid,
            // KOMPLET tożsamości wpisu, nie sam uuid: po unieważnieniu żadna lista
            // panelu tej sesji nie pokazuje, więc dziennik audytu musi umieć
            // odpowiedzieć, CO wycofano - bez otwierania rejestru.
            details: {
              voidUuid: candidate.uuid,
              aircraftId: candidate.aircraftId,
              picId: candidate.picId,
              claimedAt: before.claimedAt,
              engineStartAt: before.legs[0]?.startedAt ?? null,
              engineStopAt: before.legs[0]?.stoppedAt ?? null,
              flights: before.flights.length,
              blockMs: before.blockTimeMs,
              reason: input.reason,
            },
          },
        };
      });
    } catch (err) {
      if (err instanceof SessionNotFound) return { ok: false, reason: 'session_not_found' };
      if (err instanceof RuleRejection) {
        return { ok: false, reason: 'rule_violation', violations: err.violations };
      }
      throw err;
    }

    return {
      ok: true,
      result: {
        sessionUuid: input.sessionUuid,
        voidUuid: applied.candidate.uuid,
        recordedAt: at,
        state: applied.state,
        warnings: applied.warnings,
        reexport: await this.reexport(input.sessionUuid),
      },
    };
  }

  /**
   * Przebudowa karty doby PO COMMICIE - dokument klubu ma przestać pokazywać wycofany
   * lot. Eksport wewnątrz transakcji pozwoliłby awarii arkusza cofnąć decyzję człowieka,
   * poprawną niezależnie od tego, czy karta się zapisała; przed commitem - utrwaliłby
   * w arkuszu stan, który mógł się nie zapisać.
   *
   * Wołamy `exportSession` mimo że sesja jest już wycofana: adres jest sesyjny, bo
   * wołający wie, CO się zmieniło, a przełożenie sesji na dobę jest regułą eksportera.
   * On sam pomija wiersze `voided` przy budowie karty.
   */
  private async reexport(sessionUuid: string): Promise<ExportOutcome | null> {
    try {
      return await this.exporter.exportSession(sessionUuid);
    } catch (err) {
      console.error(`przebudowa karty po unieważnieniu sesji ${sessionUuid} nie powiodła się:`, err);
      return null;
    }
  }
}
