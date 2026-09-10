/**
 * UZ Aero - stan uwierzytelnienia w UI (cienka warstwa nad `AuthService`, §3.0).
 *
 * `status` steruje bramką nawigacji:
 *  • `loading`    - czytamy magazyn poświadczeń (moment startu);
 *  • `signed_out` - brak profilu → ekran 00a-login (jedyna czynność wymagająca sieci);
 *  • `no_club`    - konto Google potwierdzone, ale osoba nie ma AKTYWNEGO CZŁONKOSTWA
 *                   w żadnym klubie: czeka na zatwierdzenie (00c), została odrzucona
 *                   (00d) albo nie zgłosiła się nigdzie (00e). Który z trzech - mówi
 *                   `clubs.status` (wielofirmowość §4-§5);
 *  • `pin_setup`  - profil jest, PIN-u nie ma (świeży provisioning albo profil sprzed
 *                   tej funkcji) → krok „Ustaw PIN";
 *  • `locked`     - profil i PIN są → codzienne odblokowanie (00, w 100% offline);
 *  • `signed_in`  - odblokowane; wygasłe tokeny NIE zmieniają tego stanu (§3.0 -
 *                   aplikacja nigdy sama nie wyrzuca pilota do logowania).
 *
 * Store nie zna HTTP, SecureStore ani krypto - dostaje `AuthService` przez `attach`
 * z composition root, jak store sesji dostaje komendy. Nie zna też Google: token
 * tożsamości przynosi mu hook ekranu logowania, a co z nim zrobić, mówi serwer.
 */

import { create } from 'zustand';

import type { AuthService } from '../../application/auth/authService';
import type { ClubMembership, ClubsView, OrgRef, StoredCredentials } from '../../application/ports';
import { clubSwitchBlock } from '../screens/logic/clubSwitch';
import { loginMessage } from '../screens/logic/loginMessage';
import { useCurrentPilot } from './currentPilot';

export type AuthStatus =
  | 'loading'
  | 'signed_out'
  | 'no_club'
  | 'pin_setup'
  | 'locked'
  | 'signed_in';

/**
 * Wynik dołączenia kodem, przełożony na to, co robi EKRAN (00E, arkusz na 13A).
 * `joined` przełącza bramkę na 00C samo; reszta to zdanie przy polu albo powód
 * w przycisku - decyduje o nich `joinMessage` (`logic/joinClub.ts`).
 */
export type JoinResult =
  | { kind: 'joined' }
  | { kind: 'rejected' }
  | { kind: 'error'; message: string }
  | { kind: 'blocked'; reason: string };

interface AuthStore {
  status: AuthStatus;
  pilot: { id: string; code: string; name: string } | null;
  /** Klub AKTYWNY - kontekst floty i wysyłki; `null` poza `signed_in`. */
  org: OrgRef | null;
  /**
   * Komplet klubów pilota. Przełącznik na 13A i plakietka klubu na kafelku (01E)
   * istnieją WYŁĄCZNIE przy więcej niż jednym członkostwie - przy jednym plakietka
   * świeciłaby przy każdym kafelku i niczego nie odróżniała (reguła SyncChipa z #12).
   */
  memberships: ClubMembership[];
  /** Stan wobec klubów - treść ekranów 00c/00d/00e; `null` poza `no_club`. */
  clubs: ClubsView | null;
  /** Błąd ostatniej próby logowania - po polsku, do pokazania na 00a-login. */
  loginError: string | null;
  /**
   * Zdanie o ostatnim sprawdzeniu stanu (brak sieci, odmowa) - pod przyciskiem
   * „SPRAWDŹ PONOWNIE" na 00c. `null` = sprawdzenie przeszło albo nikt nie pytał.
   */
  clubsNote: string | null;
  busy: boolean;

