/**
 * UZ Aero — panel: konta pilotów (`/admin/api/pilots*`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u — zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * ══ HASŁA NIE MA W ŻADNYM ŻĄDANIU ══
 * `createPilot` i `resetPassword` nie mają parametru hasła i nigdy go nie dostaną:
 * wartość generuje serwer i oddaje ją JEDEN RAZ w odpowiedzi. Panel nie ma jak
 * przesłać hasła, więc nie ma jak go zalogować, zapisać ani wysłać drugi raz — to
 * jest zabezpieczenie przez kształt API, nie przez dyscyplinę.
 */

import type { PilotChangeDto, PilotPageDto, PilotRole, PilotSecretDto } from './dto';
import { apiGet, apiPatch, apiPost } from './httpClient';

/**
 * Filtr listy tak, jak przyjmuje go trasa. Wszystko opcjonalne poza `limit` — brak
 * filtra znaczy „pokaż wszystkie konta", bo ta sama trasa jest słownikiem pilotów dla
 * filtrów innych ekranów (`A02`).
 */
export interface PilotListQuery {
  /** `'true'`/`'false'` jako NAPIS: query string nie ma typu logicznego. */
  active?: 'true' | 'false';
  /**
   * Parametr POWTARZALNY (`?role=admin&role=training_lead`), bo chip „Z rolą panelu"
   * z mockupu A06 to dwie role naraz. Lista po przecinku byłaby własnym formatem,
   * który trasa musiałaby rozbierać; powtórzony parametr rozumie każdy serwer, każdy
   * klient i pasek adresu, do którego ten link ma dać się wkleić.
   */
  role?: PilotRole[];
  /** Fragment kodu, nazwiska albo e-maila — dopasowanie zawierające, nie dokładne. */
  q?: string;
  sort?: 'asc' | 'desc';
  limit: number;
  /** Okno kolumny „dni lotne"; brak = bieżący miesiąc UTC (wybiera serwer). */
  from?: string;
  to?: string;
}

function queryString(query: PilotListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Pola nieustawione POMIJAMY zamiast wysyłać puste: `?q=` to dla zoda po drugiej
    // stronie napis pusty, czyli 400, a nie „bez filtra".
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    params.set(key, String(value));
  }
  return params.toString();
}

export function listPilots(query: PilotListQuery): Promise<PilotPageDto> {
  return apiGet<PilotPageDto>(`/pilots?${queryString(query)}`);
}

/** Tożsamość i rola nowego konta. Hasła NIE MA — generuje je serwer. */
export interface CreatePilotBody {
  code: string;
  name: string;
  email: string;
  role: PilotRole;
}

export function createPilot(body: CreatePilotBody): Promise<PilotSecretDto> {
  return apiPost<PilotSecretDto>('/pilots', body);
}

/** `PATCH` opisuje ZMIANĘ, nie stan docelowy — pola nieustawione zostają bez zmian. */
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
