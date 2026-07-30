/**
 * UZ Aero — cechy trendowe liczone z okna fixów.
 *
 * SEDNO ZMIANY WZGLĘDEM PIERWSZEJ WERSJI DETEKCJI: progi nakładane na pojedynczy
 * odczyt biorą całą nieprecyzję odbiornika na siebie. Te same zjawiska widziane
 * w oknie czasu mają wielokrotnie lepszy stosunek sygnału do szumu — i dopiero to
 * pozwala wykryć rzeczy, których chwilowa prędkość nie widzi.
 *
 * Rachunek dla kołowania, bo od niego wyszła cała przebudowa:
 *   • chwilowo — próg 4 kt ≈ 2 m/s przy dokładności dopplera ~0,3 m/s to ~7:1,
 *     a filtr static-hold potrafi zbić sygnał do zera;
 *   • w oknie 30 s — samolot kołujący 8 kt przejeżdża ~120 m, stojący dryfuje ~5 m,
 *     czyli ~24:1 na tym samym zjawisku.
 * Dlatego kanałem podstawowym kołowania jest PRZEMIESZCZENIE (`motion.ts`), a prędkość
 * chwilowa schodzi do roli wsparcia.
 *
 * Wszystko tutaj to czyste funkcje bez stanu: wchodzi okno, wychodzi liczba albo `null`.
 */

import { distanceNm, headingDeltaDeg } from './geo';
import { fixPosition, type GpsFix } from './fix';
import { slopePerSecond, type TimePoint } from './regression';

/** Skąd wzięliśmy prędkość — diagnostyka i decyzja, ile jej ufać. */
export type SpeedSource = 'doppler' | 'position';

export interface SpeedEstimate {
  kt: number;
  source: SpeedSource;
}

/** Minimalna rozpiętość okna (s) dla wielkości liczonych z różnic. */
export const TREND_MIN_SPAN_SEC = 4;

/**
 * Prędkość względem ziemi z okna — doppler, a gdy go brak, z przemieszczenia.
 *
 * Doppler bierzemy jako MEDIANĘ okna, nie ostatnią wartość: mediana odrzuca pojedynczą
 * szpilkę bez wygładzania narastania (średnia opóźniałaby rozbieg, mediana nie).
 *
 * Ścieżka pozycyjna to nie jest gorszy zamiennik — przy prędkościach kołowania bywa
 * DOKŁADNIEJSZA od dopplera, bo mierzy przebytą drogę zamiast różnicy częstotliwości
 * na granicy czułości. Jest za to bezużyteczna w zakręcie (odległość po cięciwie,
 * nie po łuku), więc do decyzji w locie nadal służy doppler.
 */
export function groundSpeed(fixes: readonly GpsFix[]): SpeedEstimate | null {
  const doppler = fixes.map((f) => f.groundSpeedKt).filter((v): v is number => v != null);
  if (doppler.length > 0) {
    const sorted = [...doppler].sort((a, b) => a - b);
    return { kt: sorted[Math.floor(sorted.length / 2)]!, source: 'doppler' };
  }

  const nm = pathDisplacementNm(fixes);
  const oldest = fixes[0];
  const newest = fixes[fixes.length - 1];
  if (nm == null || oldest == null || newest == null) return null;

  const hours = (newest.time - oldest.time) / 3_600_000;
  if (hours <= 0) return null;
  return { kt: nm / hours, source: 'position' };
}

/**
 * Przyspieszenie podłużne (kt/s) z nachylenia regresji prędkości.
 *
 * Rozbieg to trwałe +1,5…+3 kt/s. Ciasny zakręt, który do złudzenia przypomina
 * lądowanie po samej prędkości, ma przyspieszenie ujemne albo bliskie zeru — a więc
 * ta jedna liczba rozdziela dwa zjawiska, których próg na prędkości rozdzielić nie umie.
 */
export function speedTrendKtPerSec(
  fixes: readonly GpsFix[],
  minSpanSec: number = TREND_MIN_SPAN_SEC,
): number | null {
  const newest = fixes[fixes.length - 1];
  if (newest == null) return null;

  const points: TimePoint[] = [];
  for (const f of fixes) {
    if (f.groundSpeedKt == null) continue;
    points.push({ t: (f.time - newest.time) / 1000, v: f.groundSpeedKt });
  }
  return slopePerSecond(points, minSpanSec);
}

/**
 * Przemieszczenie NETTO okna (NM): odległość między najstarszą a najnowszą pozycją.
 *
 * Świadomie netto, nie długość trasy: suma odcinków między kolejnymi fixami sumuje
 * też dryf odbiornika, więc samolot stojący przez minutę „przejeżdżałby" kilkadziesiąt
 * metrów. Pytanie brzmi „czy jesteśmy gdzie indziej", a nie „ile naskakało po mapie".
 */
export function pathDisplacementNm(fixes: readonly GpsFix[]): number | null {
  const positions = fixes.map(fixPosition).filter((p): p is NonNullable<typeof p> => p != null);
  const first = positions[0];
  const last = positions[positions.length - 1];
  if (first == null || last == null || positions.length < 2) return null;
  return distanceNm(first, last);
}

/**
 * Prędkość kątowa (stopnie/s) z kursu nad ziemią.
 *
 * DARMOWY CZUJNIK: `coords.heading` jest w każdym odczycie lokalizacji i do tej pory
 * był po prostu wyrzucany. Przy prędkościach lotu to wiarygodna prędkość kątowa bez
 * żadnego dodatkowego układu — i wprost lekarstwo na udokumentowane ryzyko „ciasny
 * zakręt udający lądowanie" (§8): przyziemienie ma kurs stabilny, zakręt w kręgu
 * nadlotniskowym trzyma 3–5 °/s przez kilkanaście sekund.
 *
 * Sumujemy różnice KOLEJNYCH kursów (przez `headingDeltaDeg`, więc przejście przez
 * północ nie robi skoku o 360°) i bierzemy moduł sumy: obrót w jedną stronę się
 * kumuluje, a szum wokół stałego kursu znosi się nawzajem.
 */
export function turnRateDps(
  fixes: readonly GpsFix[],
  minSpanSec: number = TREND_MIN_SPAN_SEC,
): number | null {
  const tracked = fixes.filter(
    (f): f is GpsFix & { trackDeg: number } => f.trackDeg != null && Number.isFinite(f.trackDeg),
  );
  if (tracked.length < 2) return null;

  const first = tracked[0]!;
  const last = tracked[tracked.length - 1]!;
  const spanSec = (last.time - first.time) / 1000;
  if (spanSec < minSpanSec) return null;

  let total = 0;
  for (let i = 1; i < tracked.length; i += 1) {
    total += headingDeltaDeg(tracked[i - 1]!.trackDeg, tracked[i]!.trackDeg);
  }
  return Math.abs(total) / spanSec;
}
