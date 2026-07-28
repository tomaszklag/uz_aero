/**
 * UZ Aero (serwer) — zawartość dziennej karty arkusza (§4.7).
 *
 * Czysta funkcja: `SessionState` z `projectSession` (@uzaero/domain) + kody pilotów
 * → `DaySheet`. Zero bazy i zero Google — dzięki temu treść karty testuje się na
 * liczbach kanonicznego dnia bez jednej atrapy, a adapter Sheets (gdy powstanie)
 * dostanie gotowe wiersze do wklejenia.
 *
 * Formalnej specyfikacji arkusza jeszcze nie ma — karta odwzorowuje dane ekranów
 * 10/11 aplikacji (nagłówek dnia, tabela lotów, bilans paliwa, motogodziny, zrzuty),
 * bo to te same liczby, które pilot widzi przy zamknięciu dnia. Liczby w arkuszu
 * NIE MAJĄ PRAWA różnić się od telefonu: wszystko pochodzi z tej samej projekcji,
 * a formatery niżej są lustrami `app/src/ui/format.ts` i `statsDay.ts` (drobne
 * duplikaty zamiast zależności serwera od warstwy UI aplikacji).
 *
 * Czasy w UTC i tak podpisane — domyślna strefa całego systemu (CLAUDE.md).
 */

import type { SessionState } from '@uzaero/domain';

import type { DaySheet } from '../ports.ts';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Dzień karty jako `YYYY-MM-DD` (UTC) — prefiks nazwy karty i kolumna `export_log.day`. */
export function sheetDay(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Nazwa karty wg konwencji §4.7: `YYYY-MM-DD_SP-XXX` (data UTC z duty start).
 *
 * LUSTRO `sheetTabName` z `app/src/ui/screens/syncStatus.ts` — konwencja jest częścią
 * specyfikacji i telefon liczy ją u siebie (ekran 11 pokazuje cel eksportu zanim serwer
 * cokolwiek zapisze), więc oba końce muszą wyprodukować ten SAM napis bajt w bajt.
 * Rozjazd = telefon obiecuje inną kartę, niż serwer zapisał.
 */
export function sheetTabName(dutyStart: number, aircraftId: string): string {
  return `${sheetDay(dutyStart)}_${aircraftId}`;
}

/** „HH:MM" UTC — lustro `timeUtc` z `app/src/ui/format.ts`. */
function timeUtc(t: number | null): string {
  if (t == null) return '—';
  const d = new Date(t);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Czas trwania „HH:MM" z wiodącym zerem — lustro `hhmm` z `statsDay.ts` (ekran 10). */
function hhmm(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return `${pad2(Math.floor(totalMin / 60))}:${pad2(totalMin % 60)}`;
}

/**
 * Motogodziny wg formatu samolotu — lustro `motoHours` z `app/src/ui/format.ts`.
 * §5.4 mówi wprost, że `mh_format` obowiązuje też w eksporcie: licznik w kabinie
 * pokazuje `1234:30`, więc arkusz z `1234.5` wyglądałby jak inna wartość.
 */
function motoHours(value: number | null, format: 'decimal' | 'hhmm' | null): string {
  if (value == null) return '—';
  if (format === 'hhmm') {
    const h = Math.floor(value);
    const m = Math.round((value - h) * 60);
    // Zaokrąglenie 59,6 min → 60 przesuwa godzinę, żeby nie wyszło „1234:60".
    return m === 60 ? `${h + 1}:00` : `${h}:${pad2(m)}`;
  }
  return value.toFixed(1);
}

/** Litry bez miejsc po przecinku (paliwomierz i tak nie jest precyzyjny). */
function litres(value: number | null): string {
  return value == null ? '—' : String(Math.round(value));
}

/** „22 (12 tandem / 6 AFF / 4 solo)" — rozbicie jak w stopce mockupu 11; zera pomijamy. */
function jumpersCell(drops: SessionState['drops']): string {
  const parts = [
    drops.jumpers.tandem > 0 ? `${drops.jumpers.tandem} tandem` : null,
    drops.jumpers.aff > 0 ? `${drops.jumpers.aff} AFF` : null,
    drops.jumpers.solo > 0 ? `${drops.jumpers.solo} solo` : null,
  ].filter((p): p is string => p != null);
  return parts.length > 0 ? `${drops.totalJumpers} (${parts.join(' / ')})` : '0';
}

/** Kody załogi do nagłówka karty (rozwiązane z id przez eksporter). */
export interface DaySheetCrew {
  pic: string | null;
  dual: string | null;
}

/**
 * Buduje dzienną kartę z projekcji sesji. `null` = karty nie da się nazwać (sesja
 * bez `preflight_confirm` nie ma duty startu ani dnia) — eksporter wtedy pomija.
 *
 * Lot bez lądowania zostaje w tabeli z myślnikami — ukrycie go schowałoby dokładnie
 * ten wiersz, który wymaga korekty (ta sama decyzja co na ekranie 10).
 */
export function buildDaySheet(state: SessionState, crew: DaySheetCrew): DaySheet | null {
  if (state.dutyStart == null || state.aircraftId == null) return null;

  const rows: string[][] = [
    ['UZ Aero — dzień lotny', `${sheetDay(state.dutyStart)} (UTC)`],
    ['Samolot', state.aircraftId],
    ['PIC', crew.pic ?? '—'],
    ['Dual', crew.dual ?? '—'],
    ['Operacja', state.operation ?? '—'],
    ['Duty (UTC)', `${timeUtc(state.dutyStart)} → ${timeUtc(state.dutyEnd)}`],
    ['Block time', hhmm(state.blockTimeMs)],
    [],
    ['Loty · czasy UTC'],
    ['#', 'Takeoff', 'Landing', 'Block', 'Metoda'],
    ...state.flights.map((f) => [
      String(f.index),
      timeUtc(f.takeoffAt),
      f.landingAt != null ? timeUtc(f.landingAt) : '—',
      f.landingAt != null ? hhmm(f.durationMs) : '—',
      f.method === 'auto' ? 'AUTO' : 'RĘCZNIE',
    ]),
    [],
    ['Paliwo (L)'],
    ['Start', litres(state.fuel.startL)],
    ['Dolane', litres(state.fuel.addedL)],
    ['Zużyte', litres(state.fuel.consumedL)],
    ['Koniec', litres(state.fuel.endL)],
    [],
    ['Motogodziny'],
    ['Start', motoHours(state.mh.start, state.mhFormat)],
    ['Koniec', motoHours(state.mh.end, state.mhFormat)],
    ['Delta', motoHours(state.mh.deltaH, state.mhFormat)],
  ];

  // Strona przychodowa dnia — tylko dla operacji Skoki (§3.7); dla ferry/egzaminu
  // sekcja pełna zer byłaby szumem, nie informacją.
  if (state.operation === 'skoki') {
    rows.push(
      [],
      ['Zrzuty'],
      ['Wyniesienia', String(state.drops.count)],
      ['Skoczkowie', jumpersCell(state.drops)],
      ['Klient', state.client ?? '—'],
    );
  }

  return { tab: sheetTabName(state.dutyStart, state.aircraftId), rows };
}
