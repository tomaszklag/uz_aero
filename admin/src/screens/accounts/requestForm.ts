/**
 * Ninerdeck - panel: decyzja o zgłoszeniu - szkic i ocena (mockup `piloci-zgloszenie`;
 * issue #101, E3).
 *
 * Moduł CZYSTY (bez Reacta, bez sieci) - decyzje o treści, nie o układzie.
 *
 * ══ DWIE DROGI, DWIE OCENY ══
 * Zatwierdzenie pyta o KOD i ROLĘ (aktywny ⟺ ma kod), odrzucenie o POWÓD - i to jedyne
 * pole wymagane, którego brak nie jest formalnością: pilot czyta ten tekst na swoim
 * telefonie i to jest jedyna wiadomość, jaką dostaje.
 *
 * Granica jest ta sama, co w formularzu konta: sprawdzamy KSZTAŁT wpisu, a reguły (kod
 * zajęty w klubie, zgłoszenie rozstrzygnięte w międzyczasie) zostają na serwerze i wracają
 * odmową z powodem.
 */

import type { MembershipApprovalBody, PilotRole } from '../../api/dto';

/** Który krok szuflady jest na ekranie. `decided` = po decyzji, bez formularza. */
export type RequestStep = 'approve' | 'reject' | 'decided';

export interface RequestDraft {
  code: string;
  role: PilotRole;
  reason: string;
}

/**
 * Kod startuje PUSTY, a nie podpowiedziany z nazwiska.
 *
 * Podpowiedziany wyglądałby jak nadany i wchodziłby do rejestru jednym kliknięciem -
 * a kod jest jedyną rzeczą, którą klub w tej decyzji naprawdę wybiera (stoi potem
 * w sygnaturze każdej operacji tego pilota).
 */
export const EMPTY_REQUEST: RequestDraft = { code: '', role: 'pilot', reason: '' };

/** Kod pilota do WERSALIKOW - dokładnie jak przy koncie i jak robi to serwer. */
export const normalizeCode = (code: string): string => code.trim().toUpperCase();

const CODE_PATTERN = /^[A-Z0-9]+$/;

export interface RequestVerdict {
  /** `true` = wpis nieczytelny, czerwona ramka na polu kodu. */
  invalidCode: boolean;
  /** `false` = brakuje czegoś wymaganego. Bez zdania - brak widać nad przyciskiem. */
  complete: boolean;
  /** Zdanie dla przycisku; `null` także wtedy, gdy pole jest po prostu puste. */
  blocker: string | null;
}

/** Ocena ZATWIERDZENIA: kod jest wymagany, rola ma wartość domyślną. */
export function approveVerdict(draft: RequestDraft): RequestVerdict {
  const code = normalizeCode(draft.code);

  if (code === '') return { invalidCode: false, complete: false, blocker: null };
  if (code.length < 2 || code.length > 10) {
    return { invalidCode: true, complete: true, blocker: 'Kod pilota ma od 2 do 10 znaków.' };
  }
  if (!CODE_PATTERN.test(code)) {
    return { invalidCode: true, complete: true, blocker: 'Kod pilota: tylko litery i cyfry.' };
  }
  return { invalidCode: false, complete: true, blocker: null };
}

/**
 * Ocena ODRZUCENIA: powód od 3 znaków (tyle wymaga serwer).
 *
 * Puste pole blokuje BEZ ZDANIA - widać je nad przyciskiem (reguła issue #55). Wpis
 * za krótki zdanie dostaje: pole nie jest puste, więc sam jego widok nie mówi, czego
 * brakuje.
 */
export function rejectVerdict(draft: RequestDraft): RequestVerdict {
  const reason = draft.reason.trim();

  if (reason === '') return { invalidCode: false, complete: false, blocker: null };
  if (reason.length < 3) {
    return { invalidCode: false, complete: true, blocker: 'Powód: co najmniej 3 znaki.' };
  }
  return { invalidCode: false, complete: true, blocker: null };
}

export function approvalBodyOf(draft: RequestDraft): MembershipApprovalBody {
  return { code: normalizeCode(draft.code), role: draft.role };
}
