/**
 * UZ Aero — panel: KOLEJKA PONOWIEŃ EKSPORTU (moduł CZYSTY, Node).
 *
 * ══ TO NIE JEST DRUGI MONITOR EKSPORTU ══
 * Wiersz powstaje TĄ SAMĄ funkcją, co na `A05` (`exportRows`), a ponowienie idzie TĄ
 * SAMĄ mutacją (`useRetryExport`) i tą samą trasą. Rozjazd między „ponów" na monitorze
 * a „ponów" w konserwacji byłby gorszy niż brak drugiego przycisku — zwłaszcza że
 * dotyczyłby warunku „czy w ogóle warto próbować".
 *
 * Ten plik dokłada dokładnie jedno: ZŁĄCZENIE dwóch zawężeń serwera (dni bez karty
 * i dni zablokowanych flagą) w jedną listę „co czeka na uwagę" — i porządek, w jakim
 * się je czyta.
 *
 * ══ CZEGO TA KOLEJKA NIE POKAZUJE ══
 * **Numeru próby, czasu następnej próby i treści błędu** („3 / 6 · 14:38 ·
 * `sheets_write_timeout`" z mockupu). Nieudany eksport NIE zostawia śladu w żadnej
 * tabeli: wiersz `export_log` powstaje dopiero PO udanym zapisie karty, bo odwrotna
 * kolejność pokazywałaby na ekranie 11 telefonu link do arkusza, którego nie ma.
 * Kolejki z ponawianiem system nie ma — jej dołożenie to decyzja o schemacie, a nie
 * pole do wypełnienia. Mockup sam to przyznaje („Zaległość, którą ten ekran zakłada
 * za wykonaną") i ekran mówi to wprost, zamiast wypisywać wymyślone liczby.
 */

import { plural } from '@uzaero/format';

import type { ExportListItemDto, ExportPageDto } from '../../api/dto';
import { exportRows, type ExportRow } from '../exports/exportsRows';

/**
 * Liczniki kolejki.
 *
 * ══ POCHODZĄ Z SERWERA, NIE Z WIERSZY ══
 * Do 2026-08-02 liczyła je czysta funkcja nad tablicą wierszy — czyli nad sumą dwóch
 * stron JUŻ OBCIĘTYCH `QUEUE_LIMIT`-em. Klub ze 137 dniami bez karty dostawał 50
 * wierszy, plakietka mówiła „50", o 87 schowanych nie mówiła nic, a `A05` na to samo
 * pytanie odpowiadał „137". Odpowiedź trasy niesie `matched` (ile dni PASUJE do
 * zawężenia, także poza `limit`-em) i `truncated`, więc liczba nie musi być zgadywana
 * z widocznego okna — i nie ma prawa być. To dokładnie ta sama naprawa, którą `A05`
 * przeszedł 2026-08-01 (`contracts/exports.ts`: „ekran, który kłamie — a to nie jest
 * tańsze, tylko ciche").
 */
export interface QueueCounts {
  /** Wszystkie dni czekające na uwagę — suma obu zawężeń, z serwera. */
  total: number;
  /** Dni zamknięte BEZ karty — jedyne, których ponowienie ma sens. */
  failed: number;
  /** Dni, których kartę trzyma otwarta flaga — droga wiedzie przez skrzynkę flag. */
  blocked: number;
  /** Ile wierszy widać w tabeli po obcięciu `limit`-em. */
  shown: number;
  /** `true` = któreś z dwóch zawężeń nie zmieściło się w jednym żądaniu. */
  truncated: boolean;
}

/**
 * Odpowiedzi obu zawężeń → liczniki. `null` = któreś z zapytań jeszcze nie wróciło.
 *
 * `null`, a nie zera: „kolejka pusta" przy braku odpowiedzi jest twierdzeniem o świecie
 * („każdy zamknięty dzień ma kartę"), a brak odpowiedzi nim nie jest — i akurat na tym
 * ekranie ta pomyłka brzmi jak dobra wiadomość.
 */
export function queueCounts(
  failed: ExportPageDto | undefined,
  blocked: ExportPageDto | undefined,
  shown: number,
): QueueCounts | null {
  if (failed == null || blocked == null) return null;
  return {
    total: failed.matched + blocked.matched,
    failed: failed.matched,
    blocked: blocked.matched,
    shown,
    truncated: failed.truncated || blocked.truncated,
  };
}

