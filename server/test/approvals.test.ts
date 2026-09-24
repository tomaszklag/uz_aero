/**
 * Ninerdeck (serwer) - ścieżka akceptacji: czysta domena (#164, `docs/rezerwacje.md` §11).
 *
 * Cztery rzeczy, których złamanie jest wadą MODELU, a nie usterką ekranu:
 *  1. kroki idą PO KOLEI, a pierwsza odmowa kończy sprawę;
 *  2. w kroku wystarczy zgoda JEDNEJ osoby z listy - to pula, nie komplet podpisów;
 *  3. rezerwujący pomija kroki, na których sam stoi;
 *  4. ścieżka jest ŻYWA: dołożenie kroku cofa sprawy w toku, a zapadłe decyzje zostają
 *     przy SWOICH krokach - bo wskazują `id`, nie numer.
 */

import { describe, expect, it } from 'vitest';

import {
  approvalOutcome,
  currentStep,
  missingSelfApprovals,
  pendingApprovers,
  refuseDecision,
  selfApprovedSteps,
  type ApprovalDecision,
  type ApprovalStep,
} from '../src/domain/approvals.ts';

const step = (id: string, position: number, memberIds: string[], label = id): ApprovalStep => ({
  id,
  position,
  label,
  memberIds,
});

const ok = (stepId: string): ApprovalDecision => ({ stepId, decision: 'approved' });
const no = (stepId: string): ApprovalDecision => ({ stepId, decision: 'rejected' });

const MECHANIK = step('s-mech', 1, ['AKO', 'JSE']);
const SZEF = step('s-szef', 2, ['TMK']);
const PATH = [MECHANIK, SZEF];

describe('klub bez ścieżki', () => {
  it('nie klika w nic - rezerwacja jest potwierdzona od razu', () => {
    // Stan domyślny KAŻDEGO nowego klubu: wymóg akceptacji jest decyzją klubu, nie
    // podatkiem nakładanym przez narzędzie (§11.1).
    expect(approvalOutcome([], [])).toBe('confirmed');
    expect(currentStep([], [])).toBeNull();
    expect(pendingApprovers([], [])).toEqual([]);
  });
});

describe('kroki idą po kolei', () => {
  it('pyta najpierw krok o niższej pozycji, niezależnie od kolejności w tablicy', () => {
    expect(currentStep([SZEF, MECHANIK], [])?.id).toBe('s-mech');
  });

  it('remis pozycji rozstrzyga `id` - porządek jest deterministyczny bez unikatu w bazie', () => {
    const a = step('s-a', 1, ['AKO']);
    const b = step('s-b', 1, ['TMK']);
    expect(currentStep([b, a], [])?.id).toBe('s-a');
  });

  it('krok 2 pyta dopiero po zgodzie kroku 1', () => {
    expect(currentStep(PATH, [])?.id).toBe('s-mech');
    expect(currentStep(PATH, [ok('s-mech')])?.id).toBe('s-szef');
    expect(approvalOutcome(PATH, [ok('s-mech')])).toBe('pending');
  });

  it('komplet zgód potwierdza rezerwację', () => {
    expect(approvalOutcome(PATH, [ok('s-mech'), ok('s-szef')])).toBe('confirmed');
    expect(pendingApprovers(PATH, [ok('s-mech'), ok('s-szef')])).toEqual([]);
  });

  it('PIERWSZA ODMOWA KOŃCZY SPRAWĘ - dalszych kroków nikt nie fatyguje', () => {
    expect(approvalOutcome(PATH, [no('s-mech')])).toBe('rejected');
    expect(pendingApprovers(PATH, [no('s-mech')])).toEqual([]);
  });

  it('odmowa na kroku 2 też kończy, choć krok 1 zgodę wydał', () => {
    expect(approvalOutcome(PATH, [ok('s-mech'), no('s-szef')])).toBe('rejected');
  });
});

