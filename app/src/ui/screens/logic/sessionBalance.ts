/**
 * UZ Aero — RACHUNKI paliwa i motogodzin na ekranie sesji (mockup `design/10-statystyki.html`).
 *
 * ══ DLACZEGO JEDEN MODUŁ NA DWIE WIELKOŚCI (issue #38 pkt 5) ══
 * Bo to jedno pytanie zadane dwa razy: „ile ubyło i czy tyle powinno". Do issue #38
 * paliwo miało siatkę czterech wielkich kafli, a motogodziny trzy wiersze tekstu —
 * różnicę uzasadniała wyłącznie kolejność, w jakiej te sekcje powstawały. Wspólny typ
 * wyniku wymusza wspólną formę na ekranie i nie pozwala im się znowu rozejść.
 *
 * ══ CZEGO TU NIE MA ══
 * Liczenia normy. Oczekiwanie i pasmo liczy domena (`consumption/expectation.ts`) z liczb,
 * które przyszły z serwera; ten moduł zamienia wynik na napisy. Gdyby liczył sam, telefon
 * i panel odpowiadałyby na to samo pytanie dwiema arytmetykami.
 *
 * ══ `null` ZNACZY „NIE MA CZEGO POKAZAĆ" ══
 * I ekran wtedy MILCZY o normie zamiast pokazywać zero albo kreskę bez wyjaśnienia —
 * ta sama reguła, co w `fuelNorm.ts`. Sesja bez pracy silnika (09C) nie ma z czym
 * porównywać zużycia i mówi to wprost.
 */

import {
  expectationVerdict,
  expectedFuelL,
  expectedMhH,
  type ConsumptionNorm,
  type Expectation,
  type MhFormat,
  type NormVerdict,
  type SessionState,
} from '../../../domain';
import type { Tone } from '../../components';
import { duration, litres, motoHours, plural } from '../../format';

/** Przesłanka rachunku: „+ Dolane · 2 tankowania … 48 L". */
export interface BalanceRow {
  id: string;
  /** Znak działania przed etykietą; pusty dla pierwszego wiersza. */
  op: '' | '+' | '−';
  label: string;
  value: string;
}

/** Werdykt razem z pasmem, z którego wynika. */
export interface BalanceVerdict {
  /** „26 – 32 L" / „+1:22 – +1:31". */
  band: string;
  /** „✓ W NORMIE" / „↑ POWYŻEJ NORMY" / „↓ PONIŻEJ NORMY". */
  label: string;
  tone: Tone;
}

/** Kompletna treść jednej karty rachunku. */
export interface BalanceView {
  rows: BalanceRow[];
  /** „Zużyte" / „Przyrost". */
  totalLabel: string;
  totalValue: string;
  totalTone: Tone;
  /** `null` = nie ma z czym porównać; wtedy ekran pokazuje `naNote`. */
  verdict: BalanceVerdict | null;
  /** Skąd wzięło się pasmo — pod werdyktem, drobnym monospace. */
  note: string | null;
  /** Dlaczego werdyktu nie ma. Wykluczające się z `verdict`. */
  naNote: string | null;
}

/**
 * Bilans paliwa: odczyt → dolewki → odczyt = zużyte, a pod spodem oczekiwanie.
 *
 * Wiersz dolewek pokazujemy ZAWSZE, także przy zerze: „0 L dolane" jest odpowiedzią na
 * pytanie, które pilot i tak sobie zada, a jego brak kazałby zgadywać, czy tankowania
 * nie było, czy nie zostało zapisane.
 */
export function fuelBalance(
  projection: SessionState,
  norm: ConsumptionNorm | null,
  refuelCount: number,
): BalanceView {
  const expectation = expectedFuelL(norm, times(projection));

  return {
    rows: [
      {
        id: 'start',
        op: '',
        label: 'Odczyt przy przejęciu',
        value: litres(projection.fuel.startL),
      },
      {
        id: 'added',
        op: '+',
        label: refuelCount > 0 ? `Dolane · ${refuelLabel(refuelCount)}` : 'Dolane',
        value: litres(projection.fuel.addedL),
      },
      {
        id: 'end',
        op: '−',
        label: 'Odczyt przy zdaniu',
        value: litres(projection.fuel.endL),
      },
    ],
    totalLabel: 'Zużyte',
    totalValue: litres(projection.fuel.consumedL),
    totalTone: 'amber',
    verdict: verdictOf(projection.fuel.consumedL, expectation, litres),
    note: fuelNote(projection, norm, expectation),
    naNote: naNote(projection, norm, expectation, projection.fuel.consumedL != null),
  };
}

