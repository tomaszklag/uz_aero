/**
 * UZ Aero - stan uwierzytelnienia w UI (cienka warstwa nad `AuthService`, §3.0).
 *
 * `status` steruje bramką nawigacji:
 *  • `loading`          - czytamy magazyn poświadczeń (moment startu);
 *  • `signed_out`       - brak profilu → ekran 00a-login (jedyna czynność wymagająca sieci);
 *  • `pending_approval` - konto Google potwierdzone, ale konta pilota jeszcze nie ma:
 *                         zgłoszenie czeka na administratora albo zostało odrzucone
 *                         (ekrany 00c/00d; treść w `registration`);
 *  • `pin_setup`        - profil jest, PIN-u nie ma (świeży provisioning albo profil
 *                         sprzed tej funkcji) → krok „Ustaw PIN";
 *  • `locked`           - profil i PIN są → codzienne odblokowanie (00, w 100% offline);
 *  • `signed_in`        - odblokowane; wygasłe tokeny NIE zmieniają tego stanu (§3.0 -
 *                         aplikacja nigdy sama nie wyrzuca pilota do logowania).
 *
 * Store nie zna HTTP, SecureStore ani krypto - dostaje `AuthService` przez `attach`
 * z composition root, jak store sesji dostaje komendy. Nie zna też Google: token
 * tożsamości przynosi mu hook ekranu logowania, a co z nim zrobić, mówi serwer.
 */

import { create } from 'zustand';

import type { AuthService } from '../../application/auth/authService';
import type { RemoteRegistration, StoredCredentials } from '../../application/ports';
import { loginMessage } from '../screens/logic/loginMessage';
import { useCurrentPilot } from './currentPilot';

export type AuthStatus =
  | 'loading'
  | 'signed_out'
  | 'pending_approval'
  | 'pin_setup'
  | 'locked'
  | 'signed_in';

interface AuthStore {
  status: AuthStatus;
  pilot: { id: string; code: string; name: string } | null;
  /** Zgłoszenie rejestracyjne - treść ekranów 00c/00d; `null` poza `pending_approval`. */
  registration: RemoteRegistration | null;
  /** Błąd ostatniej próby logowania - po polsku, do pokazania na 00a-login. */
  loginError: string | null;
  /**
   * Zdanie o ostatnim sprawdzeniu zgłoszenia (brak sieci, odmowa) - pod przyciskiem
   * „SPRAWDŹ PONOWNIE" na 00c. `null` = sprawdzenie przeszło albo nikt nie pytał.
   */
  registrationNote: string | null;
  busy: boolean;

  attach(service: AuthService): void;
  /** Odczyt magazynu przy starcie - ustala bramkę. */
  restore(): Promise<void>;
  /** Logowanie tokenem Google - wynik przełącza bramkę (profil / zgłoszenie / błąd). */
  loginWithGoogle(idToken: string): Promise<void>;
  /**
   * Niepowodzenie PRZED serwerem (okno Google zamknięte, brak konfiguracji) - ten sam
   * baner, co odmowa serwera; anulowanie przez pilota czyści baner zamiast go stawiać.
   */
  reportLoginFailure(error: unknown): void;
  /** „SPRAWDŹ PONOWNIE" i pętla ekranu 00c - pyta serwer o stan zgłoszenia. */
  checkRegistration(): Promise<void>;
  /** „Zaloguj innym kontem" - porzuca zgłoszenie na tym telefonie, wraca na 00a. */
  abandonRegistration(): Promise<void>;
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

/** Zgłoszenie zniknęło u serwera - jedno zdanie na 00a, bo ekran 00c nie ma już o czym mówić. */
const REGISTRATION_GONE = 'Zgłoszenie wygasło albo zostało usunięte - zaloguj się jeszcze raz.';

export const useAuthStore = create<AuthStore>((set) => {
  /** Tożsamość z provisioning zasila cały UI - nigdzie nie pytamy o kod pilota. */
  const enter = (stored: StoredCredentials): void => {
    useCurrentPilot.setState({ id: stored.pilot.id });
    // Świeży provisioning nigdy nie ma PIN-u → zawsze przez „Ustaw PIN".
    set({
      status: gateFor(stored.pin),
      pilot: stored.pilot,
      registration: null,
      registrationNote: null,
      busy: false,
    });
  };

  return {
    status: 'loading',
    pilot: null,
    registration: null,
    loginError: null,
    registrationNote: null,
    busy: false,

    attach(s) {
      service = s;
    },

    async restore() {
      try {
        const stored = await requireService().profile();
        if (stored != null) {
          useCurrentPilot.setState({ id: stored.pilot.id });
          set({ status: gateFor(stored.pin), pilot: stored.pilot });
          return;
        }
        // Bez profilu, ale ze zgłoszeniem: restart wraca na ekran oczekiwania, a nie
        // każe przechodzić przez Google od nowa.
        const registration = await requireService().registration();
        if (registration != null) {
          set({ status: 'pending_approval', registration: registration.registration });
          return;
        }
        set({ status: 'signed_out' });
      } catch {
        // Magazyn niedostępny (np. dev client sprzed przebudowy) - droga przez login,
        // z pustym błędem; sam login pokaże, co poszło nie tak.
        set({ status: 'signed_out' });
      }
    },

    async loginWithGoogle(idToken) {
      set({ busy: true, loginError: null });
      try {
        const outcome = await requireService().loginWithGoogle(idToken);
        if (outcome.kind === 'signed_in') {
          enter(outcome.stored);
          return;
        }
        set({
          status: 'pending_approval',
          registration: outcome.registration,
          registrationNote: null,
          busy: false,
        });
      } catch (error) {
        set({ busy: false, loginError: loginMessage(error) });
      }
    },

    reportLoginFailure(error) {
      set({ busy: false, loginError: loginMessage(error) });
    },

    async checkRegistration() {
      set({ busy: true, registrationNote: null });
      try {
        const check = await requireService().checkRegistration();
        switch (check.kind) {
          case 'signed_in':
            enter(check.stored);
            return;
          case 'pending':
          case 'rejected':
            set({ registration: check.registration, busy: false });
            return;
          case 'gone':
            set({
              status: 'signed_out',
              registration: null,
              loginError: REGISTRATION_GONE,
              busy: false,
            });
            return;
          case 'unreachable':
            set({
              registrationNote: 'Brak połączenia z serwerem - sprawdź ponownie, gdy będzie zasięg.',
              busy: false,
            });
            return;
        }
      } catch (error) {
        set({ busy: false, registrationNote: loginMessage(error) });
      }
    },

    async abandonRegistration() {
      await requireService().abandonRegistration();
      set({ status: 'signed_out', registration: null, registrationNote: null, loginError: null });
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
  };
});
