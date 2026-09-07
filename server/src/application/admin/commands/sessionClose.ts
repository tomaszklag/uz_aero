/**
 * UZ Aero (serwer) - ZAKOŃCZENIE ADMINISTRACYJNE OPERACJI z panelu (issue #81,
 * 2026-09-03: „admin powinien móc zakończyć rozpoczęty dowolny lot przez panel. Taki
 * lot mógłby od razu opcjonalnie oznaczyć jako usunięty").
 *
 * ══ PO CO ══
 * Operacja OSIEROCONA: pilot przejął maszynę, telefon padł / został w kabinie / nigdy
 * nie odzyskał zasięgu - i w rejestrze serwera samolot jest „zajęty" od trzech dni,
 * bo nikt go nie zdał (`activeClaim` pyta o `status = 'active'`). Reszta klubu widzi
 * cudzy claim na 02, a dziennik pokazuje operację „w toku" bez końca.
 *
 * ══ DLACZEGO OSOBNE ZDARZENIE, A NIE `day_close` W IMIENIU PILOTA ══
 * Bo `day_close` niesie OBOWIĄZKOWE odczyty (przekazanie) i twarde reguły o stanie
 * silnika, a administrator przy biurku nie wie, co pokazują przyrządy. Zdarzenie
 * z fałszywymi odczytami byłoby zmyśleniem, a poluzowanie reguł dla panelu złamałoby
 * zasadę „twarde reguły są w obu trybach identyczne" (`writeAuthority.test.ts`). Stąd
 * `session_close`: fakt „tę operację zakończył administrator", z powodem, bez odczytów.
 * Stan maszyny wpisuje potem osobna akcja w karcie samolotu (`aircraftReadings.ts`).
 *
 * ══ OPCJONALNE UNIEWAŻNIENIE W TYM SAMYM RUCHU ══
 * `void: true` dopisuje po zakończeniu także `session_void` (z `source: 'admin'`),
 * tym samym powodem. Dwa zdarzenia, nie jedno z flagą: unieważnienie ma własny typ,
 * własne reguły i własnych czytelników (wypada z sum, z eksportu, z dnia pilota),
 * a zakończenie mówi tylko „nie trwa". Panel pokazuje jedną kartę z jednym
 * przełącznikiem, rejestr dostaje dwa fakty.
 *
 * ══ CO SIĘ DZIEJE PO ZAPISIE ══
 *  1. projekcja `sessions` dostaje status `closed` (albo `voided`) - maszyna jest
 *     wolna; odczytów końcowych nie ma, więc `pickHandover` tej operacji nie bierze;
 *  2. karta arkusza doby powstaje od nowa (operacja zamknięta wchodzi do niej
 *     z kreskami zamiast odczytów; wycofana - wypada);
 *  3. na telefon pilota zdarzenie wraca przez `GET /me/events` - tam kokpit z niej
 *     schodzi, zaległy outbox tej operacji zostaje wstrzymany (§4.9), a ekran 01
 *     mówi pilotowi, kto i dlaczego zakończył jego lot.
 *
 * Operacja W TOKU jest tu NORMĄ, nie kolizją - to DOKŁADNIE ten przypadek, dla którego
 * ta komenda istnieje - więc zakończenie samo nie produkuje ostrzeżeń `ADMIN_EDIT_*`
 * (należą do korekt; przy opcjonalnym unieważnieniu pojawią się z reguł `session_void`).
 * Zdarzenia stemplujemy PIC-em sesji (single-writer §4.4); kto je dopisał, mówią
 * `events.source_device` i `admin_audit`.
 */

import {
  projectSession,
  type AircraftLimits,
  type Event,
  type RuleViolation,
  type SessionState,
} from '@uzaero/domain';

import {
  correctionViolations,
  correctionWarnings,
  sessionCloseCandidate,
  sessionVoidCandidate,
} from '../correctionCandidate.ts';
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

export interface SessionCloseInput {
  sessionUuid: string;
  /** Powód - WYMAGANY po stronie panelu (zamyka się cudzy lot), jak przy unieważnieniu. */
  reason: string;
  /** Od razu unieważnić wpis (lot otwarty przez pomyłkę, nie do liczenia). */
  void: boolean;
}

export interface SessionCloseResult {
  sessionUuid: string;
  /** Uuid dopisanego `session_close`. */
  closeUuid: string;
  /** Uuid dopisanego `session_void`; `null` = nie unieważniano. */
  voidUuid: string | null;
  recordedAt: Date;
  /** Stan PO zapisie, policzony `projectSession` - panel nic nie liczy sam. */
  state: SessionState;
  /** Miękkie kolizje (pilot nadal prowadzi) - w odpowiedzi POZYTYWNEJ, bo zapis się odbył. */
  warnings: RuleViolation[];
  /** Przebudowa karty arkusza; `null` = eksport rzucił (karta to skutek, nie warunek). */
  reexport: ExportOutcome | null;
}

