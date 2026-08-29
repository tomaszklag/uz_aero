/**
 * UZ Aero - RACHUNKI paliwa i motogodzin na ekranie sesji (mockup `design/10-statystyki.html`).
 *
 * ══ DLACZEGO JEDEN MODUŁ NA DWIE WIELKOŚCI (issue #38 pkt 5) ══
 * Bo to jedno pytanie zadane dwa razy: „ile ubyło i czy tyle powinno". Do issue #38
 * paliwo miało siatkę czterech wielkich kafli, a motogodziny trzy wiersze tekstu -
 * różnicę uzasadniała wyłącznie kolejność, w jakiej te sekcje powstawały. Wspólny typ
 * wyniku wymusza wspólną formę na ekranie i nie pozwala im się znowu rozejść.
 *
 * ══ CZEGO TU NIE MA ══
 * Liczenia normy. Oczekiwanie i pasmo liczy domena (`consumption/expectation.ts`) z liczb,
 * które przyszły z serwera; ten moduł zamienia wynik na napisy. Gdyby liczył sam, telefon
 * i panel odpowiadałyby na to samo pytanie dwiema arytmetykami.
 *
 * ══ `null` ZNACZY „NIE MA CZEGO POKAZAĆ" ══
 * I ekran wtedy MILCZY o normie zamiast pokazywać zero albo kreskę bez wyjaśnienia -
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

/** Werdykt - na karcie zostaje z niego SAMA plakietka (issue #40 pkt 7 i 8). */
export interface BalanceVerdict {
  /** „✓ W NORMIE" / „↑ POWYŻEJ NORMY" / „↓ PONIŻEJ NORMY". */
  label: string;
  tone: Tone;
}

/** Wiersz arkusza normy (mockup `design/10c-norma-detale.html`). */
export interface BalanceDetailRow {
  label: string;
  value: string;
}

/**
 * Treść arkusza pod plakietką werdyktu.
 *
 * ══ DLACZEGO POD TAPNIĘCIEM (issue #40 pkt 7 i 8) ══
 * Pasmo („23 – 35 L") i rozpisane działanie stały pod KAŻDYM rachunkiem na stałe - dwie
 * linijki drobnego monospace'u, które przy normalnej sesji nie mówią pilotowi nic ponad
 * to, co mówi jedno słowo „w normie". Pytanie „czy dobrze" ma odtąd odpowiedź na karcie,
 * a pytanie „dlaczego tak" - w arkuszu, otwieranym przez tego, kto je zadaje.
 */
export interface BalanceDetails {
  /** „NORMA PALIWA" / „NORMA MOTOGODZIN". */
  title: string;
  /** Zdanie streszczające werdykt - nad wierszami arkusza. */
  summary: string;
  rows: BalanceDetailRow[];
  /** „Jak to liczymy: …" - rozpisane działanie i jego zastrzeżenie. */
  note: string;
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
  /** Szczegóły normy - istnieją dokładnie wtedy, co `verdict`. */
  details: BalanceDetails | null;
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
    verdict: verdictOf(projection.fuel.consumedL, expectation),
    details: fuelDetails(projection, norm, expectation),
    naNote: naNote(projection, norm, expectation, projection.fuel.consumedL != null),
  };
}

/**
 * Bilans motogodzin - TEN SAM kształt co paliwo.
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
    verdict: verdictOf(delta, expectation),
    details: mhDetails(projection, norm, expectation, format),
    naNote: naNote(projection, norm, expectation, delta != null),
  };
}

/** Czasy sesji dla domeny - ziemię wylicza ona sama, żeby nie wyszła ujemna. */
function times(projection: SessionState) {
  return { blockMs: projection.blockTimeMs, flightMs: projection.flightTimeMs };
}

/**
 * Werdykt: wynik pilota kontra pasmo. Na karcie zostaje z tego SAMA plakietka -
 * pasmo, z którego wynika, stoi w arkuszu (`BalanceDetails`).
 *
 * `null`, gdy brakuje którejkolwiek strony porównania - nie zgadujemy ani wyniku
 * (odczyt niespisany), ani pasma (norma niepoliczona).
 */
