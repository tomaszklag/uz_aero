/**
 * Ninerdeck (serwer) - ŚCIEŻKA AKCEPTACJI REZERWACJI w ruchu (milestone 3.1.0,
 * issue #164; `docs/rezerwacje.md` §11, §12).
 *
 * Rozstrzygnięcia („który krok pyta teraz", „czy ta decyzja może zapaść") liczy CZYSTA
 * domena (`domain/approvals.ts`). Tutaj jest to, czego ona z definicji nie ma: odczyt
 * ścieżki i decyzji, zapis w transakcji, powiadomienia i zmiana stanu rezerwacji.
 *
 * W `common/`, bo ścieżka dotyka OBU powierzchni: rezerwację zakłada telefon, decyzję
 * podejmuje telefon (osobą kroku bywa zwykły pilot bez dostępu do panelu, §11.2),
 * a konfigurację układa panel.
 *
 * ══ ŚCIEŻKA JEST ZAWSZE BIEŻĄCA ══
 * Każda z tych metod czyta konfigurację klubu NA ŻYWO. Kopia z chwili złożenia byłaby
 * drugą prawdą, która rozjeżdża się przy pierwszej poprawce ścieżki i nikt tego nie
 * zauważa - cena (dołożenie kroku COFA sprawy w toku) jest przyjęta świadomie.
 */

import {
  approvalOutcome,
  currentStep,
  orderedSteps,
  pendingApprovers,
  refuseDecision,
  selfApprovedSteps,
  type ApprovalDecision,
  type ApprovalOutcome,
  type ApprovalRefusal,
  type ApprovalStep,
} from '../../../domain/approvals.ts';
import type {
  ApprovalStepRecord,
  ApprovalStepsPort,
  ApprovalVerdict,
  ApprovalVia,
  BookingApprovalRecord,
  BookingApprovalsPort,
  BookingRecord,
  BookingsPort,
  Clock,
  Database,
  NewApproval,
  Queryable,
} from '../ports.ts';
import type { Notifier } from '../notify/notifier.ts';
import {
  approvalRequested,
  bookingApproved,
  bookingRejected,
  type NoticeBooking,
  type NotificationDraft,
} from '../notify/bookingNotices.ts';

/** Co ma się stać z NOWĄ rezerwacją, zanim powstanie jej wiersz. */
export interface ApprovalPlan {
  /** Stan startowy: `confirmed` w klubie bez ścieżki i przy komplecie pominięć. */
  status: 'pending' | 'confirmed';
  /** Kroki, na których stoi sam rezerwujący - zapisywane jako decyzje z `via = self`. */
  selfApproved: NewApproval[];
  /** Prośby o zgodę do osób kroku bieżącego. Puste, gdy nie ma o co pytać. */
  notices: NotificationDraft[];
}

/**
 * Krok widziany przez pilota i przez akceptującego - BEZ NAZWISK decydujących (§9.4):
 * krok bywa obsadzony przez kilka osób i rozstrzyga pierwsza, więc jedno nazwisko
 * byłoby nieprawdą, a trzy - listą do przepisania przy każdej zmianie obsady.
 */
export interface ApprovalStepView {
  id: string;
  label: string;
  /**
   * Decyzja pod tym krokiem; `null` = jeszcze nie zapadła.
   *
   * `decidedBy` jest tu, choć telefon go NIE dostaje (`approvalWire` go pomija, §9.4):
   * panel pyta „do kogo zadzwonić" (issue #165, H5), a widok jest jeden - o tym, które
   * pola jadą na drut, rozstrzyga trasa, nie warstwa aplikacji.
   */
  decision: {
    decision: ApprovalVerdict;
    via: ApprovalVia;
    reason: string | null;
    decidedBy: string;
    decidedAt: number;
  } | null;
  /** Czy to jego pytamy TERAZ. */
  current: boolean;
}

/** Stan ścieżki jednej rezerwacji. `steps` puste = klub bez akceptacji (§11.1). */
export interface ApprovalView {
  outcome: ApprovalOutcome;
  steps: ApprovalStepView[];
}

/**
 * Pozycja KOLEJKI DECYZJI (issue #165, H3): rezerwacja czekająca na krok, na którego
 * liście stoi pytający. `members` i `next` niosą materiał na zdanie pod listą („krok ma
 * dwie osoby i rozstrzyga pierwsza; po zatwierdzeniu idzie do kroku …").
 */
export interface ApprovalQueueItem {
  booking: BookingRecord;
  step: { id: string; label: string; members: number; next: string | null };
}

