/**
 * Ninerdeck - ZEGAR KLUBU dla kalendarza rezerwacji (3.0.0, `docs/rezerwacje.md` §6).
 *
 * Kalendarz mówi CZASEM KLUBU, a nie UTC: reguła „UTC wszędzie" broni POMIARÓW -
 * rejestr operacji, czasy blokowe, odczyty - a rezerwacja jest umową między ludźmi
 * o godzinie. „Wezmę AXA od dziewiątej" znaczy dziewiątą na zegarku w hangarze.
 *
 * ══ BEZ `Intl` I BEZ TABLICY STREF ══
 * Telefon dostaje z `GET /bookings` GRANICE KAŻDEJ DOBY jako parę chwil UTC (§6.1),
 * więc godzinę ścienną liczy samym odejmowaniem od początku doby. To jest cały powód,
 * dla którego kontrakt oddaje granice zamiast offsetów: Hermes bez danych ICU przyjmuje
 * opcję `timeZone` i po cichu formatuje w UTC - odpowiada, tylko źle, a takiego błędu
 * nikt nie zgłosi, bo ekran wygląda poprawnie.
 *
 * ══ DWA RAZY W ROKU GODZINA JEST O JEDEN OBOK I TO JEST PRZYJĘTE ══
 * W dobie zmiany czasu przesunięcie zachodzi w środku nocy, więc „początek doby + 9 h"
 * to 08:00 albo 10:00 ściennie, nie 09:00. Poprawienie tego wymagałoby konwersji stref
 * na telefonie, czyli dokładnie tego, czego ten moduł unika. Ten sam rachunek i ten sam
 * koszt przyjmuje `defaultWindow` w `@ninerdeck/domain` - i tam też stoi zapisany.
 */

/** Doba klubu - granice jako chwile bezwzględne (kształt `RemoteCalendarDay` po parsowaniu). */
export interface ClubDayBounds {
  /** `RRRR-MM-DD` w strefie klubu - KLUCZ doby, nie data do wyświetlenia. */
  date: string;
  startsAt: number;
  endsAt: number;
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** Ile godzin ściennych upłynęło od początku doby (ułamkowo). */
export function clubHours(at: number, day: ClubDayBounds): number {
  return (at - day.startsAt) / HOUR_MS;
}

/** Godzina ścienna jako liczba całkowita: 9 dla 09:37. */
export function clubHour(at: number, day: ClubDayBounds): number {
  return Math.floor(clubHours(at, day));
}

/** Godzina ścienna jako „09:05". Minuty liczą się od pełnej godziny, więc nie kłamią. */
export function clubHhmm(at: number, day: ClubDayBounds): string {
  const total = Math.floor((at - day.startsAt) / MINUTE_MS);
  const h = Math.floor(total / 60);
  const m = total - h * 60;
  return `${pad(h)}:${pad(m)}`;
}

/** Chwila początku podanej godziny ściennej w tej dobie. */
export function clubAtHour(day: ClubDayBounds, hour: number): number {
  return day.startsAt + hour * HOUR_MS;
}

/**
 * Doba zawierająca chwilę; `null`, gdy leży poza oknem, o które pytaliśmy.
 *
 * Granica jest lewostronnie domknięta - ta sama, którą baza wyklucza nakładki
 * (`tstzrange … '[)'`), więc zetknięcie dób co do sekundy należy do doby późniejszej.
 */
export function clubDayAt(days: readonly ClubDayBounds[], at: number): ClubDayBounds | null {
  return days.find((d) => at >= d.startsAt && at < d.endsAt) ?? null;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Przesunięcie strefy klubu wyczytane Z GRANIC DOBY - bez tablicy stref i bez `Intl`.
 *
 * Doba klubu `2026-09-20` zaczyna się dla klubu w +02:00 o `2026-09-19T22:00Z`, więc
 * różnica między północą UTC tej daty a początkiem doby JEST offsetem. To jedyne
 * miejsce, w którym go w ogóle potrzebujemy - reszta modułu liczy godziny odejmowaniem.
 */
export function clubOffset(day: ClubDayBounds): number {
  return Date.parse(`${day.date}T00:00:00Z`) - day.startsAt;
}

/**
 * Chwila przesunięta tak, że jej DATA UTC jest datą KLUBU - do nazwania DNIA, nigdy
 * godziny.
 *
 * ══ OFFSET POCHODZI Z OGLĄDANEJ DOBY ══
 * Data odległa o miesiące może leżeć po drugiej stronie zmiany czasu i wyjść wtedy
 * o godzinę obok. Do nazwania dnia to wystarcza (godzina błędu przesuwa datę tylko
 * dla chwil tuż przy północy), a do godziny i tak używamy `clubHhmm` na WŁAŚCIWEJ
 * dobie. Ten sam rachunek i ten sam koszt, co przy oknie domyślnym w `dayWindow.ts`.
 */
export function clubInstant(at: number, day: ClubDayBounds): number {
  return at + clubOffset(day);
}
