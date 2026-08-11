/**
 * UZ Aero — norma zużycia samolotu w aplikacji pilota (mockupy 04, 06, 10).
 *
 * Norma przychodzi z serwera policzona (analityka `A10a`) — ten moduł jej NIE LICZY.
 * Zamienia ją na trzy rzeczy, których potrzebują ekrany: werdykt („w normie" / „powyżej"),
 * podpis z zakresem i szacunek, na ile jeszcze paliwa starczy.
 *
 * ══ ZASADA NADRZĘDNA: LICZNIK FIZYCZNY WYGRYWA ══
 * Wszystko tutaj jest PODPOWIEDZIĄ (`CLAUDE.md`: liczniki fizyczne > dane z serwera).
 * Szacunek wystarczalności nie jest przyrządem i nie ma prawa nim wyglądać — dlatego
 * ekran pokazuje go jako zdanie obok odczytu, a nie jako wskaźnik ze skalą.
 *
 * ══ `null` ZNACZY „NIE MA CZEGO POKAZAĆ" ══
 * I to jest w każdej funkcji tego modułu wynik pełnoprawny, nie awaria. Ekran ma wtedy
 * MILCZEĆ o normie. Liczba wzięta z sufitu przy planowaniu paliwa jest gorsza od jej
 * braku — pilot bez podpowiedzi policzy sam, pilot ze złą podpowiedzią może jej zaufać.
 */

import type { ConsumptionNorm } from '../../../domain';

/** Rezerwa, od której liczymy „na ile jeszcze starczy" (45 min lotu). */
export const RESERVE_MINUTES = 45;

const HOUR_MS = 3_600_000;

/** Werdykt porównania dzisiejszego wyniku z normą samolotu. */
export type NormVerdict = 'w-normie' | 'powyzej' | 'ponizej';

/**
 * Porównuje zużycie z pasmem normy. `null`, gdy nie ma z czym porównać.
 *
 * Pasmo to 10.–90. centyl zaobserwowanych interwałów, a nie przedział ufności stawki —
 * pytanie brzmi „czy dzisiejszy wynik mieści się w tym, co ta maszyna zwykle pokazuje",
 * a nie „jak dokładnie znamy jej średnią".
 */
export function compareToNorm(
  lPerH: number | null,
  norm: ConsumptionNorm | null,
): NormVerdict | null {
  if (lPerH == null || norm == null) return null;
  if (lPerH < norm.blockLPerHLow) return 'ponizej';
  if (lPerH > norm.blockLPerHHigh) return 'powyzej';
  return 'w-normie';
}

/** Napis werdyktu — dosłownie z mockupu 06 („✓ w normie"). */
export function verdictLabel(verdict: NormVerdict | null): string | null {
  switch (verdict) {
    case 'w-normie':
      return '✓ w normie';
    case 'powyzej':
      return '↑ powyżej normy';
    case 'ponizej':
      return '↓ poniżej normy';
    default:
      return null;
  }
}

/**
 * Samo PASMO normy — „15–17 L/h".
 *
 * Zaokrąglenie do pełnych litrów jest celowe: pasmo pochodzi z par odczytów
 * paliwomierza, a ten nie ma dokładności uzasadniającej miejsce po przecinku.
 *
 * Istnieje obok `normLabel`, bo rozliczenie samolotu (09B) stawia pasmo w jednym
 * wierszu obok wyniku sesji („22,7 L/h · norma 20–24 L/h") i pełne zdanie z oknem
 * obserwacji rozpychałoby ten wiersz na dwie linie. `normLabel` składa się z tej
 * funkcji, więc zaokrąglenie jest jedno i nie ma jak się rozjechać.
 */
export function normBandLabel(norm: ConsumptionNorm | null): string | null {
  if (norm == null) return null;
  const low = Math.round(norm.blockLPerHLow);
  const high = Math.round(norm.blockLPerHHigh);
  return `${low === high ? `${low}` : `${low}–${high}`} L/h`;
}

/**
 * Podpis normy — „norma tego samolotu 15–17 L/h · 90 dni".
 */
export function normLabel(norm: ConsumptionNorm | null): string | null {
  const band = normBandLabel(norm);
  if (band == null || norm == null) return null;
  return `norma tego samolotu ${band} · ${norm.windowDays} dni`;
}

/**
 * Ile jeszcze wyniesień zmieści się w paliwie na pokładzie, przy zachowanej rezerwie.
 *
 * `null`, gdy nie ma normy, nie ma metryki „paliwo na lot" albo brakuje stawki lotu
 * do policzenia rezerwy. `0` znaczy co innego niż `null`: „paliwa starczy na rezerwę,
 * ale nie na kolejny lot" — i to jest informacja, którą pilot chce zobaczyć.
 *
 * Rezerwę liczymy stawką LOTU, nie bloku: 45 minut rezerwy to 45 minut w powietrzu,
 * a stawka blokowa (rozcieńczona kołowaniem) zaniżyłaby jej wartość, czyli zawyżyła
 * liczbę wyniesień. Błąd w tę stronę jest niedopuszczalny.
 */