export type SessionCloseOutcome =
  | { ok: true; result: SessionCloseResult }
  | { ok: false; reason: 'session_not_found' }
  | { ok: false; reason: 'rule_violation'; violations: RuleViolation[] };

class SessionNotFound extends Error {}

class RuleRejection extends Error {
  constructor(readonly violations: RuleViolation[]) {
    super(violations.map((v) => v.message).join(' '));
  }
}

interface Applied {
  close: Event;
  voided: Event | null;
  state: SessionState;
  warnings: RuleViolation[];
}

export class AdminSessionCloseCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
    private readonly aircraft: AircraftConfigPort,
    private readonly exporter: DayExporter,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  async closeSession(actor: Actor, input: SessionCloseInput): Promise<SessionCloseOutcome> {
    const at = this.clock.now();

    let applied: Applied;
    try {
      applied = await this.write.run(actor, async (tx) => {
        // Ta sama tarcza, co przy unieważnieniu i w ingeście: blokada advisory per sesja
        // szereguje nas z paczką, którą właśnie dosyła telefon pilota.
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.sessionUuid]);

        const stream = await this.events.sessionEvents(tx, input.sessionUuid);
        if (stream.length === 0) throw new SessionNotFound();

        const before = projectSession(stream);
        const limits: AircraftLimits = {
          capacityL: await this.aircraft.capacityL(tx, before.aircraftId ?? stream[0]!.aircraftId),
          oilMinL: null,
          oilCapacityL: null,
        };

        // 1. Zakończenie - oceniane na stanie SPRZED zapisu.
        const close = sessionCloseCandidate(before, stream, input.reason, this.newId(), at);
        const errors = correctionViolations(before, close, limits);
        if (errors.length > 0) throw new RuleRejection(errors);
        const warnings = correctionWarnings(before, close, limits);

        // 2. Opcjonalne unieważnienie - oceniane na stanie PO zakończeniu (stan jest
        //    funkcją całego strumienia, więc kandydata liczymy na strumieniu z dołożonym
        //    zakończeniem, a nie na `before`). Odmowa tu wycofuje OBA zapisy: pilot nie
        //    dostanie operacji zakończonej „w połowie" decyzji administratora.
        let voided: Event | null = null;
        if (input.void) {
          const afterClose = projectSession([...stream, close]);
          voided = sessionVoidCandidate(afterClose, stream, input.reason, this.newId(), at);
          const voidErrors = correctionViolations(afterClose, voided, limits);
          if (voidErrors.length > 0) throw new RuleRejection(voidErrors);
        }

        const batch = voided == null ? [close] : [close, voided];
        await this.events.insertBatch(tx, batch, adminSourceDevice(actor.pilotId));

        const after = await this.events.sessionEvents(tx, input.sessionUuid);
        const state = projectSession(after);
        await this.sessions.upsert(tx, sessionRowFrom(input.sessionUuid, after));

        return {
          result: { close, voided, state, warnings },
          audit: {
            action: 'session.close',
            targetType: 'session',
            targetId: input.sessionUuid,
            // Komplet tożsamości wpisu, jak przy unieważnieniu: po zamknięciu nikt już
            // nie zapyta dziennika, czemu maszyna nagle przestała być zajęta.
            details: {
              closeUuid: close.uuid,
              voidUuid: voided?.uuid ?? null,
              voided: voided != null,
              aircraftId: close.aircraftId,
              picId: close.picId,
              claimedAt: before.claimedAt,
              engineStartAt: before.legs[0]?.startedAt ?? null,
              engineStopAt: before.legs[0]?.stoppedAt ?? null,
              engineRunning: before.engineRunning,
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
        closeUuid: applied.close.uuid,
        voidUuid: applied.voided?.uuid ?? null,
        recordedAt: at,
        state: applied.state,
        warnings: applied.warnings,
        reexport: await this.reexport(input.sessionUuid),
      },
    };
  }

  /** Karta doby PO COMMICIE - jak przy unieważnieniu: awaria arkusza nie cofa decyzji. */
  private async reexport(sessionUuid: string): Promise<ExportOutcome | null> {
    try {
      return await this.exporter.exportSession(sessionUuid);
    } catch (err) {
      console.error(`przebudowa karty po zakończeniu sesji ${sessionUuid} nie powiodła się:`, err);
      return null;
    }
  }
}
