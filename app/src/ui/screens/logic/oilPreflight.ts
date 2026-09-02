/**
 * UZ Aero - sekcja OLEJU na kroku liczników (02a, issue #60): czysta logika.
 *
 * Olej różni się od paliwa i MH jedną rzeczą, z której wynika cała reszta: nikt go
 * pilotowi NIE PRZEKAZUJE. Paliwo i licznik pilot POTWIERDZA (wartości przekazane stoją
 * wpisane), olej MIERZY sam, teraz, przy zimnym silniku - więc wartość zaczyna pusta
 * w każdym stanie świeżości, a serwerowe dane są wyłącznie podpowiedzią: ostatni pomiar
 * plus rachunek oczekiwania.
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
import type { Freshness } from '../../components';

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

/** Wiersz szlaku sekcji - strukturalnie zgodny z `TrailRow` komponentu. */
export interface OilTrailRow {
  id: string;
  title: string;
  meta: string;
  tone?: 'green' | 'amber';
}

export interface OilClaimInput {
  config: OilConfig;
  lastOil: OilHandover | null;
  /** Bieżący odczyt MH ze szkicu - kotwica rachunku oczekiwania. */
  currentMh: number;
  mhFormat: MhFormat;
  synced: boolean;
  /** Wpis pilota (szkic): pomiar i dolewka; `null` = nie wpisano. */
  enteredL: number | null;
  addedL: number | null;
  pilotName: (id: string | null) => string;
}

export interface OilClaimView {
  /** Wartość sekcji („8,2"); `null` = „- -". */
  value: string | null;
  freshness: Freshness;
  caption: string;
  trail: OilTrailRow[];
  /** Ostrzeżenie pod sekcją (warunkowe - znika z warunkiem); `null` = brak. */
  warning: string | null;
  /** Oczekiwany poziom z normy - wiersz odniesienia arkusza; `null` = nie liczy się. */
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
        ? `Stan po dolewce (${oilLitres(afterL)}) przekracza zbiornik (${oilLitres(cap)}) - popraw wpis.`
        : `Pomiar ${oilLitres(afterL)} przekracza zbiornik (${oilLitres(cap)}) - popraw wpis.`;
    }
    if (afterL == null && addedL != null && addedL > cap) {
      return `Dolewka ${oilLitres(addedL)} przekracza zbiornik (${oilLitres(cap)}) - popraw wpis.`;
    }
  }

  if (levelL == null || afterL == null) return null;

  const parts: string[] = [];
  if (config.minL != null && afterL < config.minL) {
    const missing = config.minL - afterL;
    parts.push(
      `Poziom ${oilLitres(afterL)} poniżej minimum (${oilLitres(config.minL)}) - ` +
        `dolej co najmniej ${oilLitres(missing)} przed lotem.`,
    );
  }
  if (expectedL != null && expectedL - levelL >= OIL_DEVIATION_WARN_L) {
    parts.push(
      `Pomiar jest ${oilLitres(expectedL - levelL)} niżej niż oczekiwanie z normy - ` +
        'sprawdź, czy silnik nie traci oleju.',
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Wiersz „Po dolewce" arkusza - istnieje wyłącznie, gdy jest CO liczyć (pomiar
 * z dolewką); dolewka w ciemno stanu nie zna, sam pomiar go nie zmienia. Zielony
 * dopiero od minimum w górę - poniżej ostrzega osobne ostrzeżenie, nie kolor wiersza,
 * a bez skonfigurowanego minimum nie ma do czego porównywać.
 */
export function oilAfterRow(
  levelL: number | null,
  addedL: number | null,
  config: OilConfig,
): { label: string; value: string; tone?: 'green' } | null {
  if (levelL == null || addedL == null || addedL <= 0) return null;
  const afterL = levelL + addedL;
  const aboveMin = config.minL != null && afterL >= config.minL;
  return {
    label: 'Po dolewce',
    value: aboveMin ? `${oilLitres(afterL)} · powyżej minimum` : oilLitres(afterL),
    ...(aboveMin ? { tone: 'green' as const } : {}),
  };
}

export function oilClaimView(input: OilClaimInput): OilClaimView {
  const { config, lastOil, enteredL, addedL } = input;
  const entered = enteredL != null || addedL != null;
  const exp = expectation(lastOil, config, input.currentMh);

  // ── szlak podpowiedzi: ostatni pomiar → rachunek oczekiwania ────────────────
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
    trail.push({
      id: 'oil-expect',
      tone: 'green',
      title: `Od pomiaru · ${motoHours(exp.deltaMh, input.mhFormat)} MH`,
      meta: `norma ${rateLabel(exp.rate)} → na bagnecie oczekuj ≈ ${oilLitres(exp.expectedL)}`,
    });
  }

  // ── podpis: konfiguracja + procedura / rachunek dolewki po wpisie ───────────
  const configParts = [
    config.minL != null ? `min ${oilLitres(config.minL)}` : null,
    config.capacityL != null ? `zbiornik ${oilLitres(config.capacityL)}` : null,
  ].filter((p): p is string => p != null);

  let caption: string;
  if (!entered) {
    // Instrukcja pomiaru stoi do chwili pomiaru - potem jest spełniona i schodzi.
    caption = [...configParts, 'pomiar przy zimnym silniku'].join(' · ');
  } else if (addedL != null && addedL > 0) {
    caption =
      enteredL != null
        ? [
            `dolano +${oilLitres(addedL)} → po dolewce ${oilLitres(enteredL + addedL)}`,
            config.minL != null ? `min ${oilLitres(config.minL)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : [`dolano +${oilLitres(addedL)}`, ...configParts].join(' · ');
  } else {
    caption = configParts.join(' · ');
  }

  // Wpis pilota jest jego własny (`manual`); przed wpisem świeżość opisuje PODPOWIEDŹ.
  const freshness: Freshness = entered
    ? 'manual'
    : lastOil == null
      ? 'brak'
      : input.synced
        ? 'live'
        : 'cache';

  return {
    value: enteredL != null ? bareLitres(enteredL) : null,
    freshness,
    caption,
    trail,
    warning: entered ? oilEntryWarning(enteredL, addedL, config, exp?.expectedL ?? null) : null,
    expectedL: exp?.expectedL ?? null,
  };
}
