/**
 * Ninerdeck - STANY KARTY REZERWACJI wobec ścieżki akceptacji (`design/23b`, `23c`,
 * `23d`, `23e`, `20e`; 3.1.0, epik R-I; `docs/rezerwacje.md` §9.4).
 *
 * ══ UKŁAD ZOSTAJE, ZMIENIA SIĘ TON ══
 * Miejsce na plakietkę stanu przewidziano już w 3.0.0. Zieleń znaczy „w normie" i niesie
 * akcję główną, więc na karcie rezerwacji obiecuje, że lot jest pewny: rezerwacja
 * czekająca idzie w ton OSTRZEŻENIA (nie w wygaszenie - zajmuje maszynę), a zamknięta
 * (odrzucona, wygasła) wraca do tonu neutralnego, bo czerwień niesie baner.
 *
 * ══ ŚCIEŻKA MÓWI, ILE KROKÓW ZOSTAŁO I KTO JE TRZYMA ══
 * Nazwisk decydujących NIE MA: krok bywa obsadzony przez kilka osób i rozstrzyga pierwsza.
 * Krok zapisuje się nazwą, a chwila decyzji - wiekiem („19 h temu"), bo telefon nie ma
 * doby klubu dla chwili decyzji, tylko dla terminu.
 *
 * ══ DOSZEDŁ KROK (23E) POZNAJE SIĘ PO KSZTAŁCIE ŚCIEŻKI ══
 * Serwer nie mówi „dołożono krok" - ale zapadła decyzja stojąca ZA krokiem bieżącym
 * nie ma innego wytłumaczenia: ścieżka jest żywa, a nowy krok wszedł przed zgodę,
 * którą pilot już miał. Zgoda zostaje, bo dotyczyła tego samego terminu.
 */

import type { RemoteApproval } from '../../../application';

import { agoLabel } from './inbox';
import type { ClubDayBounds } from './clubClock';

export type ApprovalState =
  /** Klub bez ścieżki albo serwer sprzed 3.1.0 - karta jak w 3.0.0. */
  | 'none'
  | 'waiting'
  | 'stepAdded'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  /** Odwołana, zwolniona, zrealizowana - ścieżka jest już tylko zapisem. */
  | 'closed';

export interface PathStepVm {
  id: string;
  label: string;
  /** Znacznik kroku: zgoda, krok bieżący, odmowa, jeszcze nie pytany. */
  mark: 'ok' | 'now' | 'no' | 'idle';
  /** „19 h temu", „czeka od 3 h temu", „przeszedł sam", „nie zaczął", „nie zdecydował". */
  when: string;
}

export interface ApprovalBanner {
  tone: 'amber' | 'red';
  title: string;
  text: string;
}

export interface ApprovalVm {
  state: ApprovalState;
  banner: ApprovalBanner | null;
  steps: PathStepVm[];
  /** Plakietka stanu w nagłówku terminu: „Czeka na zgodę", „Odrzucona", „Wygasła"… */
  badge: string;
  badgeTone: 'green' | 'amber' | 'red' | 'dim';
  /** Ton karty terminu i karty na Pulpicie: zieleń = pewny, bursztyn = czeka, wygaszony = zamknięta. */
  heroTone: 'green' | 'amber' | 'off';
  /** „krok 1 z 2" przy sprawie w toku; `null` poza nią. */
  stepOfN: string | null;
}

export interface ApprovalInput {
  approval: RemoteApproval | null | undefined;
  /** Stan wiersza rezerwacji - to on rozstrzyga między „czeka" a „wygasła". */
  status: string;
  now: number;
  /** Chwila złożenia - od niej czeka krok pierwszy; `null` = nieznana. */
  createdAt: number | null;
  day: ClubDayBounds;
}

const BADGE: Readonly<Record<string, { label: string; tone: ApprovalVm['badgeTone'] }>> = {
  confirmed: { label: 'Potwierdzona', tone: 'green' },
  pending: { label: 'Czeka na zgodę', tone: 'amber' },
  rejected: { label: 'Odrzucona', tone: 'red' },
  expired: { label: 'Wygasła', tone: 'dim' },
  cancelled: { label: 'Odwołana', tone: 'dim' },
  released: { label: 'Slot zwolniony', tone: 'dim' },
  fulfilled: { label: 'Zrealizowana', tone: 'dim' },
};

