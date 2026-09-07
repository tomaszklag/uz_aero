/**
 * UZ Aero - panel 2.0: formularz ZATWIERDZENIA zgłoszenia - szkic, propozycja kodu,
 * ocena i ciało do wysłania.
 *
 * Moduł CZYSTY (bez Reacta, bez sieci), bo to są decyzje o treści, a nie o układzie -
 * i dlatego ma test obok. Ta sama granica, co w `accountForm.ts`: sprawdzamy KSZTAŁT
 * wpisu (to, co serwer odbiłby jako `400`), a reguły (kod zajęty, zgłoszenie już
 * rozstrzygnięte) zostają po stronie serwera i wracają odmową z powodem.
 */

import type { PilotRole, RegistrationDto } from '../../api/dto';
import type { ApproveRegistrationBody } from '../../api/registrations';
import { normalizeCode } from './accountForm';

export interface RegistrationDraft {
  code: string;
  name: string;
  role: PilotRole;
}

/**
 * Propozycja kodu pilota z imienia i nazwiska - PODPOWIEDŹ, nie decyzja.
 *
 * Inicjały wszystkich członów (z „Jan Kowalski-Nowak" wychodzi `JKN`), ogonki
 * sprowadzone do ASCII, bo kod stoi w arkuszu klubu i w sygnaturze operacji, a tam
 * jest zawsze łaciński. Pusty wpis daje pusty kod - formularz nie wysyła niczego,
 * czego administrator nie potwierdził. To on jest właścicielem słownika kodów.
 */
export function proposeCode(name: string): string {
  const initials = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .split(/[\s-]+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ''))
    .filter((part) => part !== '')
    .map((part) => part[0]!)
    .join('');
  return normalizeCode(initials).slice(0, 4);
}

/** Zgłoszenie -> szkic: imię z Google jako punkt wyjścia, kod z inicjałów, rola pilota. */
export function registrationDraftOf(registration: RegistrationDto): RegistrationDraft {
  return { code: proposeCode(registration.name), name: registration.name, role: 'pilot' };
}

export type RegistrationField = 'code' | 'name';

export interface RegistrationVerdict {
  /** Pola z czerwoną ramką. Puste = formularz gotowy do wysłania. */
  invalid: RegistrationField[];
  complete: boolean;
}

/**
 * Ocena szkicu. Puste pole wymagane NIE dostaje zdania (issue #55: blokadę widać
 * z pola nad przyciskiem); czerwoną ramkę dostaje kod, który po normalizacji nie jest
 * kodem (za długi albo z czymś poza literami i cyframi).
 */
export function registrationVerdictOf(draft: RegistrationDraft): RegistrationVerdict {
  const invalid: RegistrationField[] = [];
  const code = normalizeCode(draft.code);
  if (code !== '' && !/^[A-Z0-9]{1,12}$/.test(code)) invalid.push('code');
  const complete = code !== '' && draft.name.trim() !== '' && invalid.length === 0;
  return { invalid, complete };
}

export function approveBodyOf(draft: RegistrationDraft): ApproveRegistrationBody {
  return { code: normalizeCode(draft.code), name: draft.name.trim(), role: draft.role };
}
