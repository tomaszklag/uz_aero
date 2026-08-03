/**
 * UZ Aero — panel: HISTORIA REWIZJI karty jako oś zdarzeń (moduł CZYSTY, Node).
 *
 * ══ CO TA OŚ MA POWIEDZIEĆ ══
 * „Trzy wiersze w `export_log`, jeden w `exported_sheets`". Dziennik pamięta KAŻDĄ
 * wysyłkę z osobna (jest append-only), karta trzyma wyłącznie treść ostatniej rewizji —
 * dokładnie jak zakładka w arkuszu, którą kolejny zapis nadpisuje. Rozdzielenie tych
 * dwóch tabel jest jedynym śladem rozjazdu arkusz↔rejestr, więc ekran musi je pokazywać
 * osobno, a nie zlewać w jedną liczbę.
 *
 * ══ CZEGO TA OŚ NIE POWIE ══
 * **Dlaczego** powstała dana rewizja. Mockup podpisuje wiersze „spóźniony sync",
 * „korekta zdarzenia" — a `export_log` ma sześć kolumn i żadnej z nich nie jest powód.
 * Odtworzenie go wymagałoby zestawienia stempla wysyłki z czasem przyjęcia zdarzeń
 * i z dziennikiem audytu, czyli DRUGIEGO wyliczenia obok rejestru — a to jest dokładnie
 * to, co zaczyna kłamać. Wiersz mówi więc, co wiadomo: numer, czas i adres karty,
 * a przy pierwszej rewizji — że była pierwsza.
 */

import { dateTimeUtc } from '@uzaero/format';

import type { ExportHistoryDto, ExportRevisionDto } from '../../api/dto';
import type { TimelineTone } from '../../ui/components/TimelineRow';
// To samo skracanie uuid-a, co w wierszach listy i na `A03` — druga kopia dałaby dwa
// różne skróty tego samego identyfikatora na jednym ekranie.
import { shortUuid } from '../flags/flagRows';

export interface RevisionEntry {
  key: string;
  time: string;
  tone: TimelineTone;
  name: string;
  meta: string;
  badge: string;
}

/**
 * Rewizje → wiersze osi, W KOLEJNOŚCI SERWERA (od najstarszej). Oś czasu jednej karty
 * czyta się od początku — inaczej niż listy, które czyta się od tego, co nowe.
 */
export function revisionEntries(revisions: readonly ExportRevisionDto[]): RevisionEntry[] {
  return revisions.map((revision, index) => ({
    key: String(revision.revision),
    time: dateTimeUtc(Date.parse(revision.exportedAt)),
    // Pierwsza wysyłka jest zielona (karta powstała), każda kolejna niebieska
    // (dokument klubu został nadpisany) — ta sama semantyka kolorów, co na osi dnia.
    tone: index === 0 ? 'green' : 'blue',
    name:
      index === 0
        ? `rewizja ${revision.revision} · pierwszy eksport`
        : `rewizja ${revision.revision} · karta zbudowana od nowa`,
    meta: `${revision.day} · ${revision.sheetUrl}`,
    badge: `rew. ${revision.revision}`,
  }));
}

/**
 * Plakietka nad podglądem: KTÓRA rewizja leży w karcie.
 *
 * Do 2026-08-01 rozstrzygał to widok — `revisions[revisions.length - 1]!.revision`
 * w `.tsx`. Wyglądało to na drobiazg („ostatni element listy"), a było decyzją o treści:
 * odpowiedzią na pytanie „którą wersję dokumentu klubu widzę". Odpowiedź opiera się
 * na porządku, którego widok nie ustala (rosnący, od najstarszej — patrz `revisionEntries`),
 * więc odwrócenie sortowania na serwerze zmieniłoby napis, nie ruszając ani jednego
 * testu. Tutaj ma test.
 */
export function currentRevisionLabel(history: ExportHistoryDto): string {
  const last = history.revisions.at(-1);
  return last == null ? 'brak rewizji' : `rewizja ${last.revision}`;
}

/**
 * Ostrzeżenie pod podglądem karty, gdy jej treść zapisała PÓŹNIEJ inna sesja.
 *
 * `null` = podgląd pokazuje treść tego dnia i nie ma o czym mówić. Zdanie jest tu,
 * a nie w `.tsx`, bo jest decyzją o treści — i bo bez niego rozwinięcie wygląda na
 * kartę klikniętego wiersza, a pokazuje cudzy dzień pracy.
 */
export function overwrittenNotice(history: ExportHistoryDto): string | null {
  if (history.overwrittenBy == null) return null;
  return (
    `Ta treść pochodzi z INNEJ sesji tego dnia (${shortUuid(history.overwrittenBy.sessionUuid)}), ` +
    'która zapisała kartę o tej samej nazwie później. Nazwa karty niesie dzień i samolot, ' +
    'ale nie sesję, a exported_sheets trzyma jedną treść na nazwę — więc dnia pracy z tego ' +
    'wiersza nie ma dziś w dokumencie klubu.'
  );
}

export interface HistorySummary {
  /** „export_log · 3 wiersze" — plakietka nad osią. */
  logLabel: string;
  /** „exported_sheets · 1 wiersz" — druga plakietka, celowo obok pierwszej. */
  sheetLabel: string;
  /** Zdanie pod osią, mówiące, co z tej różnicy wynika. */
  note: string;
}

const rowsWord = (n: number): string => {
  if (n === 1) return '1 wiersz';
  // 2–4, 22–24 … → „wiersze"; reszta → „wierszy". Ta sama reguła, co `plural`
  // w `@uzaero/format`, ale nad rzeczownikiem, którego tamta funkcja nie odmienia.
  const last = n % 10;
  const teens = n % 100;
  const few = last >= 2 && last <= 4 && !(teens >= 12 && teens <= 14);
  return `${n} ${few ? 'wiersze' : 'wierszy'}`;
};

export function historySummary(history: ExportHistoryDto): HistorySummary {
  const revisions = history.revisions.length;
  return {
    logLabel: `export_log · ${rowsWord(revisions)}`,
    sheetLabel: `exported_sheets · ${rowsWord(history.sheetRows)}`,
    note:
      revisions === 0
        ? 'Dziennik tej karty jest pusty — karta nigdy nie poszła do arkusza. Nieudane próby nie zostawiają wiersza: wpis powstaje dopiero po udanym zapisie, bo odwrotna kolejność pokazywałaby na ekranie 11 telefonu link do arkusza, którego nie ma.'
        : `Dziennik pamięta każdą z ${revisions === 1 ? 'tej wysyłki' : `${revisions} wysyłek`} z osobna (append-only), karta trzyma wyłącznie treść ostatniej rewizji — dokładnie jak zakładka w arkuszu, którą kolejny zapis nadpisuje. Treść starszych rewizji nie jest nigdzie kopiowana: odtwarza się ją ze strumienia zdarzeń, bo pełne kopie dublowałyby rejestr bez zysku.`,
  };
}
