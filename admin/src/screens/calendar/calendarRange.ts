/**
 * Ninerdeck - panel: ZAKRES DAT kalendarza (moduł Kalendarz, issue #160).
 *
 * Trzy szybkie zakresy zamiast pary pól z datami: administrator układa tydzień, a nie
 * prowadzi kwerendę. Chip jest zapalony, gdy zakres RÓWNA SIĘ jego wartości - nie gdy
 * go kliknięto (ta sama reguła, co w dzienniku): po wejściu z linku, po odświeżeniu
 * i po powrocie z szuflady zapalony ma być ten, który opisuje to, co widać.
 *
 * ══ ZAKRES ZACZYNA SIĘ DZISIAJ, NIE W PONIEDZIAŁEK ══
 * „Ten tydzień" znaczy siedem dni OD DZIŚ, bo pytanie brzmi „co jest przede mną", a nie
 * „jak wyglądał tydzień kalendarzowy". W piątek administrator planujący przegląd patrzy
 * na weekend i kolejne dni robocze, a nie na poniedziałek, który minął.
 */

const DAY_MS = 86_400_000;

export type RangeKey = 'week' | 'fortnight' | 'month';

export interface RangeOption {
  key: RangeKey;
  label: string;
  days: number;
}

export const RANGE_OPTIONS: readonly RangeOption[] = [
  { key: 'week', label: 'Ten tydzień', days: 7 },
  { key: 'fortnight', label: 'Dwa tygodnie', days: 14 },
  { key: 'month', label: 'Miesiąc', days: 31 },
];

export const DEFAULT_RANGE: RangeKey = 'week';

export interface CalendarQuery {
  from: string;
  to: string;
}

/**
 * Okno pytania dla `GET /admin/api/bookings`.
 *
 * Zaczyna się o `now`, a serwer i tak sprowadzi tę chwilę do granic doby w strefie
 * klubu - i o to chodzi: przeglądarka administratora bywa w innej strefie niż lotnisko,
 * a doba zmiany czasu ma 23 albo 25 godzin. Liczenie granic tutaj dałoby siatkę
 * przesuniętą o godzinę dwa razy w roku.
 *
 * Koniec okna to POCZĄTEK ostatniej doby, nie jej koniec: serwer domyka dobę sam
 * (`clubDays` kończy się na tej, która obejmuje `to`), więc `now + 7 dni` dawało
 * ÓSMĄ kolumnę pod chipem „Ten tydzień" - i skeleton o siedmiu kolumnach zapowiadał
 * wtedy inny kształt niż ten, który wjeżdżał.
 */
export function calendarQuery(key: RangeKey, now: number): CalendarQuery {
  const option = RANGE_OPTIONS.find((o) => o.key === key) ?? RANGE_OPTIONS[0]!;
  return {
    from: new Date(now).toISOString(),
    to: new Date(now + (option.days - 1) * DAY_MS).toISOString(),
  };
}

export const rangeDays = (key: RangeKey): number =>
  (RANGE_OPTIONS.find((o) => o.key === key) ?? RANGE_OPTIONS[0]!).days;
