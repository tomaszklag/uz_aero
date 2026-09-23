/**
 * Ninerdeck (serwer) - adapter DECYZJI NA REZERWACJI (`booking_approvals`; migracja 13,
 * issue #164, `docs/rezerwacje.md` §11.4).
 *
 * Tabela jest APPEND-ONLY: zapis mówi, kto co postanowił, kiedy i dlaczego. Zmiana
 * zdania znaczy nową rezerwację, nie nadpisanie decyzji - stąd brak jakiegokolwiek
 * `UPDATE` w tym pliku i klucz główny na parze (rezerwacja, krok).
 *
 * ══ DECYZJA WSKAZUJE KROK, NIE JEGO NUMER ══
 * `step_id` jest trwałe, `approval_steps.position` zmienne. Zapis pod numerem
 * opisywałby po dołożeniu kroku w środku INNY krok niż w chwili kliknięcia - czyli
 * żywa ścieżka po cichu przepisywałaby cudze podpisy (§11.2).
 */

import type {
  ApprovalVerdict,
  ApprovalVia,
  BookingApprovalRecord,
  BookingApprovalsPort,
  NewApproval,
  Queryable,
} from '../../../application/common/ports.ts';

interface ApprovalDbRow {
  step_id: string;
  decision: string;
  via: string;
  reason: string | null;
  decided_by: string;
  decided_at: string | Date;
}

export class PgBookingApprovalsRepo implements BookingApprovalsPort {
  async listFor(
    db: Queryable,
    orgId: string,
    bookingId: string,
  ): Promise<BookingApprovalRecord[]> {
    const { rows } = await db.query<ApprovalDbRow>(
      `SELECT step_id, decision, via, reason, decided_by, decided_at
         FROM booking_approvals
        WHERE org_id = $1 AND booking_id = $2
        ORDER BY decided_at, step_id`,
      [orgId, bookingId],
    );
    return rows.map((row) => ({
      stepId: row.step_id,
      decision: row.decision as ApprovalVerdict,
      via: row.via as ApprovalVia,
      reason: row.reason,
      decidedBy: row.decided_by,
      decidedAt: new Date(row.decided_at).getTime(),
    }));
  }

  async insert(
    tx: Queryable,
    orgId: string,
    bookingId: string,
    decisions: readonly NewApproval[],
    at: Date,
  ): Promise<void> {
    for (const d of decisions) {
      // `ON CONFLICT DO NOTHING`, a nie odmowa: druga decyzja na tym samym kroku znaczy
      // przegrany wyścig dwóch osób z listy (§11.2 - wystarczy zgoda jednej), a nie
      // usterkę zapisu. Pierwsza zostaje, bo to ona zapadła.
      await tx.query(
        `INSERT INTO booking_approvals
           (booking_id, org_id, step_id, decision, via, reason, decided_by, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [bookingId, orgId, d.stepId, d.decision, d.via, d.reason, d.decidedBy, at],
      );
    }
  }
}
