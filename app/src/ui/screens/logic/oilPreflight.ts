/**
 * UZ Aero - sekcja OLEJU na kroku liczników (02a, issue #60): czysta logika.
 *
 * Olej różni się od paliwa i MH jedną rzeczą, z której wynika cała reszta: nikt go
 * pilotowi NIE PRZEKAZUJE. Paliwo i licznik pilot POTWIERDZA (wartości przekazane stoją
 * wpisane), olej MIERZY sam, teraz, przy zimnym silniku - więc wartość zaczyna pusta,
 * a serwerowe dane są wyłącznie podpowiedzią: ostatni pomiar plus rachunek oczekiwania.
 *
 * PODPOWIEDŹ MIESZKA W ARKUSZU, NIE W SEKCJI (uwaga z urządzenia, 2026-09-02): sekcja
 * na ekranie mówi wyłącznie, ile oleju JEST W SILNIKU (pomiar + dolewka dużą liczbą,
 * podziałka ze znacznikiem minimum) i z czego to wynika („odczytano · dolano") -
 * historia pomiaru i oczekiwanie z normy stoją w arkuszu, czyli tam, gdzie pilot
 * wpisuje liczbę, którą ma z nimi porównać. KSZTAŁTEM podpowiedzi jest SZLAK
 * (`Trail` - kropka, tytuł, linia szczegółów), ten sam co przy paliwie i MH na
 * ekranie: pierwsza wersja przenosin składała ją w wiersze label→wartość arkusza
 * i pilot dostał „za dużo linijek tekstu, nie do końca czytelne" (druga tura tej
 * samej uwagi). Adnotacji świeżości sekcja nie nosi: własny pomiar nie ma czego
 * poświadczać, a wiek podpowiedzi niesie stempel w tytule „Ostatni pomiar".
 *
 * Rachunek oczekiwania: `oczekiwane = pomiar + dolewki po nim − stawka × ΔMH`, gdzie
 * kotwicą jest odczyt MH przy tamtym pomiarze, a ΔMH liczy się do BIEŻĄCEGO odczytu
 * ze szkicu - poprawka licznika na tym samym ekranie od razu przelicza oczekiwanie.
 * Stawka pochodzi dziś z konfiguracji floty (norma nominalna z dokumentacji silnika,
 * L NA GODZINĘ PRACY SILNIKA - ten sam mianownik, co norma paliwa; uwagi do issue #66),
 * a ΔMH jest jej miarą godzin pracy: jedyny zegar maszyny znany offline przez cudze
 * operacje. Przy liczniku obrotomierzowym to przybliżenie (na ziemi przyrasta wolniej);
 * w fazie 2 stawka WYLICZONA z pomiarów (analityka, §4.8) wygra z nominalną - podmiana
 * zajdzie tutaj, w `expectation()`, i nigdzie indziej.
 *
 * Pomiar jest krokiem WYMAGANYM przejęcia (decyzja 2026-08-27) - ale bramkę trzyma
 * `preflightGate.ts`, nie ten moduł: tu mieszka wyłącznie podpowiedź i ostrzeżenia.
 * Rozdzielenie jest celowe: wpis ręczny (15) używa tych samych rachunków BEZ bramki,
 * bo fakt lotu jest cenniejszy niż kompletność formularza.
 */

import { motoHours, oilLitres, stampUtc } from '../../format';
import type { MhFormat, OilHandover } from '../../../domain';

/**
 * Próg ostrzeżenia DIAGNOSTYCZNEGO: pomiar niższy od oczekiwania o co najmniej tyle
 * litrów każe sprawdzić, czy silnik nie traci oleju. DO KALIBRACJI razem z resztą
 * progów (§3.6b) - 0,5 L to dwie podziałki bagnetu, poniżej tego mówiłby szum pomiaru.
 */
export const OIL_DEVIATION_WARN_L = 0.5;

/** Konfiguracja oleju z floty (`ReferenceAircraft.oil*`); `null` = nieskonfigurowane. */
export interface OilConfig {
  minL: number | null;
  capacityL: number | null;
  normLPerH: number | null;
}

