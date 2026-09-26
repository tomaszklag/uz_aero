/**
 * Ninerdeck (serwer) - adapter ŚCIEŻKI AKCEPTACJI (`approval_steps` +
 * `approval_step_members`; migracja 13, issue #164).
 *
 * W `common/`, bo ścieżkę UKŁADA panel, a KLIKA po niej telefon: osobą kroku bywa zwykły
 * pilot bez dostępu do panelu (§11.2), więc decyzja z telefonu musi czytać tę samą listę,
 * którą administrator zapisał.
 *
 * ══ ZAPIS IDZIE CAŁĄ ŚCIEŻKĄ, NIE KROKAMI ══
 * `position` jest własnością LISTY, a nie żadnego kroku z osobna: przestawienie dwóch
 * pozycji zmienia dwa wiersze, a dołożenie kroku w środku - wszystkie następne. Zapis
 * per krok kazałby wołającemu składać tę arytmetykę u siebie i rozjechałby się przy
 * pierwszym równoczesnym zapisie z dwóch kart panelu.
 *
 * ══ KROKU SIĘ NIE KASUJE ══
 * Krok spoza zamówienia dostaje `removed_at` i przestaje być pytany. Decyzje pod nim
 * zapadłe zostają czytelne (append-only, §11.4), a klucz obcy `booking_approvals.step_id`
 * i tak nie pozwoliłby go usunąć.
 */

import type {
  ApprovalStepDraft,
  ApprovalStepRecord,
  ApprovalStepsPort,
  Queryable,
} from '../../../application/common/ports.ts';

interface StepDbRow {
  id: string;
  position: number | string;
  label: string;
  /** `string_agg` - pusty napis, gdy krok nie ma ani jednej osoby. */
  member_ids: string;
}

/**
 * Lista osób jedzie JEDNYM napisem, nie kolumną tablicową: tablice serializuje
 * STEROWNIK, a testy chodzą na PGlite i produkcja na `pg` - ta sama decyzja, co przy
 * zbiorze zdolności członkostwa (issue #197). Sortowanie w agregacie, żeby kolejność
 * była powtarzalna między odczytami.
 */
const SELECT = `
  SELECT s.id, s.position, s.label,
         COALESCE((SELECT string_agg(m.pilot_id, ',' ORDER BY m.pilot_id)
                     FROM approval_step_members m
                    WHERE m.org_id = s.org_id AND m.step_id = s.id), '') AS member_ids
    FROM approval_steps s
`;

const toRecord = (row: StepDbRow): ApprovalStepRecord => ({
  id: row.id,
  position: Number(row.position),
  label: row.label,
  memberIds: row.member_ids === '' ? [] : row.member_ids.split(','),
});

export class PgApprovalStepsRepo implements ApprovalStepsPort {
  async path(db: Queryable, orgId: string): Promise<ApprovalStepRecord[]> {
    // `removed_at IS NULL` jest tu REGUŁĄ, nie filtrem wygody: ścieżka jest zawsze
    // bieżąca (§11.2), więc krok zdjęty nie ma prawa zatrzymać żadnej sprawy w toku.
    // Remis `position` rozstrzyga `id` - tak samo, jak robi to `orderedSteps` w domenie.
    const { rows } = await db.query<StepDbRow>(
      `${SELECT} WHERE s.org_id = $1 AND s.removed_at IS NULL ORDER BY s.position, s.id`,
      [orgId],
    );
    return rows.map(toRecord);
  }

  async replace(
    tx: Queryable,
    orgId: string,
    steps: readonly ApprovalStepDraft[],
    at: Date,
  ): Promise<ApprovalStepRecord[]> {
    const ids = steps.map((s) => s.id);

    // 1. Ze ścieżki schodzi wszystko, czego w zamówieniu nie ma.
    await tx.query(
      `UPDATE approval_steps SET removed_at = $2
        WHERE org_id = $1 AND removed_at IS NULL AND NOT (id = ANY($3::text[]))`,
      [orgId, at, ids],
    );

    for (const [index, step] of steps.entries()) {
      // `WHERE approval_steps.org_id = $2` przy `DO UPDATE` nie jest ozdobą: bez niego
      // zamówienie z cudzym identyfikatorem kroku PRZEJMOWAŁOBY krok innego klubu -
      // a `id` jest tu kluczem globalnym, nie parą z klubem.
      await tx.query(
        `INSERT INTO approval_steps (id, org_id, position, label)
              VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
            SET position = EXCLUDED.position, label = EXCLUDED.label, removed_at = NULL
          WHERE approval_steps.org_id = $2`,
        [step.id, orgId, index, step.label],
      );

      // Lista osób to zbiór, więc wymieniamy ją w całości - różnicowanie dałoby ten sam
      // wynik dłuższą drogą (ta sama decyzja, co przy zbiorze zdolności członkostwa).
      await tx.query(`DELETE FROM approval_step_members WHERE org_id = $1 AND step_id = $2`, [
        orgId,
        step.id,
      ]);
      for (const pilotId of step.memberIds) {
        await tx.query(
          `INSERT INTO approval_step_members (org_id, step_id, pilot_id) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [orgId, step.id, pilotId],
        );
      }
    }

    return this.path(tx, orgId);
  }
}
