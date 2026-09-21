/**
 * Ninerdeck - OKNO DOBY LOTNEJ (milestone 3.0.0, `docs/rezerwacje.md` §7.1).
 *
 * Granice, w których w ogóle wolno zaproponować slot: od zmierzchu cywilnego przed
 * wschodem do zmierzchu po zachodzie, nad lotniskiem macierzystym klubu. Sugestia
 * nie ma prawa proponować lotu po zmroku, a stała 06-21 kłamałaby w obie strony -
 * latem odcinałaby pierwszy poranny lot, zimą proponowała slot w ciemności.
 *
 * ══ TO JEST JEDYNE MIEJSCE, KTÓRE SKŁADA EFEMERYDY Z PROGAMI ══
 * `solar.ts` oddaje samą fizykę (wschód, zachód), `policy.ts` same progi (margines
 * zmierzchu, okno domyślne) - a `slots.ts` dostaje gotowe okno ARGUMENTEM i o jego
 * pochodzeniu nie wie nic. Rozdział jest celowy: gdy przyjdą loty nocne (NVFR,
 * świadomie poza 3.0.0), zmienia się TA funkcja, a nie upakowanie dnia.
 *
 * ══ DOBĘ KALENDARZOWĄ PRZYNOSI WOŁAJĄCY ══
 * Serwer liczy ją `Intl`-em (`clubTime.clubDays`), telefon dostaje gotową w odpowiedzi
 * `GET /bookings` - i właśnie dlatego ta funkcja bierze parę chwil, a nie strefę IANA:
 * aplikacja nie ma danych stref i mieć ich nie musi (§6.1).
 */

import {
  CIVIL_TWILIGHT_MS,
  DEFAULT_DAY_END_H,
  DEFAULT_DAY_START_H,
} from './policy';
import { sunTimes } from './solar';

const HOUR_MS = 3_600_000;

/** Doba kalendarzowa w strefie klubu - granice jako chwile bezwzględne. */
export interface CalendarDay {
  startsAt: number;
  endsAt: number;
}

/** Lotnisko macierzyste; `null` = klub go nie podał. */
export interface HomeField {
  lat: number;
  lon: number;
}

/** Okno, w którym wolno proponować sloty. Zawsze mieści się w dobie. */
export interface DayWindow {
  from: number;
  to: number;
  /**
   * Skąd wzięły się granice - ekran ma umieć napisać „doba lotna" przy oknie liczonym
   * i przemilczeć to przy domyślnym. Bez tego pola sugestia w klubie bez konfiguracji
   * wyglądałaby na wynik rachunku, którego nie było.
   */
  basis: 'solar' | 'default';
}

/**
 * Okno doby lotnej. `home === null` albo dzień bez wschodu i zachodu (szerokości
 * polarne) schodzą do okna domyślnego - brak konfiguracji nie może zablokować
 * rezerwacji, tak jak brak normy zużycia nie blokuje lotu.
 */
export function flightDayWindow(day: CalendarDay, home: HomeField | null): DayWindow {
  if (!(day.endsAt > day.startsAt)) return { from: day.startsAt, to: day.startsAt, basis: 'default' };

  if (home != null) {
    // Południe doby, nie jej początek: deklinacja Słońca zmienia się najszybciej
    // względem granic dnia kalendarzowego, a południe leży od nich najdalej.
    const sun = sunTimes(home.lat, home.lon, (day.startsAt + day.endsAt) / 2);
    if (sun != null) {
      const from = Math.max(day.startsAt, sun.sunriseAt - CIVIL_TWILIGHT_MS);
      const to = Math.min(day.endsAt, sun.sunsetAt + CIVIL_TWILIGHT_MS);
      // Okno przycięte do zera (biegun, dzień o dziwnej długości) nie jest oknem.
      if (to > from) return { from, to, basis: 'solar' };
    }
  }

  return defaultWindow(day);
}

/**
 * Okno domyślne: godziny liczone od początku doby klubu.
 *
 * ══ DWA RAZY W ROKU JEST O GODZINĘ OBOK I TO JEST PRZYJĘTE ══
 * W dobie zmiany czasu przesunięcie zachodzi w środku nocy, więc `początek + 6 h` to
 * 05:00 albo 07:00 lokalnie, nie 06:00. Poprawienie tego wymagałoby konwersji stref
 * po stronie telefonu, czyli dokładnie tego, czego cały ten moduł unika - a mówimy
 * o awaryjnym oknie klubu, który nie podał lotniska macierzystego. Kosztem jest
 * godzina, dwa dni w roku, w wartości i tak przybliżonej.
 */
function defaultWindow(day: CalendarDay): DayWindow {
  const from = day.startsAt + DEFAULT_DAY_START_H * HOUR_MS;
  const to = Math.min(day.endsAt, day.startsAt + DEFAULT_DAY_END_H * HOUR_MS);
  return { from: Math.min(from, to), to, basis: 'default' };
}