/**
 * Ogniwo szlaku podpowiedzi w ARKUSZU pomiaru - strukturalnie zgodne z `TrailRow`.
 * Bez pola tonu: wszystkie ogniwa są neutralne (uwaga z urządzenia, 2026-09-02 -
 * „czemu na zielono?"; zieleń niczego tu nie odróżniała, a olej pisze się
 * standardowym stylem).
 */
export interface OilTrailRow {
  id: string;
  title: string;
  meta: string;
}

/**
 * Dane podziałki poziomu oleju - pasek jak przy paliwie (uwaga z urządzenia,
 * 2026-09-02: „zamiast pisać min i zbiornik pokaż podziałkę jak dla paliwa").
 * Rysuje ją `LevelBar` ze znacznikiem minimum; tu jest sama arytmetyka.
 */
export interface OilGauge {
  /** Wypełnienie 0–1: stan PO dolewce względem zbiornika - z nim samolot leci. */
  ratio: number;
  /** Pozycja minimum na pasku (0–1); `null` = minimum nieskonfigurowane, bez znacznika. */
  minRatio: number | null;
  /** Stan po dolewce pod minimum - wypełnienie ostrzega bursztynem zamiast koloru tła. */
  belowMin: boolean;
}

export interface OilClaimInput {
  config: OilConfig;
  lastOil: OilHandover | null;
  /** Bieżący odczyt MH ze szkicu - kotwica rachunku oczekiwania. */
  currentMh: number;
  mhFormat: MhFormat;
  /** Wpis pilota (szkic): pomiar i dolewka; `null` = nie wpisano. */
  enteredL: number | null;
  addedL: number | null;
  pilotName: (id: string | null) => string;
}

export interface OilClaimView {
  /**
   * Wartość sekcji - STAN SILNIKA po dolewce („9,2"); `null` = „- -". Duża liczba
   * mówi, ile oleju JEST (trzecia uwaga z 2026-09-02), a rozbicie na składowe
   * („odczytano · dolano") schodzi do podpisu.
   */
  value: string | null;
  caption: string;
  /** Podziałka poziomu; `null` = nie ma czego rysować (bez pomiaru / bez zbiornika). */
  gauge: OilGauge | null;
  /**
   * Podpowiedź (ostatni pomiar → oczekiwanie z normy) - SZLAK renderowany w ARKUSZU,
   * nie w sekcji. Uwaga z urządzenia (2026-09-02): historia przy pomiarze jest
   * ciekawa, ale jej miejsce jest w popupie; kształtem jest `Trail`, jak przy
   * paliwie i MH na ekranie - wiersze label→wartość dawały „za dużo linijek".
   */
  trail: OilTrailRow[];
  /** Ostrzeżenie pod sekcją (warunkowe - znika z warunkiem); `null` = brak. */
  warning: string | null;
  /** Oczekiwany poziom z normy - do ostrzeżeń arkusza; `null` = nie liczy się. */
  expectedL: number | null;
}

/** „0,12 L/h" - stawka z dwoma miejscami, bo norma oleju żyje w setnych litra. */
const rateLabel = (rate: number): string => `${rate.toFixed(2).replace('.', ',')} L/h`;

/** Litry bez jednostki do dużej wartości sekcji - jednostkę niesie osobny slot. */
const bareLitres = (v: number): string => oilLitres(v).replace(/\sL$/, '');

/** Tekst pola arkusza / wartości sekcji; `null` → pusto (nie „0,0" - zero to odczyt). */
export const oilValueText = (v: number | null): string => (v == null ? '' : bareLitres(v));

interface OilExpectation {
  expectedL: number;
  deltaMh: number;
  rate: number;
}

/**
 * Oczekiwany poziom - tylko przy komplecie: pomiar z kotwicą MH, stawka i licznik,
 * który od pomiaru NIE cofnął się (cofnięty = któryś odczyt jest błędny; rachunek na nim
 * podpowiadałby liczbę z powietrza). Ujemne oczekiwanie przycinamy do zera: silnik nie
 * wyssie z miski więcej, niż w niej było.
 */
