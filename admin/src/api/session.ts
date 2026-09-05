/**
 * UZ Aero - panel: sesja przeglądarkowa (`/admin/api/auth/*`, `/admin/api/me`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, tak jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta i nie zna cache'u - zwraca obietnice, a co z nimi
 * zrobić, decyduje `queries/`.
 *
 * Uwaga o tym, czego tu NIE MA: token sesji. Logowanie zwraca tożsamość, a poświadczenie
 * ląduje w ciasteczku `HttpOnly`, którego ten kod nie widzi i widzieć nie ma prawa.
 *
 * == HASLA ZNIKLY (2026-09-04) ==
 * Do serwera jedzie TOKEN TOŻSAMOŚCI GOOGLE - napis, który przeglądarka dostała od
 * Google Identity Services po wybraniu konta. Panel go nie interpretuje i nigdzie nie
 * zapisuje: przekazuje dalej i zapomina, a o wszystkim orzeka serwer po sprawdzeniu
 * podpisu (`docs/logowanie-google.md` §7).
 */

import type { PanelSessionDto } from './dto';
import { apiGet, apiPost } from './httpClient';

export interface LoginInput {
  /** Token tożsamości z Google Identity Services (`credential` z odpowiedzi). */
  idToken: string;
}

export function login(input: LoginInput): Promise<PanelSessionDto> {
  return apiPost<PanelSessionDto>('/auth/login', input);
}

export function logout(): Promise<null> {
  return apiPost<null>('/auth/logout');
}

/**
 * Kto jest zalogowany. Wołane przy każdym starcie panelu, bo ciasteczko jest
 * `HttpOnly`: po odświeżeniu karty JavaScript nie ma innej drogi, żeby się dowiedzieć,
 * czy sesja jeszcze żyje i czyja jest.
 */
export function me(): Promise<PanelSessionDto> {
  return apiGet<PanelSessionDto>('/me');
}

/**
 * Identyfikator klienta Google dla panelu - jedyna rzecz, jaką panel musi wiedzieć
 * o konfiguracji, zanim ktokolwiek się zaloguje.
 *
 * Z SERWERA, a nie wkompilowany w build: panel to statyczne pliki serwowane spod
 * `admin/dist` i te same pliki mają działać na każdym wdrożeniu. Identyfikator nie jest
 * sekretem (stoi w każdym żądaniu do Google), więc publiczna trasa niczego nie odsłania.
 */
export function googleClient(): Promise<{ clientId: string }> {
  return apiGet<{ clientId: string }>('/auth/google-client');
}
