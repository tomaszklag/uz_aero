/**
 * UZ Aero - napis „kiedy ostatnio rozmawialiśmy z serwerem" dla `SyncChip`.
 *
 * Osobny moduł, bo `.tsx` w tej aplikacji eksportuje WYŁĄCZNIE komponenty
 * (`docs/architektura-kodu.md` §2), a to jest jedyna nietrywialna decyzja wskaźnika
 * łączności i jedyna, którą da się sprawdzić bez React Native. Stoi przy komponencie,
 * nie w `ui/screens/logic/`, bo nie należy do żadnego ekranu - chip wisi na wszystkich.
 *
 * Skąd wymóg: chip pokazujemy dopiero offline (issue #12), a wtedy „OFFLINE · 3" nie
 * odpowiada na pytanie, które pilot faktycznie zadaje - czy dane, które widzi, są sprzed
 * pięciu minut, czy sprzed dwóch dni. Stąd druga linia ze stemplem ostatniej udanej
 * synchronizacji.
 *
 * Data znika, gdy sync był DZISIAJ (UTC): przez większość dni lotnych stempel to sama
 * godzina i tyle wystarcza, a „21 CZE" przy każdym rzucie oka byłoby szumem. Gdy sync
 * wypadł wcześniej, data wraca - i to jest właśnie ten przypadek, w którym niesie treść.
 */

import { dateTimeUtcShort, timeUtc } from '../../format';

/** Ten sam dzień UTC - dzień lotny liczymy w UTC (`CLAUDE.md`, sekcja „Strefa czasowa"). */
function sameUtcDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getUTCFullYear() === y.getUTCFullYear() &&
    x.getUTCMonth() === y.getUTCMonth() &&
    x.getUTCDate() === y.getUTCDate()
  );
}

/**
 * „SYNC 17:30 UTC" / „SYNC 21 CZE 17:30 UTC" / „BEZ SYNCA" (`at == null`).
 *
 * Brak stempla nie jest awarią i tak jest napisany: zdarza się na świeżo zainstalowanej
 * aplikacji i po każdym restarcie bez zasięgu, bo chwilę ostatniej wysyłki trzymamy
 * w pamięci procesu (`sessionStore.lastSyncAt`).
 */
export function syncStamp(at: number | null, now: number): string {
  if (at == null) return 'BEZ SYNCA';
  return sameUtcDay(at, now)
    ? `SYNC ${timeUtc(at)} UTC`
    : `SYNC ${dateTimeUtcShort(at)} UTC`;
}
