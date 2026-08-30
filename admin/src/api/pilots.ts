/**
 * UZ Aero - panel 2.0: konta pilotów (`/admin/api/pilots*`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * == HASLA NIE MA W ZADNYM ZADANIU ==
 * `createPilot` i `resetPilotPassword` nie mają parametru hasła i nigdy go nie dostaną:
 * wartość generuje serwer i oddaje ją JEDEN RAZ w odpowiedzi. Panel nie ma jak przesłać
 * hasła, więc nie ma jak go zapisać ani wysłać drugi raz - to jest zabezpieczenie przez
 * kształt API, nie przez dyscyplinę.
 *
 * == DOSTEPNOSC KONTA TO OSOBNE ZADANIE ==
 * `active` nie jedzie w `PATCH`-u i to jest decyzja serwera, nie uproszczenie panelu:
 * wyłączenie konta zrywa w JEDNEJ transakcji wszystkie sesje telefonu i przesuwa
 * granicę ważności poświadczeń. To inna operacja niż poprawienie nazwiska.
 */

import type { PilotChangeDto, PilotPageDto, PilotRole, PilotSecretDto } from './dto';
import { apiDelete, apiGet, apiPatch, apiPost } from './httpClient';

/**
 * Filtr listy tak, jak przyjmuje go trasa. Wszystko opcjonalne poza `limit` - brak
 * filtra znaczy „pokaż wszystkie konta".
 *
 * Trasa umie więcej (`role`, okno `from`/`to` dla dni lotnych); panel 2.0 o to nie
 * pyta, bo tych kolumn nie pokazuje.
 */
export interface PilotListQuery {
  /** `'true'`/`'false'` jako NAPIS: query string nie ma typu logicznego. */
  active?: 'true' | 'false';
  /** Fragment kodu, nazwiska albo e-maila - dopasowanie zawierające, nie dokładne. */
  q?: string;
  /**
   * Kierunek sortowania PO NAZWISKU - jedyny, który serwer zna
   * (`ORDER BY active DESC, name <dir>, code ASC`). Konta wyłączone stoją na końcu
   * niezależnie od kierunku i to nie jest parametr - to porządek listy.
   */
  sort?: 'asc' | 'desc';
  limit: number;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Pola nieustawione POMIJAMY zamiast wysyłać puste: `?q=` to dla zoda po drugiej
    // stronie napis pusty, czyli 400, a nie „bez filtra".
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function listPilots(query: PilotListQuery): Promise<PilotPageDto> {
  return apiGet<PilotPageDto>(`/pilots?${queryString(query)}`);
}

/** Tożsamość i rola nowego konta. Hasła NIE MA - generuje je serwer. */
export interface CreatePilotBody {
  code: string;
  name: string;
  email?: string;
  role: PilotRole;
}

export function createPilot(body: CreatePilotBody): Promise<PilotSecretDto> {
  return apiPost<PilotSecretDto>('/pilots', body);
}

/** `PATCH` opisuje ZMIANĘ, nie stan docelowy - pola nieustawione zostają bez zmian. */
export interface UpdatePilotBody {
  code?: string;
  name?: string;
  email?: string;
  role?: PilotRole;
}

export function updatePilot(id: string, body: UpdatePilotBody): Promise<PilotChangeDto> {
  return apiPatch<PilotChangeDto>(`/pilots/${encodeURIComponent(id)}`, body);
}

export function setPilotActive(id: string, active: boolean): Promise<PilotChangeDto> {
  return apiPost<PilotChangeDto>(`/pilots/${encodeURIComponent(id)}/active`, { active });
}

export function resetPilotPassword(id: string): Promise<PilotSecretDto> {
  return apiPost<PilotSecretDto>(`/pilots/${encodeURIComponent(id)}/password-reset`);
}

/**
 * TRWAŁE usunięcie konta - przechodzi WYŁĄCZNIE dla konta wyłączonego i bez historii.
 *
 * Serwer odmawia wszystkiego innego z powodem (`account_active`, `has_history`,
 * `self_delete`), więc panel nie musi (i nie może) zgadywać - lista nie niesie liczby
 * lotów, a zgadywanie „chyba da się usunąć" byłoby obietnicą przy nieodwracalnej akcji.
 */
export function deletePilot(id: string): Promise<void> {
  return apiDelete(`/pilots/${encodeURIComponent(id)}`);
}
