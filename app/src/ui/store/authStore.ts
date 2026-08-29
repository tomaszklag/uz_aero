/**
 * UZ Aero - stan uwierzytelnienia w UI (cienka warstwa nad `AuthService`, §3.0).
 *
 * `status` steruje bramką nawigacji:
 *  • `loading`    - czytamy magazyn poświadczeń (moment startu);
 *  • `signed_out` - brak profilu → ekran 00a-login (jedyna czynność wymagająca sieci);
 *  • `pin_setup`  - profil jest, PIN-u nie ma (świeży provisioning albo profil sprzed
 *                   tej funkcji) → krok „Ustaw PIN";
 *  • `locked`     - profil i PIN są → codzienne odblokowanie (00, w 100% offline);
 *  • `signed_in`  - odblokowane; wygasłe tokeny NIE zmieniają tego stanu (§3.0 -
 *                   aplikacja nigdy sama nie wyrzuca pilota do logowania).
 *
 * Store nie zna HTTP, SecureStore ani krypto - dostaje `AuthService` przez `attach`
 * z composition root, jak store sesji dostaje komendy.
 */

import { create } from 'zustand';

import type { AuthService } from '../../application/auth/authService';
import { ServerRejectedError, ServerUnreachableError } from '../../application/ports';
import { useCurrentPilot } from './currentPilot';

export type AuthStatus = 'loading' | 'signed_out' | 'pin_setup' | 'locked' | 'signed_in';

interface AuthStore {
  status: AuthStatus;
  pilot: { id: string; code: string; name: string } | null;
  /** Błąd ostatniej próby logowania - po polsku, do pokazania na 00a-login. */
  loginError: string | null;
  busy: boolean;

  attach(service: AuthService): void;
  /** Odczyt magazynu przy starcie - ustala bramkę. */
  restore(): Promise<void>;
  login(login: string, password: string): Promise<boolean>;
  /** Krok „Ustaw PIN" po logowaniu - po zapisie wpuszcza do aplikacji. */
  setPin(pin: string): Promise<void>;
  /** Codzienne odblokowanie (offline). `false` = zły PIN - ekran pokazuje odmowę. */
  unlock(pin: string): Promise<boolean>;
  /**
   * „Nie pamiętam PIN" → pełne ponowne logowanie. Poświadczeń NIE czyścimy -
   * nadpisze je dopiero UDANY login (§3.0: zabicie aplikacji w połowie drogi
   * wraca do zamka, nie do pustego telefonu). Ochronę outboxa egzekwuje ekran.
   */
  requestRelogin(): void;
  /** Sama weryfikacja PIN-u (krok 1 arkusza zmiany na 13) - bez żadnego zapisu. */
  verifyPin(pin: string): Promise<boolean>;
  /** Zmiana PIN-u (ekran 13): obecny → nowy. `false` = obecny PIN błędny. Offline. */
  changePin(current: string, next: string): Promise<boolean>;
  /**
   * Wylogowanie z ekranu 13 (§3.0): dozwolone TYLKO przy pustym outboxie - zwraca
   * powód blokady albo null po wyczyszczeniu poświadczeń (bramka → 00a-login).
   */
  logout(outboxCount: number): Promise<'outbox_not_empty' | null>;
}

let service: AuthService | null = null;
const requireService = (): AuthService => {
  if (!service) throw new Error('AuthStore: attach() nie został wywołany.');
  return service;
};

/** Bramka dla istniejącego profilu: bez PIN-u → konfiguracja, z PIN-em → zamek. */
const gateFor = (pin: unknown): AuthStatus => (pin == null ? 'pin_setup' : 'locked');

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
        // Tożsamość z provisioning zasila cały UI - nigdzie nie pytamy o kod pilota.
        useCurrentPilot.setState({ id: stored.pilot.id });
        set({ status: gateFor(stored.pin), pilot: stored.pilot });
      } else {
        set({ status: 'signed_out' });
      }
    } catch {
      // Magazyn niedostępny (np. dev client sprzed przebudowy) - droga przez login,
      // z pustym błędem; sam login pokaże, co poszło nie tak.
      set({ status: 'signed_out' });
    }
  },

  async login(login, password) {
    set({ busy: true, loginError: null });
    try {
      const stored = await requireService().login(login, password);
      useCurrentPilot.setState({ id: stored.pilot.id });
      // Świeży provisioning nigdy nie ma PIN-u → zawsze przez „Ustaw PIN".
      set({ status: gateFor(stored.pin), pilot: stored.pilot, busy: false });
      return true;
    } catch (error) {
      set({ busy: false, loginError: loginErrorMessage(error) });
      return false;
    }
  },

  async setPin(pin) {
    await requireService().setPin(pin);
    set({ status: 'signed_in' });
  },

  async unlock(pin) {
    const ok = await requireService().verifyPin(pin);
    if (ok) set({ status: 'signed_in' });
    return ok;
  },

  requestRelogin() {
    set({ status: 'signed_out', loginError: null });
  },

  verifyPin(pin) {
    return requireService().verifyPin(pin);
  },

  async changePin(current, next) {
    if (!(await requireService().verifyPin(current))) return false;
    await requireService().setPin(next);
    return true;
  },

  async logout(outboxCount) {
    const block = await requireService().logout(outboxCount);
    if (block == null) set({ status: 'signed_out', pilot: null, loginError: null });
    return block;
  },
}));

/** Komunikaty po polsku - 00-login pokazuje POWÓD, nie kod błędu (§6 pkt 3). */
function loginErrorMessage(error: unknown): string {
  if (error instanceof ServerUnreachableError) {
    return 'Brak połączenia z serwerem. Pierwsze logowanie wymaga internetu - zaloguj się przed wylotem w teren.';
  }
  if (error instanceof ServerRejectedError) {
    if (error.code === 'account_disabled') return 'Konto jest wyłączone - skontaktuj się z administratorem.';
    if (error.status === 401) return 'Błędny login albo hasło.';
    return `Serwer odrzucił logowanie (${error.code}).`;
  }
  return 'Nie udało się zalogować - spróbuj ponownie.';
}
