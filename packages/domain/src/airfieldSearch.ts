/**
 * UZ Aero — wyszukiwanie lotniska w katalogu (podpowiedzi do pola ICAO).
 *
 * PO CO: pilot wpisywał kod ICAO z pamięci, w cztery znaki, bez żadnego potwierdzenia,
 * że trafił. Katalog i tak siedzi w aplikacji (mapa śladu rysuje z niego pasy), więc
 * to samo źródło może podpowiadać przy wpisywaniu trasy — i przy okazji POKAZAĆ, jakie
 * lotnisko kryje się pod kodem, zanim pilot pojedzie dalej z literówką.
 *
 * PODPOWIEDŹ, NIE BRAMKA. Katalog obejmuje wyłącznie Polskę (`EP**`), a ferry potrafi
 * skończyć się w Berlinie — więc wpis spoza listy musi zostać przyjęty bez mrugnięcia.
 * Ta funkcja nigdy nie mówi „nie ma takiego lotniska"; brak trafień to po prostu pusta
 * lista i pole zachowuje się jak zwykły input.
 *
 * OFFLINE: zero sieci, zero pobierania, zero cache'u — katalog jest wkompilowany
 * (106 rekordów, ~20 KB źródła). To jest odpowiedź na pytanie „ile waży taka paczka
 * danych" z issue #4: nie ma paczki, dane już tam są.
 */

import { POLISH_AIRFIELDS, type Airfield } from './airfields';

/** Ile podpowiedzi najwyżej pokazujemy — dłuższa lista przestaje być podpowiedzią. */
export const MAX_AIRFIELD_SUGGESTIONS = 5;

export interface AirfieldSearchOptions {
  /** Katalog do przeszukania; podmieniany w testach. */
  catalogue?: readonly Airfield[];
  limit?: number;
}

/**
 * Polskie znaki na łacińskie odpowiedniki.
 *
 * Jawna mapa zamiast `normalize('NFD')`, bo `Ł` NIE rozkłada się na `L` + znak
 * diakrytyczny (to osobny znak Unicode), a poza tym katalog jest wyłącznie polski —
 * dziewięć liter zamyka temat bez polegania na tym, co potrafi silnik JS w telefonie.
 */
const FOLDED: Readonly<Record<string, string>> = {
  Ą: 'A',
  Ć: 'C',
  Ę: 'E',
  Ł: 'L',
  Ń: 'N',
  Ó: 'O',
  Ś: 'S',
  Ź: 'Z',
  Ż: 'Z',
};

/** Napis do porównań: wersaliki bez ogonków. „Żar" i „zar" mają się spotkać. */
function fold(text: string): string {
  let out = '';
  for (const char of text.toUpperCase()) out += FOLDED[char] ?? char;
  return out;
}

/** Wyrazy nazwy — po nich sprawdzamy dopasowanie „od początku słowa". */
function wordsOf(name: string): string[] {
  return fold(name)
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0);
}

/**
 * Trafność dopasowania: im mniej, tym wyżej na liście. `null` = brak trafienia.
 *
 * Kolejność jest celowa. Pilot wpisuje przede wszystkim KOD, więc dokładny kod bije
 * wszystko, a kod zaczynający się od wpisanych liter bije nazwę — inaczej „EPZ" pokazałby
 * najpierw lotniska z „Z" w nazwie, a kod, o który chodziło, spadłby poza listę.
 */
function rank(airfield: Airfield, needle: string): number | null {
  const icao = airfield.icao;
  if (icao === needle) return 0;
  if (icao.startsWith(needle)) return 1;

  const words = wordsOf(airfield.name);
  if (words.some((word) => word.startsWith(needle))) return 2;
  if (fold(airfield.name).includes(needle)) return 3;

  return null;
}

/**
 * Lotniska pasujące do wpisanego tekstu, od najtrafniejszego.
 *
 * Szuka po kodzie ICAO i po nazwie (także po dalszym członie — „babimost" znajdzie
 * `EPZG Zielona Góra-Babimost`). Pusty wpis daje pustą listę: podpowiedzi mają się
 * pojawić, gdy pilot zacznie pisać, a nie wisieć pod nietkniętym polem.
 */
export function searchAirfields(
  query: string | null | undefined,
  options: AirfieldSearchOptions = {},
): Airfield[] {
  const catalogue = options.catalogue ?? POLISH_AIRFIELDS;
  const limit = options.limit ?? MAX_AIRFIELD_SUGGESTIONS;

  const needle = fold((query ?? '').trim());
  if (needle.length === 0 || limit <= 0) return [];

  const hits: { airfield: Airfield; rank: number }[] = [];
  for (const airfield of catalogue) {
    const score = rank(airfield, needle);
    if (score != null) hits.push({ airfield, rank: score });
  }

  return hits
    .sort((a, b) => a.rank - b.rank || a.airfield.icao.localeCompare(b.airfield.icao))
    .slice(0, limit)
    .map((hit) => hit.airfield);
}
