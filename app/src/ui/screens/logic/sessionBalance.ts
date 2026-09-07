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
 * I ekran wtedy MILCZY o normie - od issue #69 dosłownie, bez zdania „Nie porównujemy
 * z normą…": brak normy czy przeliczników to zwykły stan młodej maszyny (nie brak
 * danych pilota), a brak odczytu widać w wierszu rachunku tuż wyżej. Jedyny powód,
 * który mówi o sobie wprost, to zerowy bieg silnika (09C) - patrz `naNote` na dole.
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
  /** `null` = nie ma z czym porównać. */
  verdict: BalanceVerdict | null;
  /** Szczegóły normy - istnieją dokładnie wtedy, co `verdict`. */
  details: BalanceDetails | null;
  /**
   * Dlaczego werdyktu nie ma - od issue #69 WYŁĄCZNIE przy zerowym biegu silnika;
   * pozostałe braki milczą. Wykluczające się z `verdict`.
   */
  naNote: string | null;
}

/**
 * Bilans paliwa: odczyt → dolewki → odczyt = zużyte, a pod spodem oczekiwanie.
 *
 * Wiersz dolewek pokazujemy ZAWSZE, także przy zerze: „0 L dolane" jest odpowiedzią na
 * pytanie, które pilot i tak sobie zada, a jego brak kazałby zgadywać, czy tankowania
 * nie było, czy nie zostało zapisane.
 */
/**
 * ══ CO RACHUNEK NAPRAWDĘ POTRZEBUJE (uwaga z urządzenia, 2026-08-29) ══
 * Zgłoszenie brzmiało: „jak mam wpisanie paliwa, to może odpalisz ten moduł, co przy
 * automatycznym locie?" - i okazało się, że można, bo zależność od `SessionState` była
 * pozorna. Cały ten moduł czyta z projekcji DWIE LICZBY (czas blokowy i czas w powietrzu)
 * plus odczyty, które wpis ręczny ma u siebie w szkicu.
 *
 * Stąd podział: RDZEŃ (`fuelBalanceOf`, `mhBalanceOf`) bierze fakty, a `fuelBalance`
 * i `mhBalance` zostają cienkimi adapterami dla projekcji. Ekran rozliczenia (10) woła
 * je jak dotąd, a krok 4 wpisu ręcznego liczy TĘ SAMĄ arytmetykę ze szkicu - łącznie
 * z arkuszem szczegółów pod plakietką, którego wcześniej nie miał.
 */

/** Czasy faz sesji - z projekcji albo ze szkicu wpisu ręcznego. */
export interface BalanceTimes {
  blockMs: number;
  flightMs: number;
}

/** Odczyty paliwa sesji; `null` = niespisane (i wtedy werdyktu nie ma). */
export interface FuelFacts {
  startL: number | null;
  addedL: number;
  endL: number | null;
  consumedL: number | null;
}

/** Odczyty licznika sesji. */
export interface MhFacts {
  start: number | null;
  end: number | null;
  deltaH: number | null;
}

/**
 * @param nominalLPerH spalanie z dokumentacji jednostki (`ReferenceAircraft.fuelNormLPerH`,
 *   issue #66) - wchodzi WYŁĄCZNIE wtedy, gdy `norm` jest `null`, bo model opisuje TEN
 *   egzemplarz, a dokumentacja typ. Argument jest wymagany, nie opcjonalny: ekran, który
 *   go nie poda, milczy o normie przez pierwsze tygodnie życia maszyny - a to jest
 *   dokładnie ta dziura, którą issue #66 zamyka.
 */
export function fuelBalance(
  projection: SessionState,
  norm: ConsumptionNorm | null,
  refuelCount: number,
  nominalLPerH: number | null,
): BalanceView {
  return fuelBalanceOf(times(projection), projection.fuel, norm, refuelCount, nominalLPerH);
}

