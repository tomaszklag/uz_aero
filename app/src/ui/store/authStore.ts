/**
 * UZ Aero — stan uwierzytelnienia w UI (cienka warstwa nad `AuthService`, §3.0).
 *
 * `status` steruje bramką nawigacji:
 *  • `loading`    — czytamy magazyn poświadczeń (moment startu);
 *  • `signed_out` — brak profilu → ekran 00-login (jedyna czynność wymagająca sieci);
 *  • `signed_in`  — profil jest; wygasłe tokeny NIE zmieniają tego stanu (§3.0 —
 *                   aplikacja nigdy sama nie wyrzuca pilota do logowania).
 *
 * Store nie zna HTTP ani SecureStore — dostaje `AuthService` przez `attach` z composition
 * root, jak store sesji dostaje komendy.
 */

import { create } from 'zustand';

import type { AuthService } from '../../application/auth/authService';
import { ServerRejectedError, ServerUnreachableError } from '../../application/ports';
import { useCurrentPilot } from './currentPilot';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

interface AuthStore {
  status: AuthStatus;
  pilot: { id: string; code: string; name: string } | null;
  /** Błąd ostatniej próby logowania — po polsku, do pokazania na 00-login. */
  loginError: string | null;
  busy: boolean;

  attach(service: AuthService): void;
  /** Odczyt magazynu przy starcie — ustala bramkę. */
  restore(): Promise<void>;
  login(login: string, password: string): Promise<boolean>;
}

let service: AuthService | null = null;
const requireService = (): AuthService => {
  if (!service) throw new Error('AuthStore: attach() nie został wywołany.');
  return service;
};

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'loading',
  pilot: null,
  loginError: null,
  busy: false,

  attach(s) {
    service = s;
  },

  async restore() {
    try {
      const stored = await requireService().profile();
      if (stored != null) {
        // Tożsamość z provisioning zasila cały UI — nigdzie nie pytamy o kod pilota.
        useCurrentPilot.setState({ id: stored.pilot.id });
        set({ status: 'signed_in', pilot: stored.pilot });
      } else {
        set({ status: 'signed_out' });
      }
    } catch {
      // Magazyn niedostępny (np. dev client sprzed przebudowy) — droga przez login,
      // z pustym błędem; sam login pokaże, co poszło nie tak.
      set({ status: 'signed_out' });
    }
  },

  async login(login, password) {
    set({ busy: true, loginError: null });
    try {
      const stored = await requireService().login(login, password);
      useCurrentPilot.setState({ id: stored.pilot.id });
      set({ status: 'signed_in', pilot: stored.pilot, busy: false });
      return true;
    } catch (error) {
      set({ busy: false, loginError: loginErrorMessage(error) });
      return false;
    }
  },
}));

/** Komunikaty po polsku — 00-login pokazuje POWÓD, nie kod błędu (§6 pkt 3). */
function loginErrorMessage(error: unknown): string {
  if (error instanceof ServerUnreachableError) {
    return 'Brak połączenia z serwerem. Pierwsze logowanie wymaga internetu — zaloguj się przed wylotem w teren.';
  }
  if (error instanceof ServerRejectedError) {
    if (error.code === 'account_disabled') return 'Konto jest wyłączone — skontaktuj się z administratorem.';
    if (error.status === 401) return 'Błędny login albo hasło.';
    return `Serwer odrzucił logowanie (${error.code}).`;
  }
  return 'Nie udało się zalogować — spróbuj ponownie.';
}
