/**
 * UZ Aero - panel: dziennik audytu (`/admin/api/audit`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * ══ `action` JEST PARAMETREM POWTARZALNYM ══
 * Ekran filtruje GRUPAMI („Konta", „Flota", „Konserwacja"), a grupa to kilka kodów
 * katalogu naraz. Dlatego składamy `?action=a&action=b`, a nie listę po przecinku:
 * przecinek byłby własnym formatem, który trasa musiałaby rozbierać, a powtórzony
 * parametr rozumie każdy serwer i każdy klient - łącznie z paskiem adresu, do którego
 * ten link ma dać się wkleić.
 */

import type { AdminAction, AuditPageDto } from './dto';
import { apiGet } from './httpClient';

/**
 * Filtr dziennika tak, jak przyjmuje go trasa. Wszystko poza `limit` opcjonalne -
 * brak filtra znaczy „pokaż wszystko".
 *
 * `action` jest typu `AdminAction[]`, mimo że dziennik może zawierać kody spoza
 * katalogu: filtrować da się WYŁĄCZNIE po tym, co system zna, a kod nieznany serwer
 * odrzuca czterysetką (`isAdminAction`). Ciche zignorowanie takiego parametru
 * pokazałoby pełną listę pod etykietą zawężenia.
 */
export interface AuditListQuery {
  action?: AdminAction[];
  /** Identyfikator konta działającego - dopasowanie DOKŁADNE, nie po nazwisku. */
  actor?: string;
  targetType?: string;
  targetId?: string;
  /** Dzień UTC `YYYY-MM-DD` włącznie - trasa filtruje po DNIACH, nie po stemplach. */
  from?: string;
  to?: string;
  sort?: 'asc' | 'desc';
  limit: number;
  /** Nieprzezroczysty kursor keyset z poprzedniej odpowiedzi; brak = pierwsza strona. */
  cursor?: string;
}

function queryString(query: AuditListQuery): string {
  const params = new URLSearchParams();
  // Tablica idzie jako POWTÓRZONY parametr (`append`), reszta jako pojedyncza wartość.
  // Pola nieustawione pomijamy zamiast wysyłać puste: `?actor=` to dla zoda po drugiej
  // stronie napis pusty, czyli 400, a nie „bez filtra".
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    params.set(key, String(value));
  }
  return params.toString();
}

export function listAudit(query: AuditListQuery): Promise<AuditPageDto> {
  return apiGet<AuditPageDto>(`/audit?${queryString(query)}`);
}
