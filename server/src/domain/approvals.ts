/**
 * Ninerdeck (serwer) - ŚCIEŻKA AKCEPTACJI REZERWACJI: który krok pyta teraz, kto może
 * na nim zdecydować i co z tego wynika dla stanu rezerwacji.
 *
 * Milestone 3.1.0, epik #164; dokument decyzji `docs/rezerwacje.md` §11.
 *
 * ══ ŚCIEŻKA JEST ZAWSZE BIEŻĄCA ══
 * (decyzja właściciela 2026-09-23)
 *
 * Rezerwacja w toku czyta konfigurację klubu NA ŻYWO, a nie jej kopię z chwili złożenia:
 * poprawka ścieżki obowiązuje natychmiast i wszystkich. Cena jest przyjęta świadomie -
 * **dołożenie kroku COFA sprawy w toku** (rezerwacja czekająca na krok 2 wraca do nowego
 * kroku 1), więc ekran ma to powiedzieć wprost, zamiast pokazać cofnięty stan bez słowa.
 *
 * Z żywej ścieżki wynika kształt tego modułu: funkcje biorą AKTUALNE kroki i ZAPADŁE
 * decyzje, a stan liczą za każdym razem od nowa. Nie ma tu pola „na którym kroku
 * stoimy" - byłoby drugą kopią prawdy, która rozjeżdża się przy pierwszej zmianie
 * ścieżki i nikt tego nie zauważa.
 *
 * ══ DECYZJA WSKAZUJE KROK, NIE JEGO NUMER ══
 * `position` jest zmienna, `id` trwałe. Zgoda zapisana jako „krok 2" opisywałaby po
 * dołożeniu kroku w środku INNY krok niż w chwili kliknięcia - czyli żywa ścieżka po
 * cichu przepisywałaby cudze podpisy. Dlatego wszystko tutaj chodzi po `stepId`.
 *
 * ══ CZEGO TU NIE MA ══
 * **Zapisu i odczytu.** Moduł jest czysty (bez SQL-a, bez zegara): bierze fakty, oddaje
 * rozstrzygnięcie. Powiadomienia, transakcja i audyt należą do warstwy aplikacji.
 *
 * **Zdolności `reservations.approve`.** Jej pilnuje BRAMA, bo to pytanie o powierzchnię
 * („czy ta osoba w ogóle akceptuje"), a nie o ścieżkę („czy to jej krok"). Rozdzielenie
 * jest w §11.2 i jest celowe: lista kroku i zdolność odpowiadają na dwa różne pytania
 * i potrzebne są OBIE.
 */

/** Krok ścieżki - tylko to, czego potrzebuje rozstrzygnięcie. `removedAt` filtruje wołający. */
export interface ApprovalStep {
  id: string;
  position: number;
  /** Nazwa dla człowieka („Mechanik") - niesiona, bo ekran pyta o nią razem ze stanem. */
  label: string;
  /** Kto może zatwierdzić ten krok. Pula uprawnionych, nie komplet podpisów. */
  memberIds: readonly string[];
}

/** Zapadła decyzja - append-only wiersz `booking_approvals`. */
export interface ApprovalDecision {
  stepId: string;
  decision: 'approved' | 'rejected';
}

/**
 * Stan rezerwacji wynikający ze ścieżki.
 *
 * `rejected` wygrywa z wszystkim: pierwsza odmowa kończy sprawę (§11.3), więc nie ma
 * znaczenia, ile kroków zostało za nią - nikt dalszy nie jest fatygowany.
 */
export type ApprovalOutcome = 'pending' | 'confirmed' | 'rejected';

/**
 * Kroki W KOLEJNOŚCI PYTANIA. Remis `position` rozstrzyga `id`, więc porządek jest
 * deterministyczny bez unikatu w bazie - a unikatu świadomie nie ma, bo przestawianie
 * kolejności rodziłoby przejściowe kolizje (§3.4).
 */
