/**
 * UZ Aero — panel: skrzynka flag (`/admin/api/flags*`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u — zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * Czego tu NIE MA i dlaczego: `getFlag(id)`. Serwer nie wystawia
 * `GET /admin/api/flags/:id`, a filtr listy nie przyjmuje `id` — szuflada szczegółu
 * (`A03a`) bierze więc flagę z wiersza, który człowiek kliknął. Skutek uboczny jest
 * widoczny w UI i opisany na miejscu (`FlagDrawer`): głęboki link do flagi spoza
 * bieżącego filtra nie ma czego pokazać.
 */

import type { FlagStatus, FlagType } from '@uzaero/domain';

import type { FlagPageDto, ResolveFlagResultDto } from './dto';
import { apiGet, apiPost } from './httpClient';

/**
 * Filtr skrzynki tak, jak przyjmuje go trasa. Wszystkie pola opcjonalne poza
 * `limit` — brak filtra znaczy „pokaż wszystko", a nie „pokaż otwarte": domyślne
 * zawężenie po stronie API byłoby niewidoczną regułą, przez którą liczniki panelu
 * przestałyby się zgadzać z tym, co widać.
 */
export interface FlagListQuery {
  status?: FlagStatus;
  type?: FlagType;
  aircraftId?: string;
  sessionUuid?: string;
  /** Zakres po `created_at` w epoch ms UTC, obustronnie domknięty. */
  from?: number;
  to?: number;
  limit: number;
}

function queryString(query: FlagListQuery): string {
  const params = new URLSearchParams();
  // Pola nieustawione POMIJAMY zamiast wysyłać puste: `?status=` to dla zoda
  // po drugiej stronie napis pusty, czyli 400, a nie „bez filtra".
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function listFlags(query: FlagListQuery): Promise<FlagPageDto> {
  return apiGet<FlagPageDto>(`/flags?${queryString(query)}`);
}

/**
 * Zamknięcie sprawy. `note` jest WYMAGANY po obu stronach — serwer odrzuca pusty
 * i sam trim (`400`), a panel blokuje wysyłkę wcześniej (`resolveNote`), żeby
 * człowiek zobaczył powód przy przycisku, a nie po żądaniu.
 *
 * Nagłówek CSRF dokłada `apiPost`; bez niego trasa odpowiada 403.
 */
export function resolveFlag(id: number, note: string): Promise<ResolveFlagResultDto> {
  return apiPost<ResolveFlagResultDto>(`/flags/${id}/resolve`, { note });
}
