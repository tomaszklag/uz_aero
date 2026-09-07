/**
 * UZ Aero - panel 2.0: DZIENNIK (`/admin/api/log`, `/admin/api/sessions*`).
 *
 * Jeden plik = jeden moduł, mimo dwóch prefiksów tras - bo to jest jedna droga
 * czytelnika: flota w zakresie → sesje jednej maszyny → jedna sesja. Rozbicie tego
 * na trzy pliki po prefiksie serwera opisywałoby układ SERWERA, a nie sposób, w jaki
 * korzysta się z modułu.
 *
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice.
 */

import type {
  LogReportDto,
  SessionDetailDto,
  SessionPageDto,
  SessionTrackDto,
  SessionCloseResultDto,
  SessionVoidResultDto,
} from './dto';
import { apiGet, apiPost } from './httpClient';

/** Zakres dat jak w całym panelu: dzień UTC `YYYY-MM-DD`, obustronnie domknięty. */
export interface LogRangeQuery {
  from?: string;
  to?: string;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

/** Poziom 1: cała flota w zakresie, także maszyny, które nie latały. */
export function loadLog(query: LogRangeQuery): Promise<LogReportDto> {
  return apiGet<LogReportDto>(`/log?${queryString(query)}`);
}

/**
 * Poziom 2: sesje JEDNEJ maszyny w zakresie.
 *
 * `limit` jest bezpiecznikiem, nie stronicowaniem: zakres wybiera człowiek, a klub
 * nie robi setek sesji w miesiącu. Gdy odpowiedź ma `nextCursor`, ekran mówi wprost,
 * że lista jest przycięta - lista ucięta po cichu wygląda jak komplet.
 */
export interface SessionListQuery extends LogRangeQuery {
  aircraftId: string;
  limit: number;
}

export function listSessions(query: SessionListQuery): Promise<SessionPageDto> {
  return apiGet<SessionPageDto>(`/sessions?${queryString(query)}`);
}

/** Poziom 3: jedna sesja - stan policzony projekcją, surowa oś zdarzeń i flagi. */
export function loadSession(uuid: string): Promise<SessionDetailDto> {
  return apiGet<SessionDetailDto>(`/sessions/${encodeURIComponent(uuid)}`);
}

/**
 * Ślad GPS sesji - CAŁY bieg silnika, nie pojedynczy lot (issue #38).
 *
 * Osobne żądanie od `loadSession`, bo to inny materiał i inny koszt: karta sesji ma
 * kilkadziesiąt zdarzeń, a ślad kilkaset wierzchołków po kompresji. Wciągnięcie go do
 * karty spowalniałoby każde wejście w sesję o rzecz, na którą patrzy się rzadziej.
 */
export function loadSessionTrack(uuid: string): Promise<SessionTrackDto> {
  return apiGet<SessionTrackDto>(`/sessions/${encodeURIComponent(uuid)}/track`);
}

/**
 * Unieważnienie CAŁEJ sesji - jedyny ZAPIS w tym module (2026-08-31).
 *
 * `POST` na `/void`, a nie `DELETE /sessions/:uuid`: nic nie znika. Powstaje nowy
 * fakt - „ten wpis został wycofany" - a wraz z nim powód i ślad w dzienniku. `DELETE`
 * obiecywałby usunięcie, którego system nie robi i robić nie będzie.
 *
 * Powód jest WYMAGANY (serwer odrzuca puste): wycofuje się tu cudzy lot.
 */
export function voidSession(uuid: string, reason: string): Promise<SessionVoidResultDto> {
  return apiPost<SessionVoidResultDto>(`/sessions/${encodeURIComponent(uuid)}/void`, { reason });
}

/**
 * ZAKOŃCZENIE ADMINISTRACYJNE operacji osieroconej (issue #81) - drugi zapis w module.
 *
 * `POST /close`, nie `PATCH status`: powstaje nowy fakt „tę operację zakończył
 * administrator" (`session_close`), bez odczytów, z powodem. `withVoid` dopisuje w tym
 * samym ruchu unieważnienie - jedna decyzja, jeden przycisk, dwa fakty w rejestrze.
 */
export function closeSession(
  uuid: string,
  reason: string,
  withVoid: boolean,
): Promise<SessionCloseResultDto> {
  return apiPost<SessionCloseResultDto>(`/sessions/${encodeURIComponent(uuid)}/close`, {
    reason,
    void: withVoid,
  });
}