/**
 * Bilans motogodzin — TEN SAM kształt co paliwo.
 *
 * ══ CO TU ZNIKŁO (issue #38 pkt 4) ══
 * Wiersz „Δ sesji (= czas blokowy 01:35)". Przyrost licznika NIE równa się czasowi
 * blokowemu i nie ma prawa się równać: obrotomierz na wolnych obrotach przyrasta wolniej
 * niż zegar (`consumption/mhModel.ts`). Ekran nazywał więc poprawny odczyt rozjazdem,
 * a pilotowi, który wpisał to, co widział na tarczy, sugerował błąd.
 */
export function mhBalance(projection: SessionState, norm: ConsumptionNorm | null): BalanceView {
  const format: MhFormat = projection.mhFormat ?? 'decimal';
  const expectation = expectedMhH(norm, times(projection));
  const delta = projection.mh.deltaH;

  return {
    rows: [
      {
        id: 'start',
        op: '',
        label: 'Licznik przy przejęciu',
        value: motoHours(projection.mh.start, format),
      },
      {
        id: 'end',
        op: '−',
        label: 'Licznik przy zdaniu',
        value: motoHours(projection.mh.end, format),
      },
    ],
    totalLabel: 'Przyrost',
    totalValue: signedMh(delta, format),
    totalTone: delta != null && delta > 0 ? 'green' : 'neutral',
    verdict: verdictOf(delta, expectation, (v) => signedMh(v, format)),
    note: mhNote(projection, norm, expectation),
    naNote: naNote(projection, norm, expectation, delta != null),
  };
}

/** Czasy sesji dla domeny — ziemię wylicza ona sama, żeby nie wyszła ujemna. */
function times(projection: SessionState) {
  return { blockMs: projection.blockTimeMs, flightMs: projection.flightTimeMs };
}

/**
 * Werdykt: wynik pilota kontra pasmo.
 *
 * `null`, gdy brakuje którejkolwiek strony porównania — nie zgadujemy ani wyniku
 * (odczyt niespisany), ani pasma (norma niepoliczona).
 */
function verdictOf(
  actual: number | null,
  expectation: Expectation | null,
  format: (value: number) => string,
): BalanceVerdict | null {
  if (actual == null || expectation == null) return null;

  const verdict = expectationVerdict(actual, expectation);
  return {
    band: `${format(expectation.low)} – ${format(expectation.high)}`,
    label: VERDICT_LABEL[verdict],
    // Amber, nie czerwień: wynik poza pasmem jest do SPRAWDZENIA, a nie błędny.
    // Licznik i paliwomierz są przyrządami fizycznymi i to one mają rację
    // (`CLAUDE.md`: liczniki fizyczne > dane z serwera).
    tone: verdict === 'w-normie' ? 'green' : 'amber',
  };
}

const VERDICT_LABEL: Record<NormVerdict, string> = {
  'w-normie': '✓ W NORMIE',
  powyzej: '↑ POWYŻEJ NORMY',
  ponizej: '↓ PONIŻEJ NORMY',
};

/**
 * Skąd wzięło się pasmo paliwa: „1:16 lotu × 20 L/h + 0:27 ziemi × 8 L/h · norma z 90 dni".
 *
 * Rozpisujemy działanie, a nie samą normę, bo o to prosił issue #38 pkt 5: ma być widać,
 * co z czego wynika. Model zdegradowany do jednej fazy nie ma czego rozpisywać i mówi
 * wtedy o stawce blokowej — to słabsza odpowiedź, ale uczciwa.
 */