/** Kto próbuje zdecydować. */
export interface DecisionActor {
  pilotId: string;
  /**
   * Władza nad CUDZYM planem (`reservations.manage`) - odblokowuje każdy krok. Bez niej
   * wystarczyłoby jedno odejście z klubu, żeby rezerwacje utknęły na zawsze (§11.2).
   */
  manages: boolean;
}

export type DecisionResult =
  | { ok: true; booking: BookingRecord; view: ApprovalView }
  | { ok: false; refusal: ApprovalRefusal | 'booking_closed' };

export class ApprovalFlow {
  constructor(
    private readonly db: Database,
    private readonly steps: ApprovalStepsPort,
    private readonly approvals: BookingApprovalsPort,
    private readonly bookings: BookingsPort,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  /**
   * Co ma się stać z nową rezerwacją. Liczone PRZED zapisem, bo wynikiem jest między
   * innymi stan startowy wiersza - a tego nie da się dołożyć po fakcie bez drugiego
   * zapisu, który mógłby się nie powieść.
   */
  async plan(
    orgId: string,
    requesterPilotId: string,
    booking: NoticeBooking,
  ): Promise<ApprovalPlan> {
    const path = await this.steps.path(this.db, orgId);
    if (path.length === 0) return { status: 'confirmed', selfApproved: [], notices: [] };

    // Nikt nie prosi człowieka o zgodę na własny plan. Pominięcie zapisuje się jako
    // DECYZJA z adnotacją `self`, a nie jako brak wpisu: po miesiącu krok pominięty
    // musi być odróżnialny od kroku, o który nikt nie zapytał (§11.2).
    const selfApproved: NewApproval[] = selfApprovedSteps(path, requesterPilotId).map((step) => ({
      stepId: step.id,
      decision: 'approved',
      via: 'self',
      reason: null,
      decidedBy: requesterPilotId,
    }));

    const decisions: ApprovalDecision[] = selfApproved.map((d) => ({
      stepId: d.stepId,
      decision: d.decision,
    }));
    if (approvalOutcome(path, decisions) === 'confirmed') {
      return { status: 'confirmed', selfApproved, notices: [] };
    }

    const step = currentStep(path, decisions);
    const notices =
      step == null ? [] : approvalRequested(booking, pendingApprovers(path, decisions), step);
    return { status: 'pending', selfApproved, notices };
  }

  /**
   * Zapis planu - W TEJ SAMEJ transakcji, co powstanie rezerwacji. Budzik (`wake`)
   * zostaje wołającemu, bo idzie PO commicie.
   */
  async recordPlan(
    tx: Queryable,
    orgId: string,
    bookingId: string,
    plan: ApprovalPlan,
  ): Promise<void> {
    const at = this.clock.now();
    await this.approvals.insert(tx, orgId, bookingId, plan.selfApproved, at);
    await this.notifier.record(tx, orgId, plan.notices, at);
  }

  /**
   * ŚCIEŻKA OD NOWA po poprawce terminu (3.1.0, §9.4 - decyzja właściciela 2026-09-23).
   *
   * Zgoda dotyczyła KONKRETNEGO terminu, więc po przesunięciu przestaje cokolwiek
   * znaczyć. Żywe decyzje dostają stempel zastąpienia (rejestr zostaje append-only),
   * a nowy plan zapisuje się jak przy złożeniu: pominięcia rezerwującego i prośby do
   * kroku bieżącego - w TEJ SAMEJ transakcji, co nowy termin. Budzik (`wake`) zostaje
   * wołającemu, bo idzie po commicie.
   *
   * Plan liczy WOŁAJĄCY PRZED transakcją (`plan`) - z tego samego powodu, co przy
   * złożeniu: jego wynikiem jest stan wiersza, a odczyt cudzym uchwytem w otwartej
   * transakcji zawiesza PGlite.
   */
  async restart(
    tx: Queryable,
    orgId: string,
    bookingId: string,
    plan: ApprovalPlan,
  ): Promise<void> {
    const at = this.clock.now();
    await this.approvals.supersede(tx, orgId, bookingId, at);
    await this.approvals.insert(tx, orgId, bookingId, plan.selfApproved, at);
    await this.notifier.record(tx, orgId, plan.notices, at);
  }

  /**
   * ŚCIEŻKA ŻYWA klubu - do ekranu konfiguracji w panelu. Pusta lista NIE JEST brakiem
   * konfiguracji do naprawienia: to stan domyślny każdego klubu i znaczy „rezerwacja
   * potwierdza się od razu" (§11.1).
   */
  async path(orgId: string): Promise<ApprovalStepRecord[]> {
    return this.steps.path(this.db, orgId);
  }

  /** Stan ścieżki - dla karty rezerwacji (23b/23c/23d/23e) i ekranu decyzji (26). */
  async view(orgId: string, bookingId: string): Promise<ApprovalView> {
    const [path, decisions] = await Promise.all([
      this.steps.path(this.db, orgId),
      this.approvals.listFor(this.db, orgId, bookingId),
    ]);
    return viewOf(path, decisions);
  }

  /**
   * CO CZEKA NA TĘ OSOBĘ (kolejka decyzji w panelu, issue #165) - rezerwacje klubu
   * w stanie `pending`, których krok BIEŻĄCY ma ją na liście.
   *
   * Zawężenie do „mojego kroku" jest treścią ekranu, nie oszczędnością: kolejka cudzego
   * kroku nie jest sprawą pytającego i nie ma jak jej rozstrzygnąć (makieta K5).
   * Administrator z `reservations.manage` odblokowuje utkniętą sprawę Z JEJ KARTY
   * (szuflada zajętości), nie z tej listy - tu stoją wyłącznie prośby skierowane do niego.
   *
   * Osoba spoza każdego kroku dostaje pustą listę BEZ pytania o rezerwacje: ścieżka jest
   * jednym odczytem, a lista czekających - jednym na każdą sprawę.
   */
  async queueFor(orgId: string, pilotId: string): Promise<ApprovalQueueItem[]> {
    const path = await this.steps.path(this.db, orgId);
    if (!path.some((step) => step.memberIds.includes(pilotId))) return [];

    const ordered = orderedSteps(path);
    const waiting = await this.bookings.pending(this.db, orgId);
    const out: ApprovalQueueItem[] = [];
    for (const booking of waiting) {
      const decisions = await this.approvals.listFor(this.db, orgId, booking.id);
      if (approvalOutcome(path, decisions) !== 'pending') continue;
      const step = currentStep(path, decisions);
      if (step == null || !step.memberIds.includes(pilotId)) continue;
      const at = ordered.findIndex((s) => s.id === step.id);
      out.push({
        booking,
        step: {
          id: step.id,
          label: step.label,
          members: step.memberIds.length,
          next: ordered[at + 1]?.label ?? null,
        },
      });
    }
    return out;
  }

  /**
   * DECYZJA CZŁOWIEKA. `null` = rezerwacji nie ma w tym klubie (trasa robi 404).
   *
   * Kolejność jest tu istotna: reguły pytają o stan SPRZED zapisu, a rezerwację
   * przestawiamy dopiero po dopisaniu decyzji - bo to ona jest faktem, a status wiersza
   * tylko jego skutkiem.
   */
  async decide(
    orgId: string,
    bookingId: string,
    actor: DecisionActor,
    input: { decision: ApprovalVerdict; reason: string | null },
  ): Promise<DecisionResult | null> {
    const booking = await this.bookings.byId(this.db, orgId, bookingId);
    if (booking == null) return null;
    // Wyłączenie maszyny z użytku ścieżki nie ma i mieć nie może: nie jest cudzym planem,
    // tylko stanem egzemplarza. Odpowiedź jest ta sama, co przy rezerwacji rozstrzygniętej.
    if (booking.kind !== 'flight' || booking.status !== 'pending') {
      return { ok: false, refusal: 'not_pending' };
    }

    const path = await this.steps.path(this.db, orgId);
    const decisions = await this.approvals.listFor(this.db, orgId, bookingId);
    const refusal = refuseDecision(path, decisions, {
      deciderPilotId: actor.pilotId,
      decision: input.decision,
      reason: input.reason,
      overrides: actor.manages,
    });
    if (refusal != null) return { ok: false, refusal };

    const step = currentStep(path, decisions);
    // Nie ma jak tu trafić (`refuseDecision` oddałoby wcześniej `not_pending`), ale
    // kompilator o tym nie wie, a wyjątek byłby gorszą odpowiedzią niż ta sama odmowa.
    if (step == null) return { ok: false, refusal: 'not_pending' };

    const at = this.clock.now();
    const after: ApprovalDecision[] = [...decisions, { stepId: step.id, decision: input.decision }];
    const outcome = approvalOutcome(path, after);
    const notices = noticesFor(booking, outcome, path, after, {
      reason: input.reason,
      decidedBy: actor.pilotId,
      stepLabel: step.label,
    });

    const written = await this.db.transaction(async (tx) => {
      await this.approvals.insert(
        tx,
        orgId,
        bookingId,
        [
          {
            stepId: step.id,
            decision: input.decision,
            via: 'person',
            reason: input.reason,
            decidedBy: actor.pilotId,
          },
        ],
        at,
      );

      // Stan wiersza idzie ZA decyzją i tylko wtedy, gdy sprawa się domyka. Krok
      // pośredni nie rusza rezerwacji - ona dalej czeka i dalej trzyma slot.
      const row =
        outcome === 'confirmed'
          ? await this.bookings.confirm(tx, orgId, bookingId, at)
          : outcome === 'rejected'
            ? await this.bookings.close(tx, orgId, bookingId, {
                status: 'rejected',
                at,
                // Powód odmowy jest ZDANIEM CZŁOWIEKA, więc `close_reason` jest jego
                // właściwym miejscem - inaczej niż przy zwolnieniu slotu i wygaśnięciu,
                // gdzie nikt nic nie powiedział (§11.5).
                reason: input.reason,
              })
            : booking;
      if (row == null) return null;

      await this.notifier.record(tx, orgId, notices, at);
      return row;
    });

    // Rezerwacja przestała być `pending` między odczytem a zapisem: odwołał ją pilot
    // albo rozstrzygnął panel. To nie jest awaria - to jest ta sama odpowiedź.
    if (written == null) return { ok: false, refusal: 'booking_closed' };

    await this.notifier.wake(notices);
    // Widok czytamy z BAZY, a nie składamy z tego, co przed chwilą wysłaliśmy: druga
    // osoba z listy mogła zdecydować równolegle, a wtedy zapis oddał jej podpis
    // (`ON CONFLICT DO NOTHING`) i to jego ma zobaczyć ekran.
    return { ok: true, booking: written, view: await this.view(orgId, bookingId) };
  }
}

/** Widok ścieżki - JEDNO miejsce, więc karta rezerwacji i ekran decyzji mówią to samo. */
function viewOf(
  path: readonly ApprovalStep[],
  decisions: readonly BookingApprovalRecord[],
): ApprovalView {
  const byStep = new Map(decisions.map((d) => [d.stepId, d]));
  const current = currentStep(path, decisions);
  return {
    outcome: approvalOutcome(path, decisions),
    steps: orderedSteps(path).map((step) => {
      const decided = byStep.get(step.id);
      return {
        id: step.id,
        label: step.label,
        decision:
          decided == null
            ? null
            : {
                decision: decided.decision,
                via: decided.via,
                reason: decided.reason,
                decidedBy: decided.decidedBy,
                decidedAt: decided.decidedAt,
              },
        current: current?.id === step.id,
      };
    }),
  };
}

/**
 * Kto ma się dowiedzieć o tej decyzji.
 *
 * Sprawa domknięta → REZERWUJĄCY (z powodem przy odmowie, §9.4). Sprawa idzie dalej →
 * osoby NASTĘPNEGO kroku. Rezerwujący przy kroku pośrednim wiadomości NIE DOSTAJE:
 * „mechanik zwolnił maszynę" nie jest jeszcze odpowiedzią na jego pytanie, a skrzynka
 * zapalająca się przy każdym podpisie uczy pomijać licznik (reguła SyncChipa).
 */
function noticesFor(
  booking: BookingRecord,
  outcome: ApprovalOutcome,
  path: readonly ApprovalStep[],
  decisions: readonly ApprovalDecision[],
  refusal: { reason: string | null; decidedBy: string; stepLabel: string },
): NotificationDraft[] {
  const about: NoticeBooking = {
    id: booking.id,
    aircraftId: booking.aircraftId,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    pilotId: booking.pilotId,
  };
  // Rezerwacja bez właściciela nie istnieje (CHECK `booking_flight_fields`), ale typ
  // dopuszcza `null` ze względu na wyłączenia z użytku - a tych ścieżka nie dotyczy.
  const requester = booking.pilotId;
  if (requester == null) return [];

  if (outcome === 'confirmed') return [bookingApproved(about, requester)];
  if (outcome === 'rejected') {
    return [
      bookingRejected(about, requester, {
        // Powód przy odmowie jest WYMAGANY (`refuseDecision`), więc tutaj jest napisem.
        reason: refusal.reason ?? '',
        decidedBy: refusal.decidedBy,
        stepLabel: refusal.stepLabel,
      }),
    ];
  }

  const next = currentStep(path, decisions);
  return next == null ? [] : approvalRequested(about, pendingApprovers(path, decisions), next);
}
