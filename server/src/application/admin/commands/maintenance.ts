/**
 * UZ Aero (serwer) — przebudowa projekcji `sessions` ze strumienia zdarzeń
 * (mockup `A11-konserwacja.html`, zaległość audytu: „skrypt administracyjny
 * przebudowy projekcji `sessions` ze zdarzeń").
 *
 * Operacja jest bezpieczna z definicji: `sessions` nie jest źródłem prawdy, tylko
 * zrzutem `projectSession(events)`, więc każdy jej wiersz da się odtworzyć — skasowanie
 * całej tabeli też nie zniszczyłoby informacji. **Ryzyko leży w tym, co robimy
 * z wynikiem porównania**, i stąd kształt tej komendy:
 *
 *  1. **Tryb `dry_run` jest domyślny.** Przelicza i PORÓWNUJE, niczego nie zapisując.
 *  2. **Niezerowa różnica to INCYDENT, nie zadanie do sprzątnięcia.** Projekcja jest
 *     odświeżana w tej samej transakcji, w której przyjmujemy zdarzenia, więc
 *     w normalnej pracy różnicy być NIE MOŻE. Zapis wyrówna liczby i tym samym skasuje
 *     jedyny ślad po tym, co je rozjechało. Najpierw przyczyna (wydanie domeny zmieniające
 *     regułę liczenia? ręczny `UPDATE`? odtworzenie z kopii zrobionej w połowie
 *     strumienia?), dopiero potem `write`.
 *  3. **Rejestru `events` nie dotyka.** Czyta strumień, nadpisuje wyłącznie projekcję.
 *
 * Ślad w audycie powstaje TAKŻE dla `dry_run`, choć nic się nie zapisuje: sama
 * informacja „projekcja dryfowała o 2 wiersze” jest faktem, który ktoś kiedyś będzie
 * chciał odtworzyć (A11).
 *
 * Konstruktor bez `Database`/`Queryable` — komenda nie ma jak zapisać z pominięciem
 * śladu audytu (`auditedWrite.ts`, `test/architecture.test.ts`).
 */

import { sheetDay } from '../../export/daySheetContent.ts';
import { sessionRowFrom } from '../../sessionRow.ts';
import type { EventsStorePort, SessionsProjectionPort } from '../../ports.ts';
import type {
  ProjectionRowDiff,
  RebuildMode,
  RebuildReport,
} from '../contracts/maintenance.ts';
import { projectionDiff } from '../projectionDiff.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor, MaintenanceAdminPort } from '../ports.ts';

/**
 * Uchwyt do bazy TAKI, JAKI WRĘCZA `AuditedWrite` — typ wyprowadzony z jego sygnatury,
 * a nie zaimportowany z portów.
 *
 * Różnica jest merytoryczna, nie kosmetyczna. Komenda panelu nie ma prawa znać bazy
 * „skądinąd": `test/architecture.test.ts` wywala się, gdy plik w `commands/` importuje
 * `Database` albo `Queryable`, bo to jest druga połowa mechanizmu audytu (pierwsza to
 * `Audited<T>` wymuszony typem). Rozbicie długiej pętli na metody wymaga jednak nazwania
 * tego, co dostaliśmy WEWNĄTRZ bramy — i taki właśnie jest ten typ: „to, co wręczył
 * `AuditedWrite`", a nie „baza".
 */
type AuditedTx = Parameters<Parameters<AuditedWrite['run']>[1]>[0];

export interface RebuildInput {
  /** Domyślnie `dry_run` — wartość domyślna jest tu częścią zabezpieczenia. */
  mode?: RebuildMode;
  /**
   * Powód nadpisania; obowiązkowy dla `write` (A11: „Nadpisanie odblokowuje się dopiero
   * po świeżym porównaniu i podaniu powodu”), trafia WYŁĄCZNIE do audytu.
   */
  reason?: string;
}

export type RebuildOutcome =
  | { ok: true; report: RebuildReport }
  /** `write` bez uzasadnienia — wada ŻĄDANIA, nie stanu świata. */
  | { ok: false; reason: 'reason_required' };

