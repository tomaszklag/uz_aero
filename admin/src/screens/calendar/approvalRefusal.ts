/**
 * Ninerdeck - panel: ODMOWY ścieżki akceptacji jako zdania dla człowieka (issue #165).
 *
 * Czwarty taki plik po `accountRefusal.ts`, `aircraftRefusal.ts` i `bookingRefusal.ts`
 * i z tego samego powodu: `apiMessage.ts` oddaje surowy kod, a nazwanie go po polsku
 * należy do EKRANU. Dwa rodzaje odmów, dwa kształty odpowiedzi:
 *  - decyzja: `{ error }` z kodem `ApprovalRefusalDto` (albo `booking_closed`);
 *  - zapis ścieżki: `{ error, stepLabel }` - odmowa niesie NAZWĘ kroku, nie numer, bo
 *    ekran pokazuje listę, w której numer i tak nie stoi.
 */

import type { ApprovalRefusalDto, ApprovalStepsRefusalDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import { errorMessage } from '../common/apiMessage';

const DECISION: Readonly<Record<ApprovalRefusalDto | 'booking_closed', string>> = {
  not_pending: 'Ta rezerwacja nie czeka już na decyzję - ktoś ją rozstrzygnął albo odwołał.',
  not_your_step: 'To nie jest Twój krok - decyzję ma osoba z listy kroku bieżącego.',
  reason_required: 'Podaj powód - pilot przeczyta go w telefonie.',
  booking_closed: 'Ktoś rozstrzygnął tę rezerwację przed chwilą. Odśwież kalendarz.',
};

const STEPS: Readonly<Record<ApprovalStepsRefusalDto, (label: string) => string>> = {
  step_without_members: (label) => `Krok „${label}" nie ma ani jednej osoby - wskaż kogoś, kto go zatwierdzi.`,
  member_not_in_org: (label) => `Ktoś z kroku „${label}" nie jest już aktywnym członkiem klubu.`,
};

const errorCode = (error: unknown): string | null => {
  if (!isHttpError(error)) return null;
  const kod = (error.body as { error?: unknown }).error;
  return typeof kod === 'string' ? kod : null;
};

/** Zdanie pod przyciskiem decyzji. */
export function decisionErrorMessage(error: unknown): string {
  const kod = errorCode(error);
  return kod != null && kod in DECISION ? DECISION[kod as keyof typeof DECISION] : errorMessage(error);
}

/** Zdanie pod przyciskiem zapisu ścieżki. */
export function stepsErrorMessage(error: unknown): string {
  const kod = errorCode(error);
  if (kod == null || !(kod in STEPS)) return errorMessage(error);
  const label = isHttpError(error) ? (error.body as { stepLabel?: unknown }).stepLabel : null;
  return STEPS[kod as ApprovalStepsRefusalDto](typeof label === 'string' ? label : '');
}
