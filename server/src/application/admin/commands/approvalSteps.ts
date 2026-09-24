/**
 * Ninerdeck (serwer) - ŚCIEŻKA AKCEPTACJI UKŁADANA W PANELU (milestone 3.1.0,
 * issue #164; `docs/rezerwacje.md` §11.2).
 *
 * Administrator nadaje krokom nazwy, ustala kolejność i dopisuje do każdego osoby, które
 * mogą go zatwierdzić. To jest decyzja o CUDZYCH sprawach w najmocniejszym sensie: kroki
 * rozstrzygają, czyja zgoda jest potrzebna, żeby ktokolwiek w klubie poleciał - stąd
 * zdolność `accounts.manage` i ślad w dzienniku.
 *
 * Konstruktor bez `Database`: jedyną drogą zapisu panelu jest `AuditedWrite`, a komenda
 * bez uchwytu do bazy nie ma jak go obejść. Odczyty idą więc przez `tx` W ŚRODKU
 * transakcji - to także reguła wydajnościowa: odczyt cudzym uchwytem w otwartej
 * transakcji zawiesza PGlite (`docs/architektura-panelu-serwer.md` §7.9).
 *
 * ══ KROK BEZ ANI JEDNEJ OSOBY JEST ODMAWIANY ══
 * Taki krok zatrzymuje rezerwacje NA ZAWSZE: nikt nie może go zatwierdzić, a ścieżka
 * jest bieżąca, więc dotyczy to także spraw złożonych wcześniej. To pierwsza z dwóch
 * zapór (druga: administrator odblokowuje każdy krok, §11.2) i jedyna, która działa
 * ZANIM ktokolwiek utknie.
 *
 * ══ ZAPIS ŚCIEŻKI DOMYKA I PRZEKIEROWUJE SPRAWY W TOKU (issue #207) ══
 * Ścieżka jest zawsze bieżąca, więc jej zapis zmienia stan każdej czekającej sprawy -
 * a wiersz rezerwacji sam tego nie zauważy. W TEJ SAMEJ transakcji `ApprovalFlow.reconcile`
 * potwierdza sprawy z kompletem zgód, prosi osoby nowego kroku bieżącego i dopisuje
 * pominięcia rezerwującego pod krokami dołożonymi później. Budzik idzie PO commicie.
 */

import type {
  ApprovalStepDraft,
  ApprovalStepRecord,
  ApprovalStepsPort,
  Clock,
} from '../../common/ports.ts';
import type { ApprovalFlow, PathReconcile } from '../../common/commands/approvals.ts';
import type { Notifier } from '../../common/notify/notifier.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor, PilotsAdminPort } from '../ports.ts';

/** Krok w zamówieniu panelu. `id` puste = krok nowy; identyfikator nadaje komenda. */
export interface ApprovalStepInput {
  id?: string | null;
  label: string;
  memberIds: readonly string[];
}

/** Ile spraw w toku zapis ścieżki domknął i ile przekierował - do banera w panelu. */
export type PathEffect = Pick<PathReconcile, 'confirmed' | 'moved'>;

export type ApprovalStepsOutcome =
  | { ok: true; steps: ApprovalStepRecord[]; reconciled: PathEffect }
  | { ok: false; reason: ApprovalStepsRefusal; stepLabel: string };

export type ApprovalStepsRefusal =
  /** Krok bez ani jednej osoby - zatrzymałby rezerwacje klubu na zawsze. */
  | 'step_without_members'
  /** Ktoś z listy nie jest aktywnym członkiem TEGO klubu (albo już nim nie jest). */
  | 'member_not_in_org';

class Refused extends Error {
  constructor(
    readonly reason: ApprovalStepsRefusal,
    readonly stepLabel: string,
  ) {
    super(`odmowa: ${reason}`);
  }
}

export class ApprovalStepsCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly steps: ApprovalStepsPort,
    private readonly members: PilotsAdminPort,
    private readonly approvals: ApprovalFlow,
    private readonly notifier: Notifier,
    private readonly newId: () => string,
    private readonly clock: Clock,
  ) {}

  /**
   * Zapisuje ścieżkę W CAŁOŚCI. Zamówienie zamiast operacji na pojedynczych krokach,
   * bo kolejność jest własnością CAŁEJ listy: przestawienie dwóch pozycji zmienia dwa
   * wiersze, a dołożenie kroku w środku - wszystkie następne.
   */
  async replace(actor: Actor, input: readonly ApprovalStepInput[]): Promise<ApprovalStepsOutcome> {
    try {
      const { steps, reconciled } = await this.write.run(actor, async (tx) => {
        const before = await this.steps.path(tx, actor.orgId);

        const drafts: ApprovalStepDraft[] = [];
        for (const step of input) {
          if (step.memberIds.length === 0) throw new Refused('step_without_members', step.label);
          // Obsadę sprawdzamy WOBEC ŻYWEGO KLUBU, nie wobec listy sprzed miesiąca: krok
          // obsadzony osobą, która odeszła, jest tym samym, co krok pusty. `byId` zawęża
          // po klubie, więc cudzy członek jest tu po prostu nieznany.
          for (const id of step.memberIds) {
            const member = await this.members.byId(tx, actor.orgId, id);
            if (member == null || !member.active) throw new Refused('member_not_in_org', step.label);
          }
          drafts.push({
            id: step.id == null || step.id === '' ? this.newId() : step.id,
            label: step.label,
            memberIds: step.memberIds,
          });
        }

        const after = await this.steps.replace(tx, actor.orgId, drafts, this.clock.now());
        const reconciled = await this.approvals.reconcile(tx, actor.orgId, before, after);
        return {
          result: { steps: after, reconciled },
          audit: {
            action: 'approval.steps' as const,
            targetType: 'organization',
            targetId: actor.orgId,
            // Ścieżka PRZED i PO, bo pytanie brzmi zwykle „od kiedy to tak działa
            // i kto to przestawił" - a sama nowa lista na nie nie odpowiada. Obok
            // liczby spraw, które ten zapis domknął i przekierował (issue #207).
            details: {
              before: summary(before),
              after: summary(after),
              confirmed: reconciled.confirmed,
              moved: reconciled.moved,
            },
          },
        };
      });

      // Budzik PO commicie i nigdy przed: push jest budzikiem, nie treścią, więc jego
      // awaria ma kosztować ciszę w telefonie, a nie niezapisaną ścieżkę.
      await this.notifier.wake(reconciled.notices);
      return {
        ok: true,
        steps,
        reconciled: { confirmed: reconciled.confirmed, moved: reconciled.moved },
      };
    } catch (err) {
      if (err instanceof Refused) return { ok: false, reason: err.reason, stepLabel: err.stepLabel };
      throw err;
    }
  }
}

/** Ścieżka w dzienniku: nazwy i obsada, bez identyfikatorów kroków - te nic nie mówią. */
const summary = (steps: readonly ApprovalStepRecord[]): unknown[] =>
  steps.map((s) => ({ label: s.label, members: s.memberIds.length }));