describe('w kroku wystarczy zgoda JEDNEJ osoby', () => {
  it('lista kroku jest PULĄ uprawnionych, nie kompletem podpisów', () => {
    // Skrajny przypadek („jeden krok, kilka osób, ktokolwiek zatwierdzi") ma być
    // najprostszy z możliwych, a nie najcięższy (§11.2).
    expect(pendingApprovers([MECHANIK], [])).toEqual(['AKO', 'JSE']);
    expect(approvalOutcome([MECHANIK], [ok('s-mech')])).toBe('confirmed');
  });

  it('każda z nich może zdecydować', () => {
    for (const who of ['AKO', 'JSE']) {
      expect(
        refuseDecision([MECHANIK], [], { deciderPilotId: who, decision: 'approved', reason: null, overrides: false }),
      ).toBeNull();
    }
  });
});

describe('rezerwujący pomija własne kroki', () => {
  it('pomija te, na których stoi - i tylko te', () => {
    expect(selfApprovedSteps(PATH, 'AKO').map((s) => s.id)).toEqual(['s-mech']);
    expect(selfApprovedSteps(PATH, 'TMK').map((s) => s.id)).toEqual(['s-szef']);
    expect(selfApprovedSteps(PATH, 'PWI')).toEqual([]);
  });

  it('rezerwujący na liście WSZYSTKICH kroków dostaje potwierdzenie od razu', () => {
    const wszedzie = [step('s-mech', 1, ['AKO']), step('s-szef', 2, ['AKO'])];
    const skipped = selfApprovedSteps(wszedzie, 'AKO').map((s) => ok(s.id));
    expect(approvalOutcome(wszedzie, skipped)).toBe('confirmed');
  });

  it('POMIJANIE DOTYCZY OBECNOŚCI NA LIŚCIE, nie władzy administratora', () => {
    // Inaczej rezerwacje administratora omijałyby ścieżkę, której sam pilnuje. Ta
    // funkcja nie ma nawet czym o władzę zapytać - i to jest cała odpowiedź.
    expect(selfApprovedSteps(PATH, 'admin')).toEqual([]);
  });

  it('krok DOŁOŻONY później z rezerwującym na liście też przechodzi sam (#207)', () => {
    // Ścieżka po zmianie: przed mechanikiem stanął nowy krok, na którym stoi AKO.
    const nowy = step('s-nowy', 0, ['AKO']);
    const after = [nowy, MECHANIK, SZEF];
    // Mechanik już zdecydował (AKO pominął go przy złożeniu) - ten wpis ZOSTAJE.
    expect(missingSelfApprovals(after, [ok('s-mech')], 'AKO').map((s) => s.id)).toEqual(['s-nowy']);
    // Krok rozstrzygnięty odmową też nie dostaje drugiego wpisu.
    expect(missingSelfApprovals(after, [no('s-mech'), ok('s-nowy')], 'AKO')).toEqual([]);
    expect(missingSelfApprovals(after, [], 'PWI')).toEqual([]);
  });
});

describe('kto może zdecydować', () => {
  it('osoba spoza listy kroku bieżącego - odmowa', () => {
    expect(
      refuseDecision(PATH, [], { deciderPilotId: 'PWI', decision: 'approved', reason: null, overrides: false }),
    ).toBe('not_your_step');
  });

  it('osoba z kroku PÓŹNIEJSZEGO jeszcze nie decyduje - kroki idą po kolei', () => {
    expect(
      refuseDecision(PATH, [], { deciderPilotId: 'TMK', decision: 'approved', reason: null, overrides: false }),
    ).toBe('not_your_step');
  });

  it('administrator odblokowuje KAŻDY krok - inaczej jedno odejście z klubu blokuje wszystko', () => {
    expect(
      refuseDecision(PATH, [], { deciderPilotId: 'admin', decision: 'approved', reason: null, overrides: true }),
    ).toBeNull();
  });

  it('rezerwacja ROZSTRZYGNIĘTA nie przyjmuje drugiej decyzji', () => {
    const attempt = { deciderPilotId: 'AKO', decision: 'approved' as const, reason: null, overrides: true };
    expect(refuseDecision(PATH, [no('s-mech')], attempt)).toBe('not_pending');
    expect(refuseDecision(PATH, [ok('s-mech'), ok('s-szef')], attempt)).toBe('not_pending');
    expect(refuseDecision([], [], attempt)).toBe('not_pending');
  });
});