  attach(service: AuthService): void;
  /** Odczyt magazynu przy starcie - ustala bramkę. */
  restore(): Promise<void>;
  /** Logowanie tokenem Google - wynik przełącza bramkę (profil / kluby / błąd). */
  loginWithGoogle(idToken: string): Promise<void>;
  /**
   * Niepowodzenie PRZED serwerem (okno Google zamknięte, brak konfiguracji) - ten sam
   * baner, co odmowa serwera; anulowanie przez pilota czyści baner zamiast go stawiać.
   */
  reportLoginFailure(error: unknown): void;
  /** „SPRAWDŹ PONOWNIE" i pętla ekranu 00c - pyta serwer o stan wobec klubów. */
  checkClubs(): Promise<void>;
  /** Kod klubu z 00E albo z arkusza na 13A - JEDYNA droga do klubu (§3.8). */
  joinClub(code: string): Promise<JoinResult>;
  /**
   * Przełączenie klubu (13A). WYMAGA SIECI i pustej kolejki KLUBU BIEŻĄCEGO - licznik
   * podaje wołający, bo żyje w warstwie danych sesji (jak przy wylogowaniu).
   */
  switchClub(orgId: string, pendingInActiveOrg: number): Promise<JoinResult>;
  /** „Zaloguj innym kontem" - porzuca stan na tym telefonie, wraca na 00a. */
  abandonPerson(): Promise<void>;
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

/** Za tym tokenem nikt już nie stoi - jedno zdanie na 00a, bo 00c nie ma o czym mówić. */
const PERSON_GONE = 'Zgłoszenie wygasło albo zostało usunięte - zaloguj się jeszcze raz.';

const OFFLINE_NOTE = 'Brak połączenia z serwerem - sprawdź ponownie, gdy będzie zasięg.';

export const useAuthStore = create<AuthStore>((set) => {
  /** Tożsamość z provisioning zasila cały UI - nigdzie nie pytamy o kod pilota. */
  const enter = (stored: StoredCredentials): void => {
    useCurrentPilot.setState({ id: stored.pilot.id });
    // Świeży provisioning nigdy nie ma PIN-u → zawsze przez „Ustaw PIN".
    set({
      status: gateFor(stored.pin),
      pilot: stored.pilot,
      org: stored.org ?? null,
      memberships: stored.memberships ?? [],
      clubs: null,
      clubsNote: null,
      busy: false,
    });
  };

  return {
    status: 'loading',
    pilot: null,
    org: null,
    memberships: [],
    clubs: null,
    loginError: null,
    clubsNote: null,
    busy: false,

    attach(s) {
      service = s;
    },

    async restore() {
      try {
        const stored = await requireService().profile();
        if (stored != null) {
          useCurrentPilot.setState({ id: stored.pilot.id });
          set({
            status: gateFor(stored.pin),
            pilot: stored.pilot,
            org: stored.org ?? null,
            memberships: stored.memberships ?? [],
          });
          return;
        }
        // Bez profilu, ale z zapisanym stanem osoby: restart wraca na ekran oczekiwania
        // (albo na pole kodu klubu), a nie każe przechodzić przez Google od nowa.
        const person = await requireService().person();
        if (person != null) {
          set({ status: 'no_club', clubs: person.clubs });
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
        set({ status: 'no_club', clubs: outcome.clubs, clubsNote: null, busy: false });
      } catch (error) {
        set({ busy: false, loginError: loginMessage(error) });
      }
    },

    reportLoginFailure(error) {
      set({ busy: false, loginError: loginMessage(error) });
    },

    async checkClubs() {
      // BRAMKĘ RUSZA WYŁĄCZNIE DROGA OSOBY (00C). Ten sam odczyt robi 13A u pilota,
      // który już gdzieś lata - tam odmowa i brak sieci nie mają prawa go wylogować
      // ani przenieść na ekran oczekiwania: on ma klub i pracuje dalej.
      const atGate = useAuthStore.getState().status === 'no_club';
      set({ busy: true, clubsNote: null });
      try {
        const check = await requireService().checkMemberships();
        switch (check.kind) {
          case 'signed_in':
            enter(check.stored);
            return;
          case 'clubs':
            set({ clubs: check.clubs, busy: false });
            return;
          case 'gone':
            set(
              atGate
                ? { status: 'signed_out', clubs: null, loginError: PERSON_GONE, busy: false }
                : { busy: false },
            );
            return;
          case 'unreachable':
            set(atGate ? { clubsNote: OFFLINE_NOTE, busy: false } : { busy: false });
            return;
        }
      } catch (error) {
        set({ busy: false, clubsNote: atGate ? loginMessage(error) : null });
      }
    },

    async joinClub(code) {
      // BRAMKĘ RUSZAMY WYŁĄCZNIE Z BRAMKI. Ten sam kod wpisuje pilot, który już gdzieś
      // lata (13A) - u niego ani zgłoszenie, ani ODMOWA nie mają prawa zmienić ekranu:
      // on ma klub i pracuje dalej. Bez tego warunku odmowa z drugiego klubu wyrzucałaby
      // go z aplikacji na ekran „nie należysz do żadnego klubu".
      const atGate = useAuthStore.getState().status === 'no_club';
      set({ busy: true });
      try {
        const result = await requireService().joinClub(code);
        switch (result.kind) {
          case 'pending':
            // Zgłoszenie przyjęte. Pilot BEZ klubu wchodzi na 00C; pilot z profilem
            // zostaje tam, gdzie był - u niego zgłoszenie jest wierszem na liście
            // klubów (13A), a nie zmianą ekranu.
            set(atGate ? { clubs: result.clubs, busy: false } : { busy: false });
            return { kind: 'joined' };
          case 'rejected':
            if (!atGate) {
              set({ busy: false });
              return {
                kind: 'error',
                message: `Administrator klubu ${result.org.name} nie przyjął Twojego zgłoszenia.`,
              };
            }
            set({ status: 'no_club', clubs: await clubsAfterJoin(), busy: false });
            return { kind: 'rejected' };
          case 'unknown_code':
            set({ busy: false });
            return {
              kind: 'error',
              message: 'Nie znam takiego kodu. Sprawdź, czy przepisujesz go w całości.',
            };
          case 'already_member':
            set({ busy: false });
            return { kind: 'error', message: `Już latasz w klubie ${result.org.name}.` };
          case 'membership_disabled':
            set({ busy: false });
            return {
              kind: 'error',
              message: `Twoje członkostwo w klubie ${result.org.name} jest wyłączone - odezwij się do administratora.`,
            };
          case 'rate_limited':
            set({ busy: false });
            return { kind: 'blocked', reason: waitReason(result.retryAfterSec) };
          case 'unreachable':
            set({ busy: false });
            return { kind: 'blocked', reason: 'Wymaga internetu' };
        }
      } catch (error) {
        set({ busy: false });
        return { kind: 'error', message: loginMessage(error) ?? 'Nie udało się - spróbuj ponownie.' };
      }
    },

    async switchClub(orgId, pendingInActiveOrg) {
      // Zapisy klubu, z którego wychodzimy, zostałyby bez drogi wyjścia: wysłać je
      // można wyłącznie jego tokenem (§7.3). Zapisy INNYCH klubów nie blokują -
      // przełączenie jest właśnie drogą do ich wysłania.
      if (pendingInActiveOrg > 0) {
        return {
          kind: 'blocked',
          reason: clubSwitchBlock(pendingInActiveOrg, false) ?? '',
        };
      }
      set({ busy: true });
      try {
        const outcome = await requireService().switchClub(orgId);
        if (outcome.kind === 'switched') {
          enter(outcome.stored);
          return { kind: 'joined' };
        }
        set({ busy: false });
        return outcome.kind === 'unreachable'
          ? { kind: 'blocked', reason: 'Wymaga internetu' }
          : {
              kind: 'error',
              message: 'Nie latasz już w tym klubie - odezwij się do jego administratora.',
            };
      } catch (error) {
        set({ busy: false });
        return { kind: 'error', message: loginMessage(error) ?? 'Nie udało się - spróbuj ponownie.' };
      }
    },

    async abandonPerson() {
      await requireService().abandonPerson();
      set({ status: 'signed_out', clubs: null, clubsNote: null, loginError: null });
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
      if (block == null) {
        set({ status: 'signed_out', pilot: null, org: null, memberships: [], loginError: null });
      }
      return block;
    },
  };
});

/** Stan po odmowie - `AuthService` zapisał go w magazynie, więc czytamy stamtąd. */
const clubsAfterJoin = async (): Promise<ClubsView | null> =>
  (await requireService().person())?.clubs ?? null;

/**
 * „Spróbuj za 3 min" - ograniczenie tempa `POST /auth/join` (10 prób na osobę w 15 min).
 * Powód stoi W PRZYCISKU (issue #55) i MUSI podawać czas: „za dużo prób" bez liczby
 * każe pilotowi zgadywać, kiedy wrócić.
 */
const waitReason = (sec: number): string =>
  sec < 60 ? `Za dużo prób - spróbuj za ${sec} s` : `Za dużo prób - spróbuj za ${Math.ceil(sec / 60)} min`;