/**
 * Dwa zawężenia serwera → jedna lista.
 *
 * **Porządek jest decyzją panelu i dlatego jest tu nazwany:** najpierw to, co da się
 * ponowić (`missing`), potem to, co odbije się o tę samą bramkę (`blocked`). Odwrotna
 * kolejność stawiałaby na górze wiersze z wyszarzonym przyciskiem, czyli listę zaczynałby
 * rząd rzeczy, których zrobić nie można. Wewnątrz każdej grupy zostaje porządek serwera —
 * przesortowanie go tutaj rozjechałoby listę z tym, co opisują liczniki.
 *
 * Duplikat po `sessionUuid` jest niemożliwy z konstrukcji (stany się wykluczają), ale
 * odsiewamy go i tak: dwa żądania to dwie chwile, a dzień zamknięty między nimi
 * wjechałby do listy dwa razy z dwoma różnymi stanami.
 */
export function queueRows(
  failed: readonly ExportListItemDto[],
  blocked: readonly ExportListItemDto[],
  nowMs: number,
): ExportRow[] {
  const rows = [
    ...exportRows(failed, nowMs, (uuid) => `/eksporty/${uuid}`),
    ...exportRows(blocked, nowMs, (uuid) => `/eksporty/${uuid}`),
  ];

  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.sessionUuid)) return false;
    seen.add(row.sessionUuid);
    return true;
  });
}

export interface QueueLabel {
  text: string;
  tone: 'red' | 'amber' | 'green' | 'dim';
}

/**
 * Plakietki nad kolejką: „1 bez karty", „2 zablokowane flagą" — dokładnie jak w mockupie.
 *
 * Plakietka jest OBIETNICĄ o kolejce, a nie o tabeli: mówi, ile dni czeka, nawet jeśli
 * `limit` pokazał ich mniej. Rozjazd między liczbą a listą nazywa osobne zdanie
 * (`queueTruncationNotice`), bo to dwie różne informacje i sklejenie ich w jedną
 * plakietkę kosztowałoby prawdziwość którejś z nich.
 */
export function queueLabels(counts: QueueCounts | null): QueueLabel[] {
  // Brak odczytu to nie jest pusta kolejka — a zielone „kolejka pusta" w trakcie
  // pobierania wygląda dokładnie jak odpowiedź, na którą się czeka.
  if (counts == null) return [{ text: 'brak odczytu', tone: 'dim' }];

  const out: QueueLabel[] = [];
  if (counts.failed > 0) {
    out.push({
      text: `${counts.failed} bez ${plural(counts.failed, 'karty', 'kart', 'kart')}`,
      tone: 'red',
    });
  }
  if (counts.blocked > 0) {
    out.push({
      text: `${counts.blocked} ${plural(counts.blocked, 'zablokowana', 'zablokowane', 'zablokowanych')} flagą`,
      tone: 'amber',
    });
  }
  if (out.length === 0) out.push({ text: 'kolejka pusta', tone: 'green' });
  return out;
}

/**
 * Zdanie „widzisz mniej, niż jest" — `null`, gdy lista jest kompletna.
 *
 * Lustro `truncationNotice` z `A05` i z tego samego powodu: `limit` jest tu
 * bezpiecznikiem („kolejka ma być krótka z natury"), a bezpiecznik, który po cichu
 * ucina listę, zamienia narzędzie nadzoru w narzędzie mylące — bo przycięta lista
 * wygląda na komplet i odpowiedź „tyle zostało do zrobienia" brzmi tak samo, jak
 * gdyby była prawdziwa.
 */
export function queueTruncationNotice(counts: QueueCounts | null, limit: number): string | null {
  if (counts == null || !counts.truncated) return null;
  const hidden = counts.total - counts.shown;
  return (
    `Widzisz ${counts.shown} z ${counts.total} ${plural(counts.total, 'dnia', 'dni', 'dni')} czekających na kartę — ` +
    `${hidden} ${plural(hidden, 'dzień', 'dni', 'dni')} poza listą, bo panel pobiera najwyżej ${limit} wierszy na zawężenie. ` +
    'Plakietki nad tabelą opisują CAŁĄ kolejkę, więc mówią też o tym, czego tu nie widać. ' +
    'Pełny obraz razem z zakresem dat i chipami stanu jest w monitorze eksportu.'
  );
}

/** Stan pusty kolejki — potwierdzenie, nie awaria (`A01a`: „cisza spodziewana"). */
export function queueEmpty(): { title: string; note: string } {
  return {
    title: 'KAŻDY ZAMKNIĘTY DZIEŃ MA KARTĘ',
    note: 'Ani jeden dzień lotny nie czeka na eksport i żadna flaga nie trzyma karty poza dokumentem klubu. Pusta kolejka jest tu wynikiem oczekiwanym — pozycje pojawiają się same, gdy eksport nie dojdzie do skutku.',
  };
}
