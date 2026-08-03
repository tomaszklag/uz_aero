/**
 * UZ Aero — panel: sesja przeglądarkowa (`/admin/api/auth/*`, `/admin/api/me`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, tak jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta i nie zna cache'u — zwraca obietnice, a co z nimi
 * zrobić, decyduje `queries/`.
 *
 * Uwaga o tym, czego tu NIE MA: token. Logowanie zwraca tożsamość, a poświadczenie
 * ląduje w ciasteczku `HttpOnly`, którego ten kod nie widzi i widzieć nie ma prawa.
 */

import type { PanelSessionDto } from './dto';
import { apiGet, apiPost } from './httpClient';

export interface LoginInput {
  login: string;
  password: string;
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
