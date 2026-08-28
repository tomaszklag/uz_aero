/**
 * UZ Aero — NORMA ZUŻYCIA DLA WPISU RĘCZNEGO (issue #62, piąta tura z urządzenia).
 *
 * „W oparciu o te dane oraz dane z czasu lotu powinniśmy przeliczyć normę i sprawdzić,
 * czy się zgadza" — do tej tury krok 4 pokazywał samo zużycie („76 L") i nie mówił
 * ani słowa o tym, czy to dużo. Pilot dowiadywał się tego dopiero na ekranie rozliczenia,
 * po zapisaniu — czyli wtedy, gdy poprawka kosztuje już wejście w tryb edycji.
 *
 * ══ TA SAMA ARYTMETYKA, CO NA EKRANIE SESJI ══
 * Oczekiwanie i pasmo liczy DOMENA (`consumption/expectation.ts`) z normy, którą serwer
 * policzył z historii tej maszyny; ten moduł zamienia wynik na napisy. Gdyby liczył sam,
 * wpis ręczny i rozliczenie tej samej sesji odpowiadałyby na to samo pytanie dwiema
 * arytmetykami — a to jest dokładnie ta wada, którą issue #38 usuwało z ekranu 10.
 *
 * ══ DZIAŁA OFFLINE ══
 * Norma mieszka w cache referencyjnym (`ReferenceAircraft.consumption`), więc werdykt
 * powstaje bez sieci. Jest to jednak DANA Z SERWERA, więc obowiązuje ją triada świeżości
 * (§4.8) — wiek cache podaje wołający, tak samo jak przy ostrzeżeniach łańcucha.
 *
 * ══ `null` ZNACZY „NIE MA CZEGO POKAZAĆ" ══
 * I ekran wtedy MILCZY, zamiast pokazywać zero albo kreskę bez wyjaśnienia. Brak normy
 * (maszyna nie uzbierała jeszcze historii) nie jest brakiem danych pilota i nie ma prawa
 * wyglądać jak jego błąd.
 */

import {
  expectationVerdict,
  expectedFuelL,
  expectedMhH,
  type ConsumptionNorm,
  type Expectation,
  type MhFormat,
  type NormVerdict,
  type SessionPhaseTimes,
} from '../../../domain';
import type { Tone } from '../../components';
import { litres, motoHours } from '../../format';
import type { ManualFlightDraft } from './manualFlight';
import { sortedFlights } from './manualFlight';
import { fuelUsedL } from './manualFuelChain';

/** Werdykt normy — plakietka przy wyniku, ten sam napis co na ekranie sesji. */
export interface ManualVerdict {
  label: string;
  tone: Tone;
}

/** Porównanie jednej wielkości z normą; `expected` `null` = norma milczy. */
export interface ManualBalance {
  /** „Zużycie paliwa" / „Przyrost licznika". */
  label: string;
  /** Ile wyszło z wpisu („76 L", „1:36"). */
  actual: string;
  /** „oczekiwane 68 L · pasmo 58 – 79 L"; `null` = nie ma z czym porównać. */
  expected: string | null;
  verdict: ManualVerdict | null;
}

const VERDICT_LABEL: Record<NormVerdict, string> = {
  'w-normie': '✓ W NORMIE',
  powyzej: '↑ POWYŻEJ NORMY',
  ponizej: '↓ PONIŻEJ NORMY',
};

/**
 * Czasy faz sesji ze szkicu; `null` = biegu silnika nie ma, więc nie ma czego liczyć.
 *
 * Czas w powietrzu to suma lotów, a ziemię domena wylicza sama z różnicy — patrz
 * `SessionPhaseTimes`. Ujemnego bloku nie przepuszczamy: para godzin w odwrotnej
 * kolejności jest blokadą arkusza, a tu byłaby oczekiwaniem policzonym z bzdury.
 */
export function manualPhaseTimes(draft: ManualFlightDraft): SessionPhaseTimes | null {
  if (draft.engineStart == null || draft.engineStop == null) return null;
  const blockMs = draft.engineStop - draft.engineStart;
  if (blockMs <= 0) return null;

  const flightMs = sortedFlights(draft).reduce(
    (sum, f) => sum + Math.max(0, f.landing - f.takeoff),
    0,
  );
  return { blockMs, flightMs };
}

/**
 * Zużycie paliwa wobec normy. `null`, gdy nie ma kompletu odczytów albo biegu silnika —
 * ekran nie pokazuje wtedy karty w ogóle.
 */
export function manualFuelBalance(
  draft: ManualFlightDraft,
  norm: ConsumptionNorm | null,
): ManualBalance | null {
  const used = fuelUsedL(draft);
  const times = manualPhaseTimes(draft);
  if (used == null || times == null) return null;

  const expectation = expectedFuelL(norm, times);
  return {
    label: 'Zużycie paliwa',
    actual: litres(used),
    expected: expectation != null ? expectedText(expectation, litres) : null,
    verdict: verdictOf(used, expectation),
  };
}

/**
 * Przyrost licznika wobec normy.
 *
 * ══ PRZYROST NIE RÓWNA SIĘ CZASOWI BLOKOWEMU ══
 * I nie ma prawa się równać: obrotomierz na wolnych obrotach przyrasta wolniej niż zegar
 * (`consumption/mhModel.ts`). Dlatego porównujemy z NORMĄ tej maszyny, a nie z blokiem —
 * ta sama poprawka, którą issue #38 wprowadziło na ekranie 10.
 */
export function manualMhBalance(
  draft: ManualFlightDraft,
  norm: ConsumptionNorm | null,
  format: MhFormat,
): ManualBalance | null {
  const times = manualPhaseTimes(draft);
  if (draft.mhBefore == null || draft.mhAfter == null || times == null) return null;

  const delta = draft.mhAfter - draft.mhBefore;
  const expectation = expectedMhH(norm, times);
  return {
    label: 'Przyrost licznika',
    actual: motoHours(delta, format),
    expected:
      expectation != null ? expectedText(expectation, (v) => motoHours(v, format)) : null,
    verdict: verdictOf(delta, expectation),
  };
}

/** „oczekiwane 68 L · pasmo 58 – 79 L" — wynik i to, co jeszcze uchodzi za normalne. */
function expectedText(expectation: Expectation, format: (v: number) => string): string {
  return `oczekiwane ${format(expectation.value)} · pasmo ${format(expectation.low)} – ${format(
    expectation.high,
  )}`;
}

function verdictOf(actual: number, expectation: Expectation | null): ManualVerdict | null {
  if (expectation == null) return null;
  const verdict = expectationVerdict(actual, expectation);
  return {
    label: VERDICT_LABEL[verdict],
    /* Amber, nie czerwień: wynik poza pasmem jest DO SPRAWDZENIA, a nie błędny.
       Paliwomierz i licznik są przyrządami fizycznymi i to one mają rację
       (`CLAUDE.md`: liczniki fizyczne > dane z serwera). */
    tone: verdict === 'w-normie' ? 'green' : 'amber',
  };
}
