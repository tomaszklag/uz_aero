/**
 * UZ Aero — panel: dni lotne (`/admin/api/sessions*`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u — zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * ══ KURSOR JEST NIEPRZEZROCZYSTY ══
 * `cursor` to DOKŁADNIE ten napis, który przyszedł w `nextCursor` poprzedniej
 * odpowiedzi — zakodowany base64url klucz sortowania SQL-a. Panel go nie parsuje,
 * nie składa i nie zamienia na numer strony: gdyby zaczął, kształt klucza przestałby
 * być sprawą serwera, a `OFFSET` na rosnącej tabeli gubi wiersze i dubluje inne
 * (`server/src/infrastructure/pg/keyset.ts`). Uszkodzony kursor to `400 bad_cursor`,
 * a nie ciche wrócenie na początek listy — i tak go pokazujemy.
 */

import type { OperationType } from '@uzaero/domain';

import type { SessionDetailDto, SessionPageDto } from './dto';
import { apiGet } from './httpClient';

/**
 * Filtr listy dni tak, jak przyjmuje go trasa. Wszystko poza `limit` opcjonalne —
 * brak filtra znaczy „pokaż wszystko", a nie „pokaż otwarte": domyślne zawężenie po
 * stronie API byłoby niewidoczną regułą, przez którą kafle przestałyby się zgadzać
 * z tym, co widać w tabeli.
 */
export interface SessionListQuery {
  /** Dzień UTC `YYYY-MM-DD` włącznie — trasa filtruje po DNIACH, nie po stemplach. */
  from?: string;
  to?: string;
  aircraftId?: string;
  /** Dopasowuje PIC-a **albo** Duala — dzień szkolny należy do obu. */
  pilotId?: string;
  status?: 'active' | 'closed';
  operation?: OperationType;
  /** `true` = tylko dni z OTWARTĄ flagą; `false` = tylko dni bez. */
  flagged?: boolean;
  /** `true` = tylko dni z kartą w `export_log`; `false` = tylko dni bez karty. */
  exported?: boolean;
  /** Porządek po dniu (`claim_time`); `desc` = najnowszy na górze, jak w `A02`. */
  sort?: 'asc' | 'desc';
  limit: number;
  /** Nieprzezroczysty kursor keyset z poprzedniej odpowiedzi; brak = pierwsza strona. */
  cursor?: string;
}

function queryString(query: SessionListQuery): string {
  const params = new URLSearchParams();
  // Pola nieustawione POMIJAMY zamiast wysyłać puste: `?status=` to dla zoda po drugiej
  // stronie napis pusty, czyli 400, a nie „bez filtra". `false` MUSI jednak przejść —
  // `?flagged=false` znaczy „tylko dni BEZ flagi" i jest pełnoprawnym zawężeniem.
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function listSessions(query: SessionListQuery): Promise<SessionPageDto> {
  return apiGet<SessionPageDto>(`/sessions?${queryString(query)}`);
}

/**
 * Karta jednego dnia. Trasa odpowiada 404 dla sesji, której nie ma w projekcji —
 * i to jest odpowiedź, a nie awaria: głęboki link do skasowanego albo przepisanego
 * uuid-a ma powiedzieć „nie ma takiego dnia", nie „coś poszło nie tak".
 */
export function getSession(sessionUuid: string): Promise<SessionDetailDto> {
  return apiGet<SessionDetailDto>(`/sessions/${encodeURIComponent(sessionUuid)}`);
}