export function approvalView(input: ApprovalInput): ApprovalVm {
  // Stan nieznany temu wydaniu jedzie SUROWY jako plakietka, a ton neutralny - nowszy
  // serwer dokłada stany, a „nieznany" mówiłby pilotowi mniej niż kod.
  const badge = BADGE[input.status] ?? { label: input.status, tone: 'dim' as const };
  const steps = input.approval?.steps ?? [];

  if (steps.length === 0) {
    return {
      state: 'none',
      banner: null,
      steps: [],
      badge: badge.label,
      badgeTone: badge.tone,
      heroTone: input.status === 'confirmed' ? 'green' : input.status === 'pending' ? 'amber' : 'off',
      stepOfN: null,
    };
  }

  const currentAt = steps.findIndex((s) => s.current);
  const decidedAfterCurrent = currentAt >= 0 && steps.slice(currentAt + 1).some((s) => s.decision != null);
  const rejectedAt = steps.findIndex((s) => s.decision?.decision === 'rejected');

  const state: ApprovalState =
    input.status === 'pending'
      ? decidedAfterCurrent
        ? 'stepAdded'
        : 'waiting'
      : input.status === 'rejected'
        ? 'rejected'
        : input.status === 'expired'
          ? 'expired'
          : input.status === 'confirmed'
            ? 'confirmed'
            : 'closed';

  // Od kiedy czeka krok bieżący: od ostatniej zgody przed nim, a bez niej - od złożenia.
  const lastDecisionAt = steps
    .slice(0, Math.max(currentAt, 0))
    .map((s) => (s.decision == null ? null : Date.parse(s.decision.decidedAt)))
    .filter((t): t is number => t != null && Number.isFinite(t))
    .reduce<number | null>((max, t) => (max == null || t > max ? t : max), null);
  const waitingSince = lastDecisionAt ?? input.createdAt;

  const rows: PathStepVm[] = steps.map((s, i) => {
    if (s.decision != null) {
      if (s.decision.via === 'self') return { id: s.id, label: s.label, mark: 'ok', when: 'przeszedł sam' };
      const at = Date.parse(s.decision.decidedAt);
      const when = Number.isFinite(at) ? agoLabel(at, input.now) : '';
      return { id: s.id, label: s.label, mark: s.decision.decision === 'approved' ? 'ok' : 'no', when };
    }
    if (state === 'waiting' || state === 'stepAdded') {
      if (i === currentAt) {
        return {
          id: s.id,
          label: s.label,
          mark: 'now',
          when: waitingSince == null ? 'czeka' : `czeka od ${agoLabel(waitingSince, input.now)}`,
        };
      }
      return { id: s.id, label: s.label, mark: 'idle', when: 'nie zaczął' };
    }
    // Sprawa zamknięta bez decyzji na tym kroku: pierwszy niezdecydowany „nie zdecydował"
    // (23D - to na nim termin minął), dalsze „nie zaczął". Po odmowie każdy dalszy
    // „nie zaczął": nikt dalszy nie był fatygowany.
    const firstUndecided = steps.findIndex((x) => x.decision == null);
    const missed = state === 'expired' && i === firstUndecided;
    return { id: s.id, label: s.label, mark: 'idle', when: missed ? 'nie zdecydował' : 'nie zaczął' };
  });

  const current = currentAt >= 0 ? steps[currentAt] : null;
  const stepOfN =
    (state === 'waiting' || state === 'stepAdded') && current != null
      ? `krok ${currentAt + 1} z ${steps.length}`
      : null;

  return {
    state,
    banner: banner(state, steps, currentAt, rejectedAt, stepOfN),
    steps: rows,
    badge: badge.label,
    badgeTone: badge.tone,
    heroTone:
      state === 'waiting' || state === 'stepAdded' ? 'amber' : state === 'confirmed' ? 'green' : 'off',
    stepOfN,
  };
}

function banner(
  state: ApprovalState,
  steps: RemoteApproval['steps'],
  currentAt: number,
  rejectedAt: number,
  stepOfN: string | null,
): ApprovalBanner | null {
  switch (state) {
    case 'waiting':
      return {
        tone: 'amber',
        title: stepOfN == null ? 'Czeka na zgodę' : `Czeka na zgodę · ${stepOfN}`,
        text: 'Termin jest już Twój - rezerwacja trzyma go od złożenia. Jeśli nikt nie zdecyduje do jego początku, wygaśnie i slot wróci do puli.',
      };
    case 'stepAdded':
      return {
        tone: 'amber',
        title: 'Doszedł krok akceptacji',
        text: `Klub dopisał do ścieżki krok „${steps[currentAt]?.label ?? ''}", więc rezerwacja czeka dalej. Zgoda, którą już masz, zostaje - dotyczyła tego samego terminu.`,
      };
    case 'rejected': {
      const step = rejectedAt >= 0 ? steps[rejectedAt] : null;
      return {
        tone: 'red',
        title: step == null ? 'Odmowa zgody' : `Odmowa zgody · krok „${step.label}"`,
        // Powód jest przy odmowie wymagany (§11.3), więc pusty zdarza się wyłącznie przy
        // rejestrze złamanym - i wtedy mówimy to, a nie zmyślamy zdania.
        text: step?.decision?.reason ?? 'Decydujący nie podał powodu.',
      };
    }
    case 'expired':
      return {
        tone: 'amber',
        title: 'Termin minął, zanim ktokolwiek zdecydował',
        text: 'Rezerwacja bez decyzji wygasa z początkiem swojego terminu i oddaje slot - milczenie nie znaczy zgody. Jeśli nadal chcesz lecieć, złóż ją jeszcze raz.',
      };
    default:
      return null;
  }
}

const DAY_MS = 86_400_000;

/**
 * „termin dziś" / „termin jutro" / „termin za 3 dni" / „termin minął" - na dobach KLUBU:
 * dzisiaj jest wtedy, gdy „teraz" leży w dobie terminu, a odległość liczy się od jej
 * początku. Bez konwersji stref, jak reszta kalendarza (§6.1).
 */
export function termIn(day: ClubDayBounds, now: number): string {
  if (now >= day.startsAt && now < day.endsAt) return 'termin dziś';
  if (now >= day.endsAt) return 'termin minął';
  const days = Math.ceil((day.startsAt - now) / DAY_MS);
  if (days <= 1) return 'termin jutro';
  return `termin za ${days} dni`;
}