function fuelNote(
  projection: SessionState,
  norm: ConsumptionNorm | null,
  expectation: Expectation | null,
): string | null {
  if (norm == null || expectation == null) return null;

  const window = `norma z ${norm.windowDays} dni`;
  if (expectation.basis === 'engine' || norm.airLPerH == null || norm.groundLPerH == null) {
    return `${round(norm.blockLPerH)} L/h na godzinę pracy silnika · ${window}`;
  }

  return `${split(projection)} × ${round(norm.airLPerH)} L/h + ${ground(projection)} × ${round(norm.groundLPerH)} L/h · ${window}`;
}

/**
 * To samo dla motogodzin, w jednostce licznika: „× 1,00 + × 0,40 MH/h".
 *
 * Podpis niesie też CHARAKTER licznika, bo to on tłumaczy, dlaczego oczekiwanie jest
 * mniejsze od czasu blokowego. Format odczytu (dziesiętny / hh:mm) nie ma z tym nic
 * wspólnego — mówi, jak licznik WYŚWIETLA, a nie jak zlicza; typ wykrywamy z danych
 * (`consumption/mhModel.ts`), nikt go nie konfiguruje.
 */
function mhNote(
  projection: SessionState,
  norm: ConsumptionNorm | null,
  expectation: Expectation | null,
): string | null {
  if (norm?.mh == null || expectation == null) return null;

  const counter = COUNTER_LABEL[norm.mh.kind];
  const sessions = `${norm.mh.sessions} ${plural(norm.mh.sessions, 'sesja', 'sesje', 'sesji')}`;
  const rates = `${split(projection)} × ${rate(norm.mh.perFlightHour)} + ${ground(projection)} × ${rate(norm.mh.perGroundHour)} MH/h`;

  return `${rates} · ${counter} · ${sessions}`;
}

const COUNTER_LABEL: Record<'hobbs' | 'tach' | 'unknown', string> = {
  hobbs: 'licznik godzinowy',
  tach: 'licznik obrotomierzowy',
  unknown: 'typ licznika nierozpoznany',
};

/**
 * Dlaczego werdyktu nie ma. Trzy różne powody, trzy różne zdania — „—" bez wyjaśnienia
 * wygląda jak awaria aplikacji (§6 pkt 3).
 */
function naNote(
  projection: SessionState,
  norm: ConsumptionNorm | null,
  expectation: Expectation | null,
  hasActual: boolean,
): string | null {
  if (expectation != null && hasActual) return null;

  if (projection.blockTimeMs <= 0) {
    return 'Nie porównujemy z normą — silnik nie pracował, a norma opisuje godzinę jego pracy.';
  }
  if (!hasActual) {
    return 'Nie porównujemy z normą — brakuje odczytu przy zdaniu samolotu.';
  }
  if (norm == null || expectation == null) {
    return 'Nie porównujemy z normą — ten samolot nie ma jeszcze policzonej normy.';
  }
  return null;
}

/**
 * „1:16 lotu" — czas w powietrzu jako składnik działania.
 *
 * `duration`, nie `hhmm`: przypis jest ZDANIEM, a nie kolumną tabeli, więc wiodące zero
 * („01:16 lotu") niczego tu nie wyrównuje, a czyta się jak stempel czasu.
 */
function split(projection: SessionState): string {
  return `${duration(Math.min(projection.flightTimeMs, projection.blockTimeMs))} lotu`;
}

/** „0:27 ziemi" — reszta biegu silnika, nigdy ujemna (ta sama reguła co w domenie). */
function ground(projection: SessionState): string {
  return `${duration(Math.max(0, projection.blockTimeMs - projection.flightTimeMs))} ziemi`;
}

/** Stawka paliwa bez miejsc po przecinku — paliwomierz nie ma takiej dokładności. */
function round(value: number): string {
  return String(Math.round(value));
}

/** Przelicznik licznika z dwoma miejscami, po polsku („1,00"). */
function rate(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Przyrost licznika ze znakiem — „+1:35" / „−0:10" / „—". */
function signedMh(value: number | null, format: MhFormat): string {
  if (value == null) return '—';
  const sign = value < 0 ? '−' : '+';
  return `${sign}${motoHours(Math.abs(value), format)}`;
}

/** „2 tankowania" — odmiana z pakietu formatów, żeby nie było drugiej reguły. */
function refuelLabel(count: number): string {
  return `${count} ${plural(count, 'tankowanie', 'tankowania', 'tankowań')}`;
}