/**
 * Ile uuidów sesji wchodzi do `admin_audit.details`. Liczby (ile wierszy, ile pól)
 * idą zawsze i w całości; lista jest przycięta, bo dziennik audytu ma być czytelny,
 * a nie być drugą kopią raportu. Pełny raport dostaje wołający.
 */
const AUDIT_UUID_LIMIT = 50;

export class AdminMaintenanceCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly maintenance: MaintenanceAdminPort,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
  ) {}

  async rebuildProjections(actor: Actor, input: RebuildInput = {}): Promise<RebuildOutcome> {
    const mode: RebuildMode = input.mode ?? 'dry_run';
    const reason = input.reason?.trim() ?? '';
    if (mode === 'write' && reason.length === 0) return { ok: false, reason: 'reason_required' };

    const report = await this.write.run(actor, async (tx) => {
      const result = await this.compare(tx, mode);
      return {
        result,
        audit: {
          action: 'maintenance.rebuild_projections',
          // Celem jest CAŁA projekcja, nie pojedynczy wiersz — `targetId: null` mówi
          // to wprost, zamiast udawać, że akcja dotyczyła którejś sesji.
          targetType: 'projection',
          targetId: null,
          details: {
            mode: result.mode,
            sessions: result.sessions,
            rowsDiffering: result.rowsDiffering,
            fieldsDiffering: result.fieldsDiffering,
            written: result.written,
            sessionUuids: result.diffs.slice(0, AUDIT_UUID_LIMIT).map((d) => d.sessionUuid),
            reason: reason.length > 0 ? reason : null,
          },
        },
      };
    });

    return { ok: true, report };
  }

  /** Przeliczenie i porównanie całego rejestru; zapis wyłącznie w trybie `write`. */
  private async compare(tx: AuditedTx, mode: RebuildMode): Promise<RebuildReport> {
    const uuids = await this.maintenance.sessionUuids(tx);
    const diffs: ProjectionRowDiff[] = [];
    let fieldsDiffering = 0;
    let written = 0;

    for (const sessionUuid of uuids) {
      const stream = await this.events.sessionEvents(tx, sessionUuid);
      // Rejestr jest źródłem listy, więc pusty strumień znaczy tylko tyle, że sesja
      // zniknęła między zapytaniami — nie ma z czego liczyć projekcji.
      if (stream.length === 0) continue;

      const computed = sessionRowFrom(sessionUuid, stream);
      const stored = await this.sessions.get(tx, sessionUuid);

      const fields = stored == null ? [] : projectionDiff(stored, computed);
      if (stored != null && fields.length === 0) continue;

      fieldsDiffering += fields.length;
      diffs.push({
        sessionUuid,
        aircraftId: computed.aircraftId,
        day: computed.claimTime == null ? null : sheetDay(computed.claimTime),
        missing: stored == null,
        fields,
      });

      if (mode === 'write') {
        await this.rewrite(tx, sessionUuid);
        written += 1;
      }
    }

    return {
      mode,
      sessions: uuids.length,
      rowsDiffering: diffs.length,
      fieldsDiffering,
      written,
      diffs,
    };
  }

  /**
   * Nadpisanie JEDNEGO wiersza — z blokadą advisory i PONOWNYM odczytem strumienia.
   *
   * Bez blokady przebudowa mogłaby wyścignąć się z paczką, którą właśnie dosyła telefon:
   * nasz strumień byłby sprzed jej przyjęcia, a upsert cofnąłby liczby dnia po cichu —
   * czyli narzędzie do wykrywania dryfu samo by go tworzyło. Blokujemy WYŁĄCZNIE sesje
   * faktycznie nadpisywane (typowo zero albo kilka), bo blokada na każdą sesję w bazie
   * trzymałaby tysiące wpisów do końca transakcji.
   *
   * To ta sama blokada i ten sam powód, co w `IngestCommands` i `AdminCorrectionCommands`.
   */
  private async rewrite(tx: AuditedTx, sessionUuid: string): Promise<void> {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [sessionUuid]);
    const fresh = await this.events.sessionEvents(tx, sessionUuid);
    if (fresh.length === 0) return;
    await this.sessions.upsert(tx, sessionRowFrom(sessionUuid, fresh));
  }
}
