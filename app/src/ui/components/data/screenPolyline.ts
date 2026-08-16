/**
 * UZ Aero — PUNKTY ŁAMANEJ W PRZESTRZENI EKRANU (issue #47 pkt 1).
 *
 * ══ BŁĄD, KTÓRY TEN PLIK NAPRAWIA ══
 * `TrackPolyline` rysowało odcinek między każdą parą sąsiednich punktów, a odcinki
 * krótsze niż pół piksela POMIJAŁO — zamiast scalić je z następnym. Każdy pominięty
 * odcinek zostawiał DZIURĘ, więc gęsty zapis rysował się jako sypka kreska albo wręcz
 * jako zbiór kropek. Widać to było na obu wykresach ekranu 14 i z dwóch różnych powodów:
 *
 *  • **profil pionowy** dostawał WSZYSTKIE próbki bez upraszczania — godzinny bieg
 *    silnika przy fixie co sekundę to 3 600 punktów na ~290 px, czyli 0,08 px na odcinek.
 *    Odpadały praktycznie wszystkie; zostawały pojedyncze szpilki tam, gdzie wysokość
 *    GPS skoczyła o kilkadziesiąt stóp — czyli rysunek SZUMU zamiast profilu lotu;
 *  • **mapa** dostawała linię uproszczoną RDP z tolerancją 25 METRÓW, ale metry stają
 *    się pikselami dopiero po dobraniu kadru: przy locie rozciągniętym na 20 km to
 *    ~0,4 px na odcinek. Ta sama dziurawa kreska, tyle że zależna od rozpiętości trasy —
 *    stąd „czasem widać linię, czasem kropki".
 *
 * ══ ROZWIĄZANIE ══
 * Decymacja W PIKSELACH, nie odrzucanie: idziemy po punktach i zachowujemy ten, który
 * odsunął się od OSTATNIEGO ZACHOWANEGO o co najmniej `minStepPx`. Punkty pominięte nie
 * znikają z rysunku — zostają wchłonięte przez odcinek do następnego zachowanego, więc
 * linia jest ciągła z definicji. Pierwszy i ostatni zostają zawsze.
 *
 * Zysk uboczny jest duży: liczba `<View>` na wykres spada z tysięcy do setek, a przy
 * tej gęstości i tak nie było czego oglądać — kilkanaście próbek na piksel nie ma jak
 * zmienić rysunku.
 */

import type { Point2D } from './TrackPolyline';

/**
 * Domyślny krok decymacji (px).
 *
 * Jeden piksel to granica, poniżej której rysunek nie może się już zmienić. Większy
 * krok zaczyna ścinać ciasne zakręty (spirala wznoszenia nad polem skoków), mniejszy
 * kosztuje wyłącznie liczbę odcinków.
 */
export const MIN_SCREEN_STEP_PX = 1;

/**
 * Punkty do narysowania: te same co na wejściu, tylko bez tych, które nie mają jak
 * zmienić obrazu.
 *
 * @param points punkty w kolejności trasy (czasu), już przeliczone na ekran.
 */
export function screenPath(
  points: readonly Point2D[],
  minStepPx: number = MIN_SCREEN_STEP_PX,
): Point2D[] {
  if (points.length <= 2) return [...points];

  const out: Point2D[] = [points[0]!];
  let last = points[0]!;

  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i]!;
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (dx * dx + dy * dy >= minStepPx * minStepPx) {
      out.push(point);
      last = point;
    }
  }

  // Ostatni punkt ZAWSZE — to koniec nagrania i domknięcie linii. Bez niego trasa
  // urywałaby się do piksela przed lądowaniem.
  out.push(points[points.length - 1]!);
  return out;
}

/** Jeden prostokąt do narysowania: pozycja lewego górnego rogu PRZED obrotem. */
export interface PolylineSegment {
  left: number;
  top: number;
  /** Długość RYSOWANA — dłuższa od geometrycznej o grubość kreski (patrz niżej). */
  length: number;
  thickness: number;
  angleRad: number;
}

/**
 * Odcinki łamanej — z NADMIAREM na styku (issue #47, druga tura przeglądu).
 *
 * ══ DLACZEGO PROSTOKĄT JEST DŁUŻSZY OD ODCINKA ══
 * Prostokąt o DOKŁADNEJ długości odcinka styka się z sąsiadem w jednym punkcie osi,
 * a nie całą krawędzią. Przy zaokrąglonych końcach (`borderRadius`) i obrocie dokłada
 * się do tego wygładzanie krawędzi i zaokrąglanie pozycji do pełnych pikseli — i styk
 * przestaje być stykiem. Widać to w dwóch miejscach naraz:
 *  • na ZAŁAMANIU wierzchołek jest ścięty, jakby linia się urywała,
 *  • na ŁUKU o krótkich odcinkach (spirala wznoszenia po decymacji ekranowej) linia
 *    rozpada się w kropki — bo przy długości rzędu 2 px zaokrąglenie zjada prawie
 *    całą kreskę.
 * Sprawdzone rysunkiem: ta sama łamana raz z długością dokładną, raz wydłużoną.
 *
 * Rozwiązanie jest jednym mnożeniem: prostokąt dostaje `length + thickness`, czyli
 * wystaje o pół grubości z każdej strony. Sąsiedzi zachodzą na siebie, a zaokrąglony
 * koniec wystający dokładnie do wierzchołka staje się okrągłym złączem — tym samym,
 * które w SVG robi `stroke-linejoin: round`.
 *
 * Koszt: linia wystaje o pół grubości poza swój pierwszy i ostatni punkt. Przy kresce
 * 2,5 px to ~1 px na obu końcach całej trasy — niewidoczne, a próba dociągnięcia tego
 * kosztowałaby osobny wariant dla dwóch skrajnych odcinków.
 */
export function polylineSegments(
  path: readonly Point2D[],
  thickness: number,
): PolylineSegment[] {
  const segments: PolylineSegment[] = [];

  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]!;
    const to = path[i]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const span = Math.sqrt(dx * dx + dy * dy);
    // Punkty dokładnie pokryte (ten sam piksel) — `atan2(0,0)` byłoby zerem bez
    // znaczenia, a kropka i tak zostanie postawiona przez sąsiadów.
    if (span === 0) continue;

    const length = span + thickness;

    segments.push({
      // Prostokąt stoi ŚRODKIEM na środku odcinka, więc obrót wokół środka (domyślny
      // w RN) trafia dokładnie w linię — bez `transformOrigin`.
      left: (from.x + to.x) / 2 - length / 2,
      top: (from.y + to.y) / 2 - thickness / 2,
      length,
      thickness,
      angleRad: Math.atan2(dy, dx),
    });
  }

  return segments;
}
