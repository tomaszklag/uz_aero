/**
 * UZ Aero — ODCZYTY STARTOWE PODSTAWIANE Z SĄSIADA (issue #62, siódma i ósma tura).
 *
 * „System wykrywa ilość paliwa w oparciu o poprzedzający lot" — a odkąd trasa
 * `readings-chain` niesie razem z litrami także stan licznika, ta sama odpowiedź
 * obsługuje MOTOGODZINY. Oba pola opisują JEDNĄ rzecz: co pilot ZASTAŁ, biorąc maszynę.
 *
 * ══ DLACZEGO TO NIE JEST TA SAMA POMYŁKA, CO W 2026-08-16 ══
 * Do 2026-08-16 wpis ręczny BRAŁ odczyt początkowy z cache i „zgadnięte ogniwo psuło
 * łańcuch MH następnemu pilotowi". Różnice są trzy i każda jedna jest warunkiem:
 *
 *  1. **źródłem jest REJESTR, nie cache** — konkretny sąsiad tej maszyny w tej chwili
 *     (`before`), a nie „ostatni znany stan" sprzed nieznanej liczby cudzych lotów;
 *  2. **liczba niesie ŹRÓDŁO przy polu** („z poprzedniego lotu · AKO"), więc nie udaje
 *     odczytu z przyrządu — a to było sednem tamtej pomyłki: „nikt jej potem nie odróżni";
 *  3. **podstawiamy WYŁĄCZNIE w pole, które nie jest decyzją pilota** — puste albo takie,
 *     w którym stoi nasza własna wcześniejsza podpowiedź.
 *
 * ══ CZEGO NIE PODSTAWIAMY ══
 * Odczytów PO locie — ani paliwa, ani licznika. `after` mówi, co zastał NASTĘPNY pilot,
 * czyli wprost odpowiedź na pytanie, które ten formularz zadaje (ile ten lot spalił
 * i ile nabił na liczniku). Podstawiona odpowiedź zawsze się „zgadza" i kasuje jedyne
 * ostrzeżenie, dla którego łańcuch powstał. Sąsiad z drugiej strony zostaje więc tam,
 * gdzie jego miejsce: w wierszu odniesienia arkusza (`readingsContinuity`).
 */

import type { RemoteReadingsChainLink } from '../../../application';

/** Ślad po naszej podpowiedzi — czym była i z czego wynikała. */
export interface AppliedPrefill {
  /**
   * Tożsamość sąsiada: maszyna i jego chwila. Zmiana klucza znaczy „to już inny lot
   * poprzedzający" — pilot cofnął się i wybrał inną maszynę albo przesunął uruchomienie.
   */
  key: string;
  fuelL: number;
  mh: number;
}

/** Pola szkicu, które ta podpowiedź obsługuje — oba opisują stan ZASTANY. */
export interface PrefillFields {
  foundL: number | null;
  mhBefore: number | null;
}

export interface PrefillResult {
  fields: PrefillFields;
  applied: AppliedPrefill;
}

/**
 * Czy wolno nam wpisać się w to pole: puste jest niczyje, a wartość równa naszej
 * poprzedniej podpowiedzi jest nadal nasza. Wszystko inne wpisał pilot i jest decyzją
 * — odpowiedź serwera nie ma prawa jej nadpisać.
 */
function ours(value: number | null, previous: number | undefined): boolean {
  return value == null || (previous != null && value === previous);
}

/**
 * Co podstawić w odczyty startowe. `null` = nie ma czego (brak sąsiada) ALBO z tego
 * samego sąsiada podstawiliśmy już wcześniej — obu przypadków wołający nie odróżnia
 * i nie musi: jeden i drugi znaczy „nic nie rób".
 *
 * @param aircraftId maszyna szkicu — wchodzi do klucza, bo ta sama chwila na dwóch
 *   maszynach to dwa różne sąsiedztwa.
 * @param link sąsiad SPRZED tego lotu (`chain.before`); `undefined` = pytanie w toku.
 * @param applied nasza poprzednia podpowiedź albo `null`, gdy jeszcze żadnej nie było.
 */
export function readingsPrefill(
  aircraftId: string | null,
  link: RemoteReadingsChainLink | null | undefined,
  applied: AppliedPrefill | null,
  fields: PrefillFields,
): PrefillResult | null {
  if (link == null || aircraftId == null) return null;

  const key = `${aircraftId}|${link.at}`;
  if (applied?.key === key) return null;

  return {
    fields: {
      foundL: ours(fields.foundL, applied?.fuelL) ? link.fuelL : fields.foundL,
      mhBefore: ours(fields.mhBefore, applied?.mh) ? link.mh : fields.mhBefore,
    },
    applied: { key, fuelL: link.fuelL, mh: link.mh },
  };
}

/**
 * Adnotacja źródła przy polu — pojawia się TYLKO wtedy, gdy stoi w nim liczba sąsiada.
 * Pilot, który ją poprawił, patrzy już na własny odczyt i podpis „z poprzedniego lotu"
 * byłby przy nim zwyczajnie nieprawdziwy.
 *
 * Krótsza niż wiersz odniesienia w arkuszu (`readingsContinuity`), bo stoi POD polem
 * w kolumnie formularza: kto wystarczy, kiedy — już nie, a data i tak jest w nagłówku
 * kroku.
 */
export function prefillSource(
  link: RemoteReadingsChainLink | null | undefined,
  field: 'fuelL' | 'mh',
  value: number | null,
): string | undefined {
  if (link == null || value == null || value !== link[field]) return undefined;
  return `z poprzedniego lotu · ${link.picId.toUpperCase()}`;
}