function expectation(
  lastOil: OilHandover | null,
  config: OilConfig,
  currentMh: number,
): OilExpectation | null {
  if (lastOil == null || lastOil.atMh == null) return null;
  const rate = config.normLPerH; // faza 2: stawka wyliczona z analityki wygra z nominalną
  if (rate == null) return null;
  const deltaMh = currentMh - lastOil.atMh;
  if (deltaMh < 0) return null;
  return {
    expectedL: Math.max(0, lastOil.levelL + lastOil.addedSinceL - rate * deltaMh),
    deltaMh,
    rate,
  };
}

/**
 * Ostrzeżenie dla PARY (pomiar, dolewka) - jedna funkcja dla sekcji i arkusza, żeby
 * nie miały jak mówić różnych rzeczy. Trzy poziomy, w kolejności ważności:
 *
 *  1. PONAD ZBIORNIK - wpis do poprawienia (domena odrzuci go twardo przy zapisie),
 *     więc wygrywa ze wszystkim i ucina dalsze rachunki;
 *  2. PONIŻEJ MINIMUM - operacyjne „dolej co najmniej X"; liczy się na stanie PO
 *     dolewce, bo to z nim samolot idzie w powietrze, i dlatego dolewka je gasi;
 *  3. ODCHYŁ OD OCZEKIWANIA - diagnostyczne „sprawdź, czy silnik nie traci oleju";
 *     liczy się z SAMEGO POMIARU, bo podejrzenia ubytku nie da się dolać.
 *
 * Punkty 2 i 3 potrafią zajść naraz i wtedy stoją obok siebie (wzorzec z mockupu 02i).
 */
