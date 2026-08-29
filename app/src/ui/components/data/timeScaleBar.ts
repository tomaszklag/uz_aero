/**
 * UZ Aero - PODZIAŁKA CZASU profilu pionowego (issue #47, trzecia tura przeglądu).
 *
 * Mapa ma podziałkę odległości i to ona jest jej wskaźnikiem przybliżenia: przy ×2,4
 * czyta „500 m" zamiast „2 km". Profil po dołożeniu zoomu poziomego został bez
 * odpowiednika - godziny stoją WYŁĄCZNIE przy znacznikach, więc po przybliżeniu między
 * dwoma zdarzeniami nie było ani jednej liczby mówiącej, jaki wycinek czasu widać.
 *
 * Odpowiedź jest ta sama, co na mapie: krótki pasek z podpisem, w rogu wykresu.
 * Nie ma za to osi z regularnymi znacznikami czasu - te wpadłyby w rząd godzin przy
 * startach i lądowaniach, a dwa rzędy liczb pod wykresem to dokładnie ten problem,
 * który przegląd kazał usunąć.
 *
 * Kroki są „okrągłe" w mowie pilota (10 s, 30 s, 5 min, kwadrans, godzina), a nie
 * arytmetycznie równe: podziałka ma się czytać bez liczenia.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Kroki od najmniejszego; wybieramy NAJWIĘKSZY, który mieści się w dozwolonej szerokości. */
const STEPS_MS = [
  10 * SECOND,
  20 * SECOND,
  30 * SECOND,
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  4 * HOUR,
];

export interface TimeScale {
  /** Ile czasu obejmuje pasek. */
  ms: number;
  /** Ile pikseli ma zająć na ekranie. */
  pixels: number;
  /** Podpis: „30 s", „5 min", „1 h". */
  label: string;
}

/**
 * @param msPerPixel ile milisekund przypada na piksel W BIEŻĄCYM przybliżeniu.
 * @param maxPixels górna granica długości paska.
 */
export function timeScaleBar(msPerPixel: number, maxPixels: number): TimeScale | null {
  if (!Number.isFinite(msPerPixel) || msPerPixel <= 0 || maxPixels <= 0) return null;

  // Największy krok mieszczący się w limicie; gdy nawet najmniejszy jest za szeroki
  // (nagranie kilkusekundowe), bierzemy go mimo to - pasek krótszy niż limit jest
  // uczciwy, a jego brak nie mówi nic.
  let chosen = STEPS_MS[0]!;
  for (const step of STEPS_MS) {
    if (step / msPerPixel <= maxPixels) chosen = step;
  }

  return { ms: chosen, pixels: chosen / msPerPixel, label: labelOf(chosen) };
}

function labelOf(ms: number): string {
  if (ms >= HOUR) {
    const hours = ms / HOUR;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
  }
  if (ms >= MINUTE) return `${ms / MINUTE} min`;
  return `${ms / SECOND} s`;
}
