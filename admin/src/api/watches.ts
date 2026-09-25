/**
 * Ninerdeck - panel: OBSERWOWANE SAMOLOTY zalogowanego (`/admin/api/me/watches*`;
 * 3.2.0, issue #205, decyzja 12; `docs/obserwowanie-samolotu.md` §6.6, §7.2).
 *
 * Trasy siedzą pod `/me/`, obok sesji i konta, bo pytają o OSOBĘ patrzącą, nie o klub:
 * lista jest tą samą listą, którą telefon pokazuje w sekcji „Obserwowane samoloty"
 * ustawień, a przełącznik zapisuje TO SAMO ustawienie. Zdolność `fleet.watch` - bez
 * niej serwer odpowiada 403, więc o kartę pyta wyłącznie ekran, który tę zdolność
 * widzi w sesji.
 *
 * Zapis jest idempotentny i BEZ wpisu w dzienniku audytu: to decyzja osoby o sobie,
 * jak motyw i PIN, a nie decyzja o kimś.
 */

import type { WatchListDto } from './dto';
import { apiDelete, apiGet, apiPut } from './httpClient';

/** Cała flota klubu sesji ze stanem „teraz" i flagą, czy ta osoba ją obserwuje. */
export function myWatches(): Promise<WatchListDto> {
  return apiGet<WatchListDto>('/me/watches');
}

/**
 * Włącz (`PUT`) albo wyłącz (`DELETE`) obserwowanie jednej maszyny. Obie odpowiadają
 * `204`; cudza albo skasowana maszyna to `404` (epik C - cudza rzecz jest nieistniejąca).
 */
export async function setWatch(aircraftId: string, on: boolean): Promise<void> {
  const path = `/me/watches/${encodeURIComponent(aircraftId)}`;
  if (on) {
    await apiPut<null>(path);
    return;
  }
  await apiDelete(path);
}