describe('odmowa wymaga powodu, zgoda nie', () => {
  it('odmowa bez powodu odbija się - pilot czyta go na telefonie', () => {
    const base = { deciderPilotId: 'AKO', decision: 'rejected' as const, overrides: false };
    expect(refuseDecision(PATH, [], { ...base, reason: null })).toBe('reason_required');
    expect(refuseDecision(PATH, [], { ...base, reason: '' })).toBe('reason_required');
    expect(refuseDecision(PATH, [], { ...base, reason: 'Maszyna na przeglądzie.' })).toBeNull();
  });

  it('zgoda bez powodu przechodzi', () => {
    expect(
      refuseDecision(PATH, [], { deciderPilotId: 'AKO', decision: 'approved', reason: null, overrides: false }),
    ).toBeNull();
  });

  it('KOLEJNOŚĆ SPRAWDZEŃ: brak prawa głosu wyprzedza brak powodu', () => {
    // Odwrotna mówiłaby człowiekowi bez prawa głosu, że brakuje mu uzasadnienia -
    // czyli podsuwałaby drogę, której i tak nie ma.
    expect(
      refuseDecision(PATH, [], { deciderPilotId: 'PWI', decision: 'rejected', reason: null, overrides: false }),
    ).toBe('not_your_step');
  });
});

describe('ścieżka jest ŻYWA', () => {
  it('DOŁOŻENIE KROKU NA POCZĄTEK cofa sprawę w toku', () => {
    // Cena przyjęta świadomie (§11.2): rezerwacja czekająca na krok 2 wraca do nowego
    // kroku 1, a ekran ma to powiedzieć wprost, zamiast pokazać cofnięty stan bez słowa.
    const decisions = [ok('s-mech')];
    expect(currentStep(PATH, decisions)?.id).toBe('s-szef');

    const nowy = step('s-nowy', 0, ['PWI']);
    expect(currentStep([nowy, ...PATH], decisions)?.id).toBe('s-nowy');
    expect(approvalOutcome([nowy, ...PATH], decisions)).toBe('pending');
  });

  it('ZAPADŁE DECYZJE ZOSTAJĄ PRZY SWOICH KROKACH - wskazują `id`, nie numer', () => {
    // Gdyby decyzja niosła numer, dołożenie kroku w środku przepisałoby cudzy podpis
    // na inny krok. Tu zgoda mechanika zostaje zgodą mechanika, choć jest już trzeci
    // w kolejności.
    const decisions = [ok('s-mech'), ok('s-szef')];
    const przed = step('s-przed', 0, ['PWI']);

    expect(approvalOutcome([przed, ...PATH], decisions)).toBe('pending');
    expect(currentStep([przed, ...PATH], decisions)?.id).toBe('s-przed');
    // …a po zgodzie nowego kroku komplet jest kompletem - stare podpisy nadal liczą się
    // do SWOICH kroków.
    expect(approvalOutcome([przed, ...PATH], [...decisions, ok('s-przed')])).toBe('confirmed');
  });

  it('KROK ZDJĘTY ZE ŚCIEŻKI przestaje być pytany, a jego decyzja zostaje w rejestrze', () => {
    // Wołający podaje wyłącznie kroki żywe (`removed_at IS NULL`), więc zdjęty krok
    // nie ma jak zatrzymać postępu. Decyzja pod nim zapadła zostaje w tabeli -
    // append-only (§11.4) - i po prostu nie liczy się do niczego.
    expect(approvalOutcome([SZEF], [ok('s-mech')])).toBe('pending');
    expect(currentStep([SZEF], [ok('s-mech')])?.id).toBe('s-szef');
  });

  it('krok BEZ ANI JEDNEJ OSOBY zatrzymuje sprawę, ale nie wywraca modelu', () => {
    // Patologia, przed którą stoją dwie zapory (panel nie zapisze takiego kroku,
    // administrator odblokuje ścieżkę). Model ma ją PRZEŻYĆ: rezerwacja czeka.
    const pusty = step('s-pusty', 1, []);
    expect(approvalOutcome([pusty], [])).toBe('pending');
    expect(pendingApprovers([pusty], [])).toEqual([]);
    expect(
      refuseDecision([pusty], [], { deciderPilotId: 'AKO', decision: 'approved', reason: null, overrides: false }),
    ).toBe('not_your_step');
    // …a administrator wyprowadza ją z zakleszczenia.
    expect(
      refuseDecision([pusty], [], { deciderPilotId: 'admin', decision: 'approved', reason: null, overrides: true }),
    ).toBeNull();
  });
});
