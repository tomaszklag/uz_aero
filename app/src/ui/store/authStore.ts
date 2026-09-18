/**
 * Ninerdeck - stan uwierzytelnienia w UI (cienka warstwa nad `AuthService`, §3.0).
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
import type {
  AccountMethods,
  ClubMembership,
  ClubsView,
  DeviceClubsRecord,
  LoginMethods,
  OrgRef,
  StoredCredentials,
} from '../../application/ports';
import { clubSwitchBlock } from '../screens/logic/clubSwitch';
import {
  loginMessage,
  passwordLoginNotice,
  setPasswordNotice,
  waitReason,
  type LoginNotice,
  type SetPasswordNotice,
} from '../screens/logic/loginMessage';
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

  /**
   * Co UMIE TO WDROŻENIE (`GET /auth/methods`, 2.1.0). `null` = jeszcze nie pytaliśmy
   * albo serwer nie odpowiedział - i wtedy 00A pokazuje OBIE drogi, bo hasło jest znane
   * lokalnie, a niedostępny skrypt Google nie ma prawa odebrać drugiej.
   */
  methods: LoginMethods | null;
  /**
   * Kluby znane URZĄDZENIU (D10) - z tego 00F rozstrzyga pigułkę klubu i wejście
   * „Zmień klub", a 00I rysuje karty. Czyta się offline: lista jest lokalna.
   */
  device: DeviceClubsRecord | null;
  /**
   * Czym MOŻE SIĘ ZALOGOWAĆ ta osoba (ustawienia, sekcja „Hasło"). `null` = nie wiemy -
   * wiersz stoi wtedy w stanie neutralnym, bo to jedyna odpowiedź, która nie kłamie
   * o żadnym z dwóch przypadków.
   */
  account: AccountMethods | null;
  /**
   * SESJA ZERWANA ZDALNIE (D7). Nie zmienia `status` i to jest cała decyzja: PIN dalej
   * otwiera, dane dnia zostają, a pilot dostaje baner „Status" na 00 i powód przy chipie
   * syncu. Wyrzucenie do logowania skasowałoby zapisy, których serwer jeszcze nie ma.
   */
  revoked: boolean;

  attach(service: AuthService): void;
  /** Odczyt magazynu przy starcie - ustala bramkę. */
  restore(): Promise<void>;
  /** Logowanie tokenem Google - wynik przełącza bramkę (profil / kluby / błąd). */
  loginWithGoogle(idToken: string): Promise<void>;
  /**
   * Logowanie HASŁEM (00F) - te same dwa wyjścia, co Google. Odmowy wracają jako
   * `LoginNotice`, bo mają na ekranie dwa różne miejsca (przy polu / w przycisku),
   * a wpisu NIE czyszczą: pilot poprawia literówkę.
   */
  loginWithPassword(login: string, password: string): Promise<LoginNotice>;
  /** „Nie pamiętam hasła" (00G). `false` = list nie wyszedł, bo nie ma sieci. */
  forgotPassword(email: string): Promise<boolean>;
  /** „Załóż konto" (00H) - ten sam list, ta sama odpowiedź (§5.4a). */
  signUp(name: string, email: string): Promise<boolean>;
  /** Ustawienie albo zmiana hasła (13B). Pusty `current` = osoba hasła jeszcze nie ma. */
  setPassword(current: string | null, next: string): Promise<SetPasswordNotice>;
  /** Odczyt `GET /auth/methods` - cichy: brak odpowiedzi zostawia obie drogi widoczne. */
  loadMethods(): Promise<void>;
  /** Odczyt `GET /me/account` - ustawienia pytają przy wejściu i po zapisie hasła. */
  loadAccount(): Promise<void>;
  /** Odczyt klubów urządzenia (offline) - 00F i 00I. */
  loadDeviceClubs(): Promise<void>;
  /** Wybór klubu na 00I - kontekst, w którym rozwiąże się wpisany kod pilota. */
  useDeviceClub(orgId: string): Promise<void>;
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
      // Świeża para tokenów znaczy żywą sesję, więc baner „Sesja zakończona" gaśnie sam.
      revoked: stored.revoked === true,
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
    methods: null,
    account: null,
    device: null,
    revoked: false,

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
            // Znacznik PRZEŻYWA restart, bo mieszka w magazynie: baner na 00 ma stać
            // także wtedy, gdy pilot zamknął aplikację po zdalnym wylogowaniu.
            revoked: stored.revoked === true,
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

    async loginWithPassword(login, password) {
      set({ busy: true, loginError: null });
      try {
        const outcome = await requireService().loginWithPassword({ login, password });
        if (outcome.kind === 'signed_in') {
          enter(outcome.stored);
          return { fieldError: null, blockReason: null };
        }
        if (outcome.kind === 'no_club') {
          set({ status: 'no_club', clubs: outcome.clubs, clubsNote: null, busy: false });
          return { fieldError: null, blockReason: null };
        }
        set({ busy: false });
        return passwordLoginNotice(outcome);
      } catch (error) {
        // Odmowa, której adapter nie przewidział - jedno zdanie PRZY POLU, bo tam pilot
        // patrzy. Baner `loginError` należy do 00A i tam by go nikt nie zobaczył.
        set({ busy: false });
        return { fieldError: loginMessage(error) ?? 'Nie udało się zalogować.', blockReason: null };
      }
    },

    async forgotPassword(email) {
      set({ busy: true });
      try {
        const outcome = await requireService().forgotPassword(email);
        set({ busy: false });
        return outcome.kind === 'sent';
      } catch {
        // Każda inna odmowa jest dla tego ekranu tym samym, co brak sieci: nie wiemy,
        // czy list poszedł. Rozróżnianie ich TREŚCIĄ wyliczałoby konta.
        set({ busy: false });
        return false;
      }
    },

    async signUp(name, email) {
      set({ busy: true });
      try {
        const outcome = await requireService().signUp({ name, email });
        set({ busy: false });
        return outcome.kind === 'sent';
      } catch {
        set({ busy: false });
        return false;
      }
    },

    async setPassword(current, next) {
      set({ busy: true });
      try {
        const outcome = await requireService().setPassword({
          ...(current != null && current !== '' ? { current } : {}),
          next,
        });
        set({ busy: false });
        return setPasswordNotice(outcome);
      } catch (error) {
        set({ busy: false });
        return {
          fieldError: null,
          currentError: null,
          blockReason: loginMessage(error) ?? 'Nie udało się zapisać hasła',
        };
      }
    },

    async loadMethods() {
      try {
        set({ methods: await requireService().methods() });
      } catch {
        // CICHO i to jest decyzja: `methods` steruje wyłącznie tym, czy pokazać przycisk
        // Google. Awaria tego odczytu nie ma prawa odebrać drogi HASŁEM, która jest znana
        // lokalnie - a baner „nie wiem, co serwer umie" nie mówi pilotowi nic, co mógłby
        // z tym zrobić.
      }
    },

    async loadAccount() {
      set({ account: await requireService().account() });
    },

    async loadDeviceClubs() {
      set({ device: await requireService().deviceClubs() });
    },

    async useDeviceClub(orgId) {
      await requireService().useDeviceClub(orgId);
      set({ device: await requireService().deviceClubs() });
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
        set({
          status: 'signed_out',
          pilot: null,
          org: null,
          memberships: [],
          loginError: null,
          revoked: false,
          // Kluby urządzenia PRZEŻYWAJĄ wylogowanie i to jest ich sens - odświeżamy je,
          // bo 00F bierze stąd klub, w którym rozwiąże się kod NASTĘPNEGO pilota.
          device: await requireService().deviceClubs(),
        });
      }
      return block;
    },
  };
});

/** Stan po odmowie - `AuthService` zapisał go w magazynie, więc czytamy stamtąd. */
const clubsAfterJoin = async (): Promise<ClubsView | null> =>
  (await requireService().person())?.clubs ?? null;