export function oilEntryWarning(
  levelL: number | null,
  addedL: number | null,
  config: OilConfig,
  expectedL: number | null,
): string | null {
  const added = addedL ?? 0;
  const afterL = levelL != null ? levelL + added : null;

  const cap = config.capacityL;
  if (cap != null) {
    if (afterL != null && afterL > cap) {
      return added > 0
        ? `Stan oleju po dolewce (${oilLitres(afterL)}) przekracza zbiornik (${oilLitres(cap)}) - popraw wpis.`
        : `Pomiar oleju ${oilLitres(afterL)} przekracza zbiornik (${oilLitres(cap)}) - popraw wpis.`;
    }
    if (afterL == null && addedL != null && addedL > cap) {
      return `Dolewka oleju ${oilLitres(addedL)} przekracza zbiornik (${oilLitres(cap)}) - popraw wpis.`;
    }
  }

  if (levelL == null || afterL == null) return null;

  const parts: string[] = [];
  if (config.minL != null && afterL < config.minL) {
    const missing = config.minL - afterL;
    parts.push(
      `Poziom oleju ${oilLitres(afterL)} poniżej minimum (${oilLitres(config.minL)}) - ` +
        `dolej co najmniej ${oilLitres(missing)} przed lotem.`,
    );
  }
  if (expectedL != null && expectedL - levelL >= OIL_DEVIATION_WARN_L) {
    parts.push(
      `Pomiar oleju jest ${oilLitres(expectedL - levelL)} niżej niż oczekiwanie z normy - ` +
        'sprawdź, czy silnik nie traci oleju.',
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Wiersz „Po dolewce" arkusza - istnieje wyłącznie, gdy jest CO liczyć (pomiar
 * z dolewką); dolewka w ciemno stanu nie zna, sam pomiar go nie zmienia.
 *
 * BEZ dopisku „powyżej minimum" i bez zieleni (uwaga z urządzenia, 2026-09-02):
 * jedno i drugie sugerowało, że oleju WYSTARCZY - a wystarczalność zależy od
 * długości lotu, o której konfiguracyjne minimum nic nie wie. Wiersz podaje sam
 * rachunek; o zejściu POD minimum mówi osobne ostrzeżenie.
 */
export function oilAfterRow(
  levelL: number | null,
  addedL: number | null,
): { label: string; value: string } | null {
  if (levelL == null || addedL == null || addedL <= 0) return null;
  return { label: 'Po dolewce', value: oilLitres(levelL + addedL) };
}

export function oilClaimView(input: OilClaimInput): OilClaimView {
  const { config, lastOil, enteredL, addedL } = input;
  const entered = enteredL != null || addedL != null;
  const exp = expectation(lastOil, config, input.currentMh);

  // ── podpowiedź: ostatni pomiar → rachunek oczekiwania - SZLAK do ARKUSZA ────
  // Ten sam schemat i te same dane, co szlaki paliwa i MH na ekranie (druga tura
  // uwagi z 2026-09-02): kropka, tytuł ze stemplem, jedna linia szczegółów.
  // Dolewki po pomiarze są częścią meta („dolano później +…") - pilot ma wiedzieć,
  // że rachunek oczekiwania je widzi.
  const trail: OilTrailRow[] = [];
  if (lastOil != null) {
    trail.push({
      id: 'oil-last',
      title: `Ostatni pomiar · ${stampUtc(lastOil.at)} - ${input.pilotName(lastOil.byPilotId)}`,
      meta: [
        `bagnet ${oilLitres(lastOil.levelL)}`,
        lastOil.atMh != null ? `przy ${motoHours(lastOil.atMh, input.mhFormat)} MH` : null,
        lastOil.addedSinceL > 0 ? `dolano później +${oilLitres(lastOil.addedSinceL)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }
  if (exp != null) {
    // „Latano", nie „Od pomiaru" (uwaga z urządzenia, 2026-09-02): ogniwo mówi,
    // ile maszyna LATAŁA - jak wiersze „J. Kowalski latał" przy paliwie i MH.
    // Bez nazwiska, bo od pomiaru mogło latać wielu pilotów (interwał olejowy
    // biegnie przez wiele operacji), a rejestr niesie tu samą deltę licznika.
    trail.push({
      id: 'oil-expect',
      title: `Latano · ${motoHours(exp.deltaMh, input.mhFormat)} MH`,
      meta: `norma ${rateLabel(exp.rate)} → na bagnecie oczekuj ≈ ${oilLitres(exp.expectedL)}`,
    });
  }

  // ── wartość i podpis: STAN silnika dużą liczbą, składowe pod spodem ─────────
  // Trzecia uwaga z 2026-09-02: „pokazać, ile jest oleju w silniku, a poniżej
  // opisać: odczytano X, dolano Y". Dużą liczbą jest pomiar + dolewka - stan,
  // z którym samolot idzie w powietrze, ten sam, który ocenia podziałka i próg
  // minimum. Rozbicie na składowe schodzi do podpisu i istnieje TYLKO przy dolewce:
  // bez niej stan RÓWNA SIĘ odczytowi, a „bez dolewki" przy każdym przejęciu
  // niczego by nie odróżniało (reguła SyncChipa). Konfiguracji (min/zbiornik)
  // i instrukcji pomiaru w podpisie nie ma - wcześniejsze uwagi z tego samego dnia.
  const afterL = enteredL != null ? enteredL + (addedL ?? 0) : null;
  let caption = '';
  if (addedL != null && addedL > 0) {
    caption =
      enteredL != null
        ? `odczytano ${oilLitres(enteredL)} · dolano +${oilLitres(addedL)}`
        : `dolano +${oilLitres(addedL)}`;
  }

  // ── podziałka: stan po dolewce na tle zbiornika, minimum znacznikiem ────────
  const gauge: OilGauge | null =
    afterL != null && config.capacityL != null && config.capacityL > 0
      ? {
          ratio: afterL / config.capacityL,
          minRatio: config.minL != null ? config.minL / config.capacityL : null,
          belowMin: config.minL != null && afterL < config.minL,
        }
      : null;

  return {
    value: afterL != null ? bareLitres(afterL) : null,
    caption,
    gauge,
    trail,
    warning: entered ? oilEntryWarning(enteredL, addedL, config, exp?.expectedL ?? null) : null,
    expectedL: exp?.expectedL ?? null,
  };
}
