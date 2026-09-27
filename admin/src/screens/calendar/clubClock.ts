/**
 * Ninerdeck - panel: GODZINA CZASU KLUBU ↔ CHWILA (własna rezerwacja, issue #233).
 *
 * Szuflada własnej rezerwacji pyta o dzień i parę godzin „w czasie klubu" (makieta K7) -
 * tak samo jak telefon (22), bo rezerwacja jest umową między ludźmi o godzinie na
 * lotnisku, a nie o godzinie w przeglądarce (`docs/rezerwacje.md` §6). Formularz
 * „Zarezerwuj za pilota" i wyłączenie z użytku zostają przy `datetime-local` w strefie
 * przeglądarki (`blockForm.ts`) - to jest świadoma różnica: tam wpisuje administrator
 * przy biurku, a nagłówek szuflady od lat mówi „czasu klubu" wyłącznie przy odczycie.
 *
 * ══ TELEFON LICZY ODEJMOWANIEM, PANEL - `Intl` ══
 * Hermes bez danych ICU po cichu formatuje w UTC (reguła R-F), więc telefon liczy
 * godziny od granic doby. Przeglądarka ma pełne dane stref i reguły zmiany czasu, a doba
 * zmiany czasu ma DWA offsety - więc tu wolno i trzeba zapytać `Intl` o konkretną chwilę.
 *
 * Moduł czysty i z testem obok: godzina przesunięta o jedną strefę wygląda poprawnie
 * i zapisuje rezerwację o godzinę obok.
 */

const MINUTE_MS = 60_000;

export interface ClubParts {
  /** `YYYY-MM-DD` doby klubu. */
  date: string;
  /** `HH:MM` czasu klubu. */
  hhmm: string;
}

const partsFormat = (tz: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

/** Doba i godzina chwili `at` w strefie klubu. */
export function clubParts(at: number, tz: string): ClubParts {
  const parts = partsFormat(tz).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hhmm: `${get('hour')}:${get('minute')}`,
  };
}

/** Dzisiejsza doba klubu - od niej w przód oś kalendarza przyjmuje rezerwacje. */
export const clubToday = (now: number, tz: string): string => clubParts(now, tz).date;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

/**
 * Chwila, w której zegar KLUBU pokazuje `date` + `hhmm`; `null` = zapis nieczytelny albo
 * godzina, której tej nocy nie ma (wiosenna zmiana czasu przeskakuje 02:00 → 03:00).
 *
 * Offset strefy zależy od chwili, a chwila od offsetu - więc liczymy go dwa razy: raz
 * dla zgadniętej chwili, drugi raz dla poprawionej. Wynik, który po przeliczeniu z powrotem
 * nie daje wpisanej godziny, znaczy godzinę nieistniejącą - i jest odmową, nie przesunięciem.
 */
export function clubInstant(date: string, hhmm: string, tz: string): number | null {
  const d = DATE.exec(date);
  const t = TIME.exec(hhmm);
  if (d == null || t == null) return null;
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (hour > 23 || minute > 59) return null;

  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hour, minute);
  if (!Number.isFinite(wall)) return null;

  const offset = (at: number): number => {
    const p = clubParts(at, tz);
    const [y, m, dd] = p.date.split('-').map(Number) as [number, number, number];
    const [hh, mm] = p.hhmm.split(':').map(Number) as [number, number];
    return Date.UTC(y, m - 1, dd, hh, mm) - Math.floor(at / MINUTE_MS) * MINUTE_MS;
  };

  let at = wall - offset(wall);
  const second = offset(at);
  if (wall - second !== at) at = wall - second;

  const back = clubParts(at, tz);
  return back.date === date && back.hhmm === hhmm ? at : null;
}

/** Południe doby klubu - dowolna chwila tej doby, o którą pytają trasy kalendarza. */
export const clubNoon = (date: string, tz: string): number | null => clubInstant(date, '12:00', tz);
