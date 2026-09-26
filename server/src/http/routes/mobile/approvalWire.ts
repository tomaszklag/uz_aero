/**
 * Ninerdeck (serwer) - ŚCIEŻKA AKCEPTACJI NA DRUCIE (milestone 3.1.0, issue #164).
 *
 * Jeden kształt dla karty rezerwacji (23b/23c/23d/23e) i dla odpowiedzi na decyzję -
 * bo to ta sama rzecz oglądana w dwóch chwilach. Dwa kształty rozjechałyby się przy
 * pierwszej zmianie i ekran mówiłby co innego przed decyzją, a co innego po niej.
 *
 * ══ NAZWISK DECYDUJĄCYCH NIE MA ══
 * Ścieżka odpowiada na „ile kroków zostało i kto je trzyma" NAZWĄ kroku (§9.4). Krok
 * bywa obsadzony przez kilka osób i rozstrzyga pierwsza, więc jedno nazwisko byłoby
 * nieprawdą, a trzy - listą do przepisania przy każdej zmianie obsady. Z tego samego
 * powodu nie ma tu `decidedBy`: „Mechanik zatwierdził" mówi wszystko, co ekran pisze.
 */

import type { ApprovalView } from '../../../application/common/commands/approvals.ts';

export function approvalWire(view: ApprovalView): Record<string, unknown> {
  return {
    outcome: view.outcome,
    steps: view.steps.map((step) => ({
      id: step.id,
      label: step.label,
      current: step.current,
      decision:
        step.decision == null
          ? null
          : {
              decision: step.decision.decision,
              via: step.decision.via,
              reason: step.decision.reason,
              decidedAt: new Date(step.decision.decidedAt).toISOString(),
            },
    })),
  };
}
