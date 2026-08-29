/**
 * UZ Aero - próbkowanie logu punktów do wyświetlenia.
 *
 * Lot ma ~1 500 punktów, a log na ekranie ma być czytelny i lekki (telefon rysuje go
 * w liście, panel wysyła przez sieć). Pokazujemy więc co N sekund - ale z jednym
 * wyjątkiem, który jest sednem tej funkcji: **punkty odrzucone pokazujemy ZAWSZE**.
 *
 * Powód jest wprost z przeznaczenia ekranu. Log istnieje po to, żeby zobaczyć, gdzie
 * bramka jakości zadziałała i dlaczego - próbkowanie, które zgubiłoby akurat ten jeden
 * fix z dokładnością 68 m, zabrałoby logowi całą jego wartość. Odrzuconych jest z natury
 * mało (kilkadziesiąt na lot), więc nie psuje to ani rozmiaru, ani czytelności.
 */

import { isUsablePoint, type TrackPoint } from './point';

/** Domyślny krok próbkowania - co pół minuty, jak w mockupach 14 i A02c. */
export const DEFAULT_LOG_SAMPLE_MS = 30_000;

/**
 * Zwraca punkty do pokazania w logu: co `everyMs` plus wszystkie odrzucone.
 *
 * Pierwszy i ostatni punkt zostają zawsze - to start i koniec lotu, czyli wiersze,
 * które czyta się najczęściej.
 */
export function sampleTrackLog(
  points: readonly TrackPoint[],
  everyMs: number = DEFAULT_LOG_SAMPLE_MS,
): TrackPoint[] {
  if (points.length === 0) return [];

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const out: TrackPoint[] = [];
  let lastSampledAt: number | null = null;

  for (const point of points) {
    const isEdge = point === first || point === last;
    const isRejected = !isUsablePoint(point);
    const dueBySchedule = lastSampledAt == null || point.time - lastSampledAt >= everyMs;

    if (isEdge || isRejected || dueBySchedule) {
      out.push(point);
      // Zegar próbkowania przesuwają WYŁĄCZNIE punkty wzięte z harmonogramu.
      // Gdyby przesuwał go każdy odrzucony, seria zakłóceń przerzedziłaby log
      // dokładnie tam, gdzie potrzeba go najgęściej.
      if (dueBySchedule) lastSampledAt = point.time;
    }
  }

  return out;
}
