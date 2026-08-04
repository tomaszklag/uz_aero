/**
 * UZ Aero — upraszczanie linii śladu (Ramer–Douglas–Peucker).
 *
 * PO CO: lot ze zrzutem to ~1 500 fixów, dzień lotny — kilkadziesiąt tysięcy. Rysowanie
 * ich wprost zabija mapę na telefonie, a różnicy nie widać: przy zoomie, w jakim ogląda
 * się ślad, sąsiednie punkty spiralnego wznoszenia różnią się o ułamek piksela.
 *
 * DLACZEGO AKURAT RDP, a nie „co n-ty punkt": decymacja co n-ty jest ślepa na kształt
 * i psuje dokładnie to, co w tym śladzie jest ciekawe. Ciasny zakręt nad progiem pasa
 * potrafi trwać cztery odczyty — próbkowanie co dziesiąty po prostu go zetnie, a RDP
 * zachowa go w całości i wytnie zamiast tego prostą, na której nic się nie dzieje.
 *
 * Odległość liczymy w METRACH po ortodromie (`distanceM`), nie w stopniach: stopień
 * długości geograficznej w Polsce to ~62 % stopnia szerokości, więc próg w stopniach
 * upraszczałby przebiegi wschód–zachód inaczej niż północ–południe.
 */

import { distanceM } from '../detection/geo';
import type { LatLon } from '../detection/geo';

/**
 * Domyślna tolerancja (metry). 25 m to ~2 px przy zoomie, w jakim mieści się cały lot
 * lokalny — poniżej tego progu upraszczanie przestaje cokolwiek dawać, a zaczyna
 * gubić kształt zakrętów.
 */
export const DEFAULT_SIMPLIFY_TOLERANCE_M = 25;

/**
 * Odległość punktu od odcinka (metry), liczona na płaszczyźnie stycznej.
 *
 * Rzutujemy stopnie na lokalny układ metryczny wokół `start`: przy odcinkach rzędu
 * kilometrów krzywizna Ziemi jest poniżej progu tolerancji, więc pełna geometria sferyczna
 * byłaby kosztem bez efektu. Skalowanie długości przez `cos(lat)` zostaje — bez niego
 * błąd sięgałby 40 % i to już widać.
 */
function perpendicularDistanceM(point: LatLon, start: LatLon, end: LatLon): number {
  // Metry na stopień: szerokość jest stała, długość zwężają się ku biegunom.
  const latRad = (start.lat * Math.PI) / 180;
  const mPerDegLat = 111_132;
  const mPerDegLon = 111_320 * Math.cos(latRad);

  const px = (point.lon - start.lon) * mPerDegLon;
  const py = (point.lat - start.lat) * mPerDegLat;
  const ex = (end.lon - start.lon) * mPerDegLon;
  const ey = (end.lat - start.lat) * mPerDegLat;

  const lengthSq = ex * ex + ey * ey;
  // Odcinek zdegenerowany do punktu — wtedy „odległość od odcinka" to odległość od niego.
  if (lengthSq === 0) return distanceM(point, start);

  // Rzut skalarny przycięty do <0,1>, żeby nie mierzyć do przedłużenia odcinka.
  let t = (px * ex + py * ey) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const dx = px - t * ex;
  const dy = py - t * ey;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Upraszcza łamaną, zachowując punkty odchylone od cięciwy o więcej niż `toleranceM`.
 *
 * Pierwszy i ostatni punkt zostają ZAWSZE — to start i lądowanie, czyli jedyne dwa
 * punkty śladu, które mają nazwę na ekranie.
 *
 * Implementacja iteracyjna, nie rekurencyjna: rekurencja na 30 tys. punktów potrafi
 * przepełnić stos na telefonie, a to jedyne miejsce w domenie, gdzie wejście bywa
 * tak długie.
 */
export function simplifyTrack<T extends LatLon>(
  points: readonly T[],
  toleranceM: number = DEFAULT_SIMPLIFY_TOLERANCE_M,
): T[] {
  if (points.length <= 2) return [...points];

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  // Stos zakresów do przetworzenia — zamiast wywołań rekurencyjnych.
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const range = stack.pop();
    if (range == null) break;
    const [first, last] = range;
    if (last <= first + 1) continue;

    let maxDist = -1;
    let maxIndex = first;
    const start = points[first]!;
    const end = points[last]!;

    for (let i = first + 1; i < last; i++) {
      const dist = perpendicularDistanceM(points[i]!, start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > toleranceM) {
      keep[maxIndex] = true;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}