function verdictOf(actual: number | null, expectation: Expectation | null): BalanceVerdict | null {
  if (actual == null || expectation == null) return null;

  const verdict = expectationVerdict(actual, expectation);
  return {
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

/** To samo słowo w zdaniu, a nie w plakietce - bez strzałek i wersalików. */
const VERDICT_WORD: Record<NormVerdict, string> = {
  'w-normie': 'W normie',
  powyzej: 'Powyżej normy',
  ponizej: 'Poniżej normy',
};

/**
 * Arkusz normy PALIWA: co pilot zużył, czego spodziewał się model, z jakich stawek
 * i na czym one stoją.
 *
 * Rozpisujemy DZIAŁANIE, a nie samą normę (reguła z issue #38 pkt 5, przeniesiona tu
 * z podpisu karty): ma być widać, co z czego wynika. Model zdegradowany do jednej fazy
 * nie ma czego rozpisywać i mówi wtedy o stawce blokowej - to słabsza odpowiedź, ale
 * uczciwa, i arkusz nazywa ją po imieniu.
 */
function fuelDetails(
  projection: SessionState,
  norm: ConsumptionNorm | null,
  expectation: Expectation | null,
): BalanceDetails | null {
  const consumed = projection.fuel.consumedL;
  if (norm == null || expectation == null || consumed == null) return null;

  // Para stawek albo `null` - jeden obiekt zamiast dwóch pól, żeby „mamy fazy" było
  // faktem sprawdzalnym przez typ, a nie flagą, którą trzeba pamiętać obok wartości.
  const phases =
    expectation.basis === 'phases' && norm.airLPerH != null && norm.groundLPerH != null
      ? { air: norm.airLPerH, ground: norm.groundLPerH }
      : null;

  const rows: BalanceDetailRow[] = [
    { label: 'Zużyte w tej sesji', value: litres(consumed) },
    { label: 'Oczekiwane po tej sesji', value: bandOf(expectation, litres) },
    { label: 'Średnia tej sesji', value: `${round(perBlockHour(consumed, projection))} L/h` },
  ];

  if (phases != null) {
    rows.push({ label: 'Norma w locie', value: `${round(phases.air)} L/h` });
    rows.push({ label: 'Norma na ziemi', value: `${round(phases.ground)} L/h` });
  } else {
    rows.push({
      label: 'Norma',
      value: `${round(norm.blockLPerH)} L/h pracy silnika`,
    });
  }
  rows.push({ label: 'Podstawa', value: `${norm.windowDays} dni` });

  const equation =
    phases != null
      ? `${split(projection)} × ${round(phases.air)} L/h + ${ground(projection)} × ${round(phases.ground)} L/h ≈ ${litres(expectation.value)}`
      : `${blockTime(projection)} pracy silnika × ${round(norm.blockLPerH)} L/h ≈ ${litres(expectation.value)}`;

  return {
    title: 'NORMA PALIWA',
    summary: summaryOf(consumed, expectation, litres),
    rows,
    // Zastrzeżenie, nie ozdoba: pasmo jest szersze niż rozrzut samego modelu, bo zużycie
    // sesji to RÓŻNICA dwóch odczytów paliwomierza - a każdy z nich ma własny błąd
    // (podłoga pasma, `consumption/policy.ts`).
    note:
      `Jak to liczymy: ${equation}. Pasmo jest szersze niż rozrzut samego modelu, ` +
      'bo zużycie sesji to różnica dwóch odczytów paliwomierza. Werdykt niczego nie ' +
      'blokuje - to licznik w samolocie ma rację, nie model.',
  };
}

/**
 * Arkusz normy MOTOGODZIN - ten sam kształt, jednostki licznika.
 *
 * Niesie też CHARAKTER licznika, bo to on tłumaczy, dlaczego oczekiwanie bywa mniejsze
 * od czasu blokowego. Format odczytu (dziesiętny / hh:mm) nie ma z tym nic wspólnego -
 * mówi, jak licznik WYŚWIETLA, a nie jak zlicza; typ wykrywamy z danych
 * (`consumption/mhModel.ts`), nikt go nie konfiguruje.
 */
function mhDetails(
  projection: SessionState,
  norm: ConsumptionNorm | null,
  expectation: Expectation | null,
  format: MhFormat,
): BalanceDetails | null {
  const delta = projection.mh.deltaH;
  if (norm?.mh == null || expectation == null || delta == null) return null;

  const signed = (value: number) => signedMh(value, format);
  const sessions = `${norm.mh.sessions} ${plural(norm.mh.sessions, 'sesja', 'sesje', 'sesji')}`;

  return {
    title: 'NORMA MOTOGODZIN',
    summary: summaryOf(delta, expectation, signed),
    rows: [
      { label: 'Przyrost w tej sesji', value: signed(delta) },
      { label: 'Oczekiwane po tej sesji', value: bandOf(expectation, signed) },
      {
        label: 'Średnia tej sesji',
        value: `${rate(perBlockHour(delta, projection))} MH/h`,
      },
      { label: 'Przelicznik w locie', value: `${rate(norm.mh.perFlightHour)} MH/h` },
      { label: 'Przelicznik na ziemi', value: `${rate(norm.mh.perGroundHour)} MH/h` },
      { label: 'Podstawa', value: `${sessions} · ${COUNTER_LABEL[norm.mh.kind]}` },
    ],
    note:
      `Jak to liczymy: ${split(projection)} × ${rate(norm.mh.perFlightHour)} + ` +
      `${ground(projection)} × ${rate(norm.mh.perGroundHour)} MH/h ≈ ${signed(expectation.value)}. ` +
      'Licznik na wolnych obrotach przyrasta wolniej niż zegar, więc przyrost mniejszy ' +
      'od czasu blokowego jest poprawnym działaniem przyrządu, a nie pomyłką.',
  };
}

/**
 * „W normie - 27 L przy oczekiwanych 23 L – 35 L. …"
 *
 * Drugie zdanie mówi, NA CZYM pasmo stoi: model zdegradowany do jednej fazy odpowiada
 * słabiej i pilot ma prawo o tym wiedzieć, zanim uzna werdykt za wyrok.
 */
function summaryOf(
  actual: number,
  expectation: Expectation,
  format: (value: number) => string,
): string {
  const word = VERDICT_WORD[expectationVerdict(actual, expectation)];
  const tail =
    expectation.basis === 'phases'
      ? 'Pasmo liczy się dla TEJ mieszanki faz, nie dla średniej sesji tego samolotu.'
      : 'Model nie rozdzielił jeszcze faz, więc pasmo opisuje samą godzinę pracy silnika.';
  return `${word} - ${format(actual)} przy oczekiwanych ${bandOf(expectation, format)}. ${tail}`;
}

/** „23 – 35 L" / „+1:21 – +1:33". */
function bandOf(expectation: Expectation, format: (value: number) => string): string {
  return `${format(expectation.low)} – ${format(expectation.high)}`;
}

/**
 * Wynik przeliczony na godzinę pracy silnika - jedyna liczba arkusza policzona lokalnie,
 * a nie przysłana. Stoi obok stawek normy po to, żeby dało się je porównać wprost.
 */
function perBlockHour(value: number, projection: SessionState): number {
  const hours = projection.blockTimeMs / 3_600_000;
  return hours > 0 ? value / hours : 0;
}

const COUNTER_LABEL: Record<'hobbs' | 'tach' | 'unknown', string> = {
  hobbs: 'licznik godzinowy',
  tach: 'licznik obrotomierzowy',
  unknown: 'typ licznika nierozpoznany',
};

/**
 * Dlaczego werdyktu nie ma. Trzy różne powody, trzy różne zdania - „-" bez wyjaśnienia
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
    return 'Nie porównujemy z normą - silnik nie pracował, a norma opisuje godzinę jego pracy.';
  }
  if (!hasActual) {
    return 'Nie porównujemy z normą - brakuje odczytu przy zdaniu samolotu.';
  }
  if (norm == null || expectation == null) {
    return 'Nie porównujemy z normą - ten samolot nie ma jeszcze policzonej normy.';
  }
  return null;
}

/**
 * „1:16 lotu" - czas w powietrzu jako składnik działania.
 *
 * `duration`, nie `hhmm`: przypis jest ZDANIEM, a nie kolumną tabeli, więc wiodące zero
 * („01:16 lotu") niczego tu nie wyrównuje, a czyta się jak stempel czasu.
 */
function split(projection: SessionState): string {
  return `${duration(Math.min(projection.flightTimeMs, projection.blockTimeMs))} lotu`;
}

/** „0:27 ziemi" - reszta biegu silnika, nigdy ujemna (ta sama reguła co w domenie). */
function ground(projection: SessionState): string {
  return `${duration(Math.max(0, projection.blockTimeMs - projection.flightTimeMs))} ziemi`;
}

/** „1:43" - cały bieg silnika; potrzebne, gdy model nie rozdzielił faz. */
function blockTime(projection: SessionState): string {
  return duration(projection.blockTimeMs);
}

/** Stawka paliwa bez miejsc po przecinku - paliwomierz nie ma takiej dokładności. */
function round(value: number): string {
  return String(Math.round(value));
}

/** Przelicznik licznika z dwoma miejscami, po polsku („1,00"). */
function rate(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Przyrost licznika ze znakiem - „+1:35" / „−0:10" / „-". */
function signedMh(value: number | null, format: MhFormat): string {
  if (value == null) return '-';
  const sign = value < 0 ? '−' : '+';
  return `${sign}${motoHours(Math.abs(value), format)}`;
}

/** „2 tankowania" - odmiana z pakietu formatów, żeby nie było drugiej reguły. */
function refuelLabel(count: number): string {
  return `${count} ${plural(count, 'tankowanie', 'tankowania', 'tankowań')}`;
}