export function liftsRemaining(
  fobL: number | null,
  norm: ConsumptionNorm | null,
  reserveMinutes: number = RESERVE_MINUTES,
): number | null {
  if (fobL == null || norm == null) return null;
  if (norm.airLPerH == null || norm.litersPerFlight == null) return null;
  if (norm.litersPerFlight <= 0) return null;

  const reserveL = (reserveMinutes / 60) * norm.airLPerH;
  const usableL = fobL - reserveL;
  if (usableL < 0) return null; // poniżej rezerwy — to nie jest pytanie o wyniesienia

  return Math.floor(usableL / norm.litersPerFlight);
}

/**
 * Ile czasu lotu zostało do rezerwy (ms). `null` przy braku stawki lotu.
 * Alternatywa dla wyniesień tam, gdzie operacja nie jest skokowa.
 */
export function flightTimeRemainingMs(
  fobL: number | null,
  norm: ConsumptionNorm | null,
  reserveMinutes: number = RESERVE_MINUTES,
): number | null {
  if (fobL == null || norm?.airLPerH == null || norm.airLPerH <= 0) return null;

  const reserveL = (reserveMinutes / 60) * norm.airLPerH;
  const usableL = fobL - reserveL;
  if (usableL < 0) return null;

  return (usableL / norm.airLPerH) * HOUR_MS;
}

/**
 * Zdanie szacunku dla paska paliwa w kokpicie (mockup 04).
 *
 * Preferuje wyniesienia, bo dla dnia skokowego to jednostka, w której pilot myśli;
 * gdy ich nie da się policzyć, schodzi na czas lotu. `null` = brak obu, czyli pasek
 * pokazuje sam odczyt paliwa.
 */
export function enduranceLabel(
  fobL: number | null,
  norm: ConsumptionNorm | null,
  reserveMinutes: number = RESERVE_MINUTES,
): string | null {
  const lifts = liftsRemaining(fobL, norm, reserveMinutes);
  if (lifts != null) {
    return `wystarczy na ~${lifts} ${liftWord(lifts)} do rezerwy ${reserveMinutes} min`;
  }

  const ms = flightTimeRemainingMs(fobL, norm, reserveMinutes);
  if (ms == null) return null;

  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return `wystarczy na ~${hours}:${String(minutes % 60).padStart(2, '0')} lotu do rezerwy ${reserveMinutes} min`;
}

/**
 * Ile minut lotu przed rezerwą zaczynamy ostrzegać kolorem (amber).
 *
 * Godzina zapasu nad rezerwą — tyle, żeby decyzja o tankowaniu zapadła na ziemi między
 * wyniesieniami, a nie w powietrzu przy ostatnim.
 */
export const FUEL_WARN_MINUTES = RESERVE_MINUTES + 60;

/**
 * Kolor odczytu paliwa: `red` przy rezerwie, `amber` godzinę przed nią, `neutral` wyżej.
 * `null` = nie ma normy, więc nie ma czym pokolorować — odczyt zostaje bez tonu.
 *
 * ══ DLACZEGO PALIWO NIE JEST AMBER ZAWSZE ══
 * Do issue #19 komórka „Fuel on board" i pasek na ziemi były pomarańczowe niezależnie od
 * tego, ile tego paliwa jest. Kolor ostrzegawczy, który świeci przy pełnych zbiornikach,
 * przestaje cokolwiek znaczyć — a wtedy nie znaczy też wtedy, gdy zaczyna być groźnie.
 * Ton wynika więc z SZACUNKU CZASU LOTU: pilot i tak myśli minutami, nie litrami.
 *
 * Liczymy CAŁY czas lotu z paliwa na pokładzie (rezerwa = 0), a progi ustawiamy na
 * rezerwie i godzinę przed nią. Wynik czyta się wprost: czerwony = zostało tyle, ile
 * wynosi rezerwa. Szacunek pozostaje szacunkiem — paliwomierz decyduje (`CLAUDE.md`).
 */
export function fuelTone(
  fobL: number | null,
  norm: ConsumptionNorm | null,
): 'red' | 'amber' | 'neutral' | null {
  const ms = flightTimeRemainingMs(fobL, norm, 0);
  if (ms == null) return null;

  const minutes = ms / 60_000;
  if (minutes <= RESERVE_MINUTES) return 'red';
  if (minutes <= FUEL_WARN_MINUTES) return 'amber';
  return 'neutral';
}

/** Trzy formy polskiej liczby mnogiej — jak `flightsBadge` w statystykach dnia. */
function liftWord(count: number): string {
  if (count === 1) return 'wyniesienie';
  const tens = count % 100;
  const ones = count % 10;
  const few = ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14);
  return few ? 'wyniesienia' : 'wyniesień';
}