export function orderedSteps(steps: readonly ApprovalStep[]): ApprovalStep[] {
  return [...steps].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * KROK BIEŻĄCY - pierwszy po kolejności bez decyzji; `null` = nie ma o co pytać.
 *
 * Decyzja pod krokiem ZDJĘTYM ze ścieżki nie liczy się do postępu i nie ma jak: takiego
 * kroku nie ma na liście wejściowej. Zostaje natomiast w rejestrze i w historii, bo
 * `booking_approvals` jest append-only (§11.4).
 */
export function currentStep(
  steps: readonly ApprovalStep[],
  decisions: readonly ApprovalDecision[],
): ApprovalStep | null {
  const decided = new Set(decisions.map((d) => d.stepId));
  return orderedSteps(steps).find((step) => !decided.has(step.id)) ?? null;
}

/**
 * Stan po zapadłych decyzjach.
 *
 * Klub BEZ ŚCIEŻKI (pusta lista kroków) dostaje `confirmed` i to jest stan domyślny
 * każdego nowego klubu: wymóg akceptacji jest decyzją klubu, nie podatkiem nakładanym
 * przez narzędzie (§11.1).
 */
export function approvalOutcome(
  steps: readonly ApprovalStep[],
  decisions: readonly ApprovalDecision[],
): ApprovalOutcome {
  if (decisions.some((d) => d.decision === 'rejected')) return 'rejected';
  return currentStep(steps, decisions) == null ? 'confirmed' : 'pending';
}

/**
 * Kroki, które REZERWUJĄCY POMIJA - te, na których liście sam stoi.
 *
 * Nikt nie prosi człowieka o zgodę na własny plan. Pominięcie zapisuje się jako DECYZJA
 * z adnotacją `via = self`, a nie jako brak wpisu: po miesiącu krok pominięty musi być
 * odróżnialny od kroku, o który nikt nie zapytał (§11.2).
 *
 * Liczy się WYŁĄCZNIE obecność na liście, nie władza administratora - inaczej rezerwacje
 * administratora omijałyby ścieżkę, której sam pilnuje. Administrator może zdecydować za
 * każdy krok, ale to jest jawny akt zapisany w historii, a nie ciche ominięcie.
 */
export function selfApprovedSteps(
  steps: readonly ApprovalStep[],
  requesterPilotId: string,
): ApprovalStep[] {
  return orderedSteps(steps).filter((step) => step.memberIds.includes(requesterPilotId));
}

/** Powód, dla którego decyzja nie może zapaść. Kody SUROWE - nazywa je panel i aplikacja. */
/**
 * Kroki, na których stoi rezerwujący, a pod którymi nie ma jeszcze ŻADNEJ decyzji -
 * pominięcia `self` do DOPISANIA po zmianie ścieżki (issue #207). Przy złożeniu
 * rezerwacji pominięcia liczy `selfApprovedSteps`; krok dołożony później, z rezerwującym
 * na liście, pytałby go o zgodę na własny plan - wbrew §11.2. Krok już rozstrzygnięty
 * (także odmową) zostaje przy swojej decyzji: rejestr jest append-only.
 */
export function missingSelfApprovals(
  steps: readonly ApprovalStep[],
  decisions: readonly ApprovalDecision[],
  requesterPilotId: string,
): ApprovalStep[] {
  const decided = new Set(decisions.map((d) => d.stepId));
  return selfApprovedSteps(steps, requesterPilotId).filter((step) => !decided.has(step.id));
}

export type ApprovalRefusal =
  /** Rezerwacja nie czeka na niczyją zgodę (już rozstrzygnięta albo klub bez ścieżki). */
  | 'not_pending'
  /** Ta osoba nie stoi na liście kroku BIEŻĄCEGO - czyjś inny krok albo krok późniejszy. */
  | 'not_your_step'
  /** Odmowa bez powodu (§11.3) - pilot czyta go na telefonie. */
  | 'reason_required';

/** Co decydujący próbuje zrobić. */
export interface DecisionAttempt {
  deciderPilotId: string;
  decision: 'approved' | 'rejected';
  /** Po przycięciu białych znaków; pusty napis znaczy „nie podano". */
  reason: string | null;
  /**
   * Czy decydujący ma władzę administratora nad cudzym planem (`reservations.manage`).
   * Odblokowuje KAŻDY krok - bez tego wystarczyłoby jedno odejście z klubu, żeby
   * rezerwacje utknęły na zawsze (§11.2).
   */
  overrides: boolean;
}

/**
 * Czy ta decyzja może zapaść - odmowa albo `null`.
 *
 * Kolejność sprawdzeń jest kolejnością POWAGI: najpierw „nie ma o czym decydować",
 * potem „nie Twój krok", na końcu brak powodu. Odwrotna mówiłaby człowiekowi bez prawa
 * głosu, że brakuje mu uzasadnienia.
 */
export function refuseDecision(
  steps: readonly ApprovalStep[],
  decisions: readonly ApprovalDecision[],
  attempt: DecisionAttempt,
): ApprovalRefusal | null {
  const step = currentStep(steps, decisions);
  if (step == null || approvalOutcome(steps, decisions) !== 'pending') return 'not_pending';
  if (!attempt.overrides && !step.memberIds.includes(attempt.deciderPilotId)) return 'not_your_step';
  if (attempt.decision === 'rejected' && (attempt.reason ?? '') === '') return 'reason_required';
  return null;
}

/**
 * Kto ma dostać prośbę o zgodę PO tej zmianie - lista osób kroku bieżącego.
 *
 * Pusta, gdy nie ma o co pytać (rezerwacja rozstrzygnięta) - a także wtedy, gdy krok
 * bieżący nie ma ani jednej osoby. Ten drugi przypadek jest patologią, przed którą stoją
 * dwie zapory (panel nie zapisze takiego kroku, administrator odblokuje ścieżkę), ale
 * model ma go PRZEŻYĆ bez wyjątku: rezerwacja zatrzyma się i poczeka na człowieka.
 */
export function pendingApprovers(
  steps: readonly ApprovalStep[],
  decisions: readonly ApprovalDecision[],
): string[] {
  const step = currentStep(steps, decisions);
  if (step == null || approvalOutcome(steps, decisions) !== 'pending') return [];
  return [...step.memberIds];
}