/** Rdzeń rachunku paliwa - patrz nota „CO RACHUNEK NAPRAWDĘ POTRZEBUJE" wyżej. */
export function fuelBalanceOf(
  facts: BalanceTimes,
  fuel: FuelFacts,
  norm: ConsumptionNorm | null,
  refuelCount: number,
  nominalLPerH: number | null,
): BalanceView {
  const expectation = expectedFuelL(norm, facts, nominalLPerH);

  return {
    rows: [
      {
        id: 'start',
        op: '',
        label: 'Odczyt przy przejęciu',
        value: litres(fuel.startL),
      },
      {
        id: 'added',
        op: '+',
        label: refuelCount > 0 ? `Dolane · ${refuelLabel(refuelCount)}` : 'Dolane',
        value: litres(fuel.addedL),
      },
      {
        id: 'end',
        op: '−',
        label: 'Odczyt przy zdaniu',
        value: litres(fuel.endL),
      },
    ],
    totalLabel: 'Zużyte',
    totalValue: litres(fuel.consumedL),
    totalTone: 'amber',
    verdict: verdictOf(fuel.consumedL, expectation),
    details: fuelDetails(facts, fuel.consumedL, norm, expectation, nominalLPerH),
    naNote: naNote(facts, expectation, fuel.consumedL != null),
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
  return mhBalanceOf(times(projection), projection.mh, norm, projection.mhFormat ?? 'decimal');
}

/** Rdzeń rachunku motogodzin - patrz nota „CO RACHUNEK NAPRAWDĘ POTRZEBUJE" wyżej. */
export function mhBalanceOf(
  facts: BalanceTimes,
  mh: MhFacts,
  norm: ConsumptionNorm | null,
  format: MhFormat,
): BalanceView {
  const expectation = expectedMhH(norm, facts);
  const delta = mh.deltaH;

  return {
    rows: [
      {
        id: 'start',
        op: '',
        label: 'Licznik przy przejęciu',
        value: motoHours(mh.start, format),
      },
      {
        id: 'end',
        op: '−',
        label: 'Licznik przy zdaniu',
        value: motoHours(mh.end, format),
      },
    ],
    totalLabel: 'Przyrost',
    totalValue: signedMh(delta, format),
    totalTone: delta != null && delta > 0 ? 'green' : 'neutral',
    verdict: verdictOf(delta, expectation),
    details: mhDetails(facts, delta, norm, expectation, format),
    naNote: naNote(facts, expectation, delta != null),
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
  facts: BalanceTimes,
  consumed: number | null,
  norm: ConsumptionNorm | null,
  expectation: Expectation | null,
  nominalLPerH: number | null,
): BalanceDetails | null {
  if (expectation == null || consumed == null) return null;

  const sessionLPerH = perBlockHour(consumed, facts);
  const rows: BalanceDetailRow[] = [
    { label: 'Zużyte w tej operacji', value: litres(consumed) },
    { label: 'Oczekiwane po tej operacji', value: bandOf(expectation, litres) },
    { label: 'Średnia tej operacji', value: `${round(sessionLPerH)} L/h` },
  ];

  /*
   * Model tej maszyny jeszcze nie istnieje - liczymy z dokumentacji (issue #66).
   * Wiersz „Podstawa" mówi to wprost, bo to jest najważniejsza różnica między tym
   * werdyktem a wszystkimi pozostałymi: pasmo jest ZADEKLAROWANE, nie zmierzone.
   */
  if (expectation.basis === 'nominal' || norm == null) {
    // Do tej gałęzi wchodzi się WYŁĄCZNIE z oczekiwaniem policzonym z dokumentacji,
    // a `expectedFuelL` liczy je tylko przy dodatniej stawce - `null` jest tu
    // niemożliwe. Milczymy zamiast podstawiać zero: liczba wzięta z sufitu przy
    // planowaniu paliwa jest gorsza od braku arkusza.
    if (nominalLPerH == null) return null;
    const rate = nominalLPerH;
    rows.push({ label: 'Norma z dokumentacji', value: `${round(rate)} L/h pracy silnika` });
    rows.push({ label: 'Podstawa', value: 'dokumentacja jednostki' });

    return {
      title: 'NORMA PALIWA',
      summary: summaryOf(consumed, expectation, litres),
      rows,
      note:
        `Jak to liczymy: ${blockTime(facts)} pracy silnika × ${round(rate)} L/h ≈ ` +
        `${litres(expectation.value)}. Ta liczba pochodzi z instrukcji użytkowania, ` +
        'a nie z lotów tej maszyny - własną normę policzymy, gdy uzbiera się historia, ' +
        'i wtedy ona zastąpi tę tutaj. Werdykt niczego nie blokuje - to licznik ' +
        'w samolocie ma rację, nie model.',
    };
  }

  // Para stawek albo `null` - jeden obiekt zamiast dwóch pól, żeby „mamy fazy" było
  // faktem sprawdzalnym przez typ, a nie flagą, którą trzeba pamiętać obok wartości.
  const phases =
    expectation.basis === 'phases' && norm.airLPerH != null && norm.groundLPerH != null
      ? { air: norm.airLPerH, ground: norm.groundLPerH }
      : null;

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

  /*
   * Odniesienie do dokumentacji (issue #66): „za pomocą takiej średniej z instrukcji
   * można badać, jakie jest odchylenie nowej średniej oraz średniej z operacji od
   * wartości referencyjnej". Dwa wiersze, nie jeden: pierwszy podaje liczbę, drugi
   * mówi, o ile się od niej odjechało - sklejone dawały wartość na trzy linie.
   */
  if (nominalLPerH != null && nominalLPerH > 0) {
    rows.push({ label: 'Z dokumentacji', value: `${round(nominalLPerH)} L/h pracy silnika` });
    rows.push({
      label: 'Odchyłka od dokumentacji',
      value: [
        `ta operacja ${percentOff(sessionLPerH, nominalLPerH)}`,
        `norma maszyny ${percentOff(norm.blockLPerH, nominalLPerH)}`,
      ].join(' · '),
    });
  }

  const equation =
    phases != null
      ? `${split(facts)} × ${round(phases.air)} L/h + ${ground(facts)} × ${round(phases.ground)} L/h ≈ ${litres(expectation.value)}`
      : `${blockTime(facts)} pracy silnika × ${round(norm.blockLPerH)} L/h ≈ ${litres(expectation.value)}`;

  return {
    title: 'NORMA PALIWA',
    summary: summaryOf(consumed, expectation, litres),
    rows,
    // Zastrzeżenie, nie ozdoba: pasmo jest szersze niż rozrzut samego modelu, bo zużycie
    // sesji to RÓŻNICA dwóch odczytów paliwomierza - a każdy z nich ma własny błąd
    // (podłoga pasma, `consumption/policy.ts`).
    note:
      `Jak to liczymy: ${equation}. Pasmo jest szersze niż rozrzut samego modelu, ` +
      'bo zużycie operacji to różnica dwóch odczytów paliwomierza. Werdykt niczego nie ' +
      'blokuje - to licznik w samolocie ma rację, nie model.',
  };
}

/**
 * „+12%" / „−4%" / „0%" - o ile wartość odbiega od odniesienia (issue #66).
 *
 * Bez miejsc po przecinku i z półpauzą minusa, jak reszta liczb tego modułu: to jest
 * porównanie rzędu wielkości („czy pali więcej, niż obiecuje producent"), a nie pomiar.
 */
function percentOff(value: number, reference: number): string {
  if (reference <= 0) return '-';
  const pct = Math.round(((value - reference) / reference) * 100);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
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
  facts: BalanceTimes,
  delta: number | null,
  norm: ConsumptionNorm | null,
  expectation: Expectation | null,
  format: MhFormat,
): BalanceDetails | null {
  if (norm?.mh == null || expectation == null || delta == null) return null;

  const signed = (value: number) => signedMh(value, format);
  const sessions = `${norm.mh.sessions} ${plural(norm.mh.sessions, 'operacja', 'operacje', 'operacji')}`;

  return {
    title: 'NORMA MOTOGODZIN',
    summary: summaryOf(delta, expectation, signed),
    rows: [
      { label: 'Przyrost w tej operacji', value: signed(delta) },
      { label: 'Oczekiwane po tej operacji', value: bandOf(expectation, signed) },
      {
        label: 'Średnia tej operacji',
        value: `${rate(perBlockHour(delta, facts))} MH/h`,
      },
      { label: 'Przelicznik w locie', value: `${rate(norm.mh.perFlightHour)} MH/h` },
      { label: 'Przelicznik na ziemi', value: `${rate(norm.mh.perGroundHour)} MH/h` },
      { label: 'Podstawa', value: `${sessions} · ${COUNTER_LABEL[norm.mh.kind]}` },
    ],
    note:
      `Jak to liczymy: ${split(facts)} × ${rate(norm.mh.perFlightHour)} + ` +
      `${ground(facts)} × ${rate(norm.mh.perGroundHour)} MH/h ≈ ${signed(expectation.value)}. ` +
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
  const tail = BASIS_NOTE[expectation.basis];
  return `${word} - ${format(actual)} przy oczekiwanych ${bandOf(expectation, format)}. ${tail}`;
}

/**
 * Drugie zdanie streszczenia: NA CZYM pasmo stoi.
 *
 * Trzy szczeble drabiny, trzy różne wiarygodności - model zdegradowany do jednej fazy
 * odpowiada słabiej niż fazowy, a norma z dokumentacji nie opisuje TEJ maszyny w ogóle.
 * Pilot ma prawo o tym wiedzieć, zanim uzna werdykt za wyrok.
 */
const BASIS_NOTE: Record<Expectation['basis'], string> = {
  phases: 'Pasmo liczy się dla TEJ mieszanki faz, nie dla średniej operacji tego samolotu.',
  engine: 'Model nie rozdzielił jeszcze faz, więc pasmo opisuje samą godzinę pracy silnika.',
  nominal:
    'Pasmo pochodzi z dokumentacji jednostki, a nie z lotów tej maszyny - własną normę ' +
    'policzymy, gdy uzbiera się historia.',
};

/** „23 – 35 L" / „+1:21 – +1:33". */
function bandOf(expectation: Expectation, format: (value: number) => string): string {
  return `${format(expectation.low)} – ${format(expectation.high)}`;
}

/**
 * Wynik przeliczony na godzinę pracy silnika - jedyna liczba arkusza policzona lokalnie,
 * a nie przysłana. Stoi obok stawek normy po to, żeby dało się je porównać wprost.
 */
function perBlockHour(value: number, facts: BalanceTimes): number {
  const hours = facts.blockMs / 3_600_000;
  return hours > 0 ? value / hours : 0;
}

const COUNTER_LABEL: Record<'hobbs' | 'tach' | 'unknown', string> = {
  hobbs: 'licznik godzinowy',
  tach: 'licznik obrotomierzowy',
  unknown: 'typ licznika nierozpoznany',
};

/**
 * Dlaczego werdyktu nie ma - JEDNO zdanie zamiast czterech (issue #69: „skoro nie ma
 * danych, to po co zajmować UI?").
 *
 * Zostaje wyłącznie zerowy bieg silnika, bo tylko on mówi o TEJ OPERACJI i odpowiada
 * na pytanie, które przy zdaniu bez lotu naprawdę pada: dwa zgodne odczyty bez werdyktu
 * wyglądałyby na brak danych, a są informacją (mockup `10a` pokazuje to zdanie celowo).
 *
 * Dwa zdania WYCIĘTE i dlaczego:
 * - „nie ma jeszcze policzonej normy / przeliczników" opisywało wnętrze analityki
 *   komuś, kto nic z tym nie zrobi (kategoria przypisów z issue #43/#72). Paliwo ma
 *   od issue #66 normę z dokumentacji WYMAGANĄ na karcie samolotu, więc ta gałąź
 *   prawie wymarła; licznik przeliczników z instrukcji nie dostanie nigdy - to stan
 *   każdej młodej maszyny przez tygodnie, nie usterka;
 * - „brakuje odczytu przy zdaniu" powtarzało kreskę z wiersza rachunku tuż wyżej,
 *   a we wpisie ręcznym mówiło o polu, które pilot właśnie widzi puste (issue #55:
 *   blokadę widoczną z kontrolki się nie opisuje).
 */
function naNote(
  facts: BalanceTimes,
  expectation: Expectation | null,
  hasActual: boolean,
): string | null {
  if (expectation != null && hasActual) return null;

  if (facts.blockMs <= 0) {
    return 'Nie porównujemy z normą - silnik nie pracował, a norma opisuje godzinę jego pracy.';
  }
  return null;
}

/**
 * „1:16 lotu" - czas w powietrzu jako składnik działania.
 *
 * `duration`, nie `hhmm`: przypis jest ZDANIEM, a nie kolumną tabeli, więc wiodące zero
 * („01:16 lotu") niczego tu nie wyrównuje, a czyta się jak stempel czasu.
 */
function split(facts: BalanceTimes): string {
  return `${duration(Math.min(facts.flightMs, facts.blockMs))} lotu`;
}

/** „0:27 ziemi" - reszta biegu silnika, nigdy ujemna (ta sama reguła co w domenie). */
function ground(facts: BalanceTimes): string {
  return `${duration(Math.max(0, facts.blockMs - facts.flightMs))} ziemi`;
}

/** „1:43" - cały bieg silnika; potrzebne, gdy model nie rozdzielił faz. */
function blockTime(facts: BalanceTimes): string {
  return duration(facts.blockMs);
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
