/**
 * Ninerdeck - panel: sesja przeglądarkowa (`/admin/api/auth/*`, `/admin/api/me`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, tak jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta i nie zna cache'u - zwraca obietnice, a co z nimi
 * zrobić, decyduje `queries/`.
 *
 * Uwaga o tym, czego tu NIE MA: token sesji. Logowanie zwraca tożsamość, a poświadczenie
 * ląduje w ciasteczku `HttpOnly`, którego ten kod nie widzi i widzieć nie ma prawa.
 *
 * == DWIE METODY, JEDNA SESJA (2.1.0, `docs/logowanie-haslem.md` §5.2) ==
 * Do serwera jedzie TOKEN TOŻSAMOŚCI GOOGLE (napis od Google Identity Services) ALBO
 * para adres + hasło. Panel nie interpretuje ani jednego, ani drugiego i nigdzie ich
 * nie zapisuje: przekazuje dalej i zapomina, a obie drogi kończą się tą samą sesją
 * i tym samym ciasteczkiem - bo są dwoma dowodami TEJ SAMEJ osoby.
 *
 * Hasło jedzie tędy WYŁĄCZNIE w jedną stronę. Nie ma tu funkcji, która hasło czyta,
 * odsyła albo zapamiętuje - i nie ma trasy, którą dałoby się je z serwera wyciągnąć.
 */

import type {
  LoginSessionDto,
  PanelAccountDto,
  PanelMethodsDto,
  PanelSessionDto,
} from './dto';
import { apiDelete, apiGet, apiPost, apiPut } from './httpClient';

export interface LoginInput {
  /** Token tożsamości z Google Identity Services (`credential` z odpowiedzi). */
  idToken: string;
}

export function login(input: LoginInput): Promise<PanelSessionDto> {
  return apiPost<PanelSessionDto>('/auth/login', input);
}

export interface PasswordLoginInput {
  /**
   * Panel loguje WYŁĄCZNIE adresem: przed sesją nie ma klubu, a kod pilota jest jedyny
   * w klubie, nie na serwerze. Na telefonie (00F) działa i kod - tam urządzenie zna
   * kluby, z których się na nim logowano.
   */
  email: string;
  password: string;
}

/**
 * Logowanie hasłem. Wynik jest DOKŁADNIE ten sam, co po Google - stąd wspólny typ:
 * ekran po zalogowaniu nie ma jak (i nie ma po co) wiedzieć, którędy ktoś wszedł.
 */
export function loginWithPassword(input: PasswordLoginInput): Promise<PanelSessionDto> {
  return apiPost<PanelSessionDto>('/auth/password', input);
}

/**
 * Metody logowania tego wdrożenia - pyta o nie ekran logowania, czyli ktoś BEZ sesji.
 *
 * Następca `googleClient()`: to samo pytanie zadane szerzej, bo od 2.1.0 przycisk
 * Google nie jest jedyną kontrolką na tym ekranie.
 */
export function methods(): Promise<PanelMethodsDto> {
  return apiGet<PanelMethodsDto>('/auth/methods');
}

export function logout(): Promise<null> {
  return apiPost<null>('/auth/logout');
}

/**
 * Przełączenie zakresu sesji: `orgId` = klub, `null` = platforma (moduł Organizacje).
 *
 * Nowe ciasteczko, ten sam token Google w tle - „Zmień klub" NIE każe logować się od
 * nowa. Klub, którego ta osoba nie ma, odpowiada 404: cudzy klub jest dla niej
 * nieistniejący, a 403 potwierdzałoby, że taki klub jest (issue #99).
 */
export function switchScope(orgId: string | null): Promise<PanelSessionDto> {
  return apiPost<PanelSessionDto>('/auth/switch', { orgId });
}

/**
 * Kto jest zalogowany. Wołane przy każdym starcie panelu, bo ciasteczko jest
 * `HttpOnly`: po odświeżeniu karty JavaScript nie ma innej drogi, żeby się dowiedzieć,
 * czy sesja jeszcze żyje i czyja jest.
 */
export function me(): Promise<PanelSessionDto> {
  return apiGet<PanelSessionDto>('/me');
}

// `googleClient()` (`GET /auth/google-client`) USUNIĘTE w 2.1.0: `methods()` wyżej
// zadaje to samo pytanie szerzej, a identyfikator klienta jedzie w jego odpowiedzi.
// Trasa na serwerze zostaje do wygaszenia razem z wydaniem - tu nie ma już jej klienta.

// -- hasło i własne urządzenia (2.1.0, issue #134 D3/D6) ------------------------

/**
 * „Nie pamiętam hasła" - prośba o list z linkiem (`#/logowanie/haslo`).
 *
 * Trasa jest PUBLICZNA i odpowiada `202` ZAWSZE: dla adresu znanego, nieznanego
 * i po przekroczeniu limitu wysyłek. Inna odpowiedź wyliczałaby konta, a to jest
 * ekran, na którym stoi każdy, kto zna adres panelu. Ekran pisze więc jedno zdanie
 * niezależnie od tego, co serwer zrobił naprawdę - i nie ma tu czego zwracać.
 */
export function forgotPassword(email: string): Promise<null> {
  return apiPost<null>('/auth/password/forgot', { email });
}

/**
 * Moje konto - adres i metody logowania (karta „Logowanie" na `#/konto`).
 *
 * Osobno od `me()`, choć obie mówią o zalogowanym: tożsamość sesji przestawia CAŁĄ
 * ramę panelu i panel trzyma ją bez terminu ważności, a metody zmieniają się dokładnie
 * wtedy, gdy ktoś ustawi sobie hasło na tej stronie.
 */
export function myAccount(): Promise<PanelAccountDto> {
  return apiGet<PanelAccountDto>('/me/account');
}

export interface ChangePasswordInput {
  /** Obecne hasło; POMIJAMY je, gdy osoba hasła jeszcze nie ma (ustawia pierwsze). */
  current?: string;
  next: string;
}

/**
 * Ustawienie albo zmiana własnego hasła. `204` bez ciała.
 *
 * Zapis unieważnia POZOSTAŁE sesje tej osoby - bieżąca zostaje. To skutek, który ekran
 * zapowiada PRZED kliknięciem i powtarza po nim, bo pytanie „dlaczego tablet w hangarze
 * mnie wylogował" pada godzinę później.
 */
export function changePassword(input: ChangePasswordInput): Promise<null> {
  return apiPut<null>('/me/password', input);
}

/**
 * Moje urządzenia - WSZYSTKIE powierzchnie i WSZYSTKIE kluby tej osoby.
 *
 * Zakres jest tu OSOBY, nie klubu, i to jest cała różnica wobec listy sesji członka
 * (`api/pilots.ts`): to są moje urządzenia, a nie dane klubu, w którym akurat pracuję.
 */
export function mySessions(): Promise<LoginSessionDto[]> {
  return apiGet<LoginSessionDto[]>('/me/sessions');
}

/**
 * „Wyloguj" przy wierszu własnej sesji.
 *
 * Bieżącej sesji tą drogą wyłączyć się NIE DA (serwer odpowiada 404) i panel nawet
 * nie rysuje przy niej przycisku: od wylogowania siebie jest „Wyloguj" w pasku, a to
 * samo kliknięcie dwa razy w jednym oknie znaczyłoby dwie różne rzeczy.
 */
export function revokeMySession(sessionId: string): Promise<void> {
  return apiDelete(`/me/sessions/${encodeURIComponent(sessionId)}`);
}
