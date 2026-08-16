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

/**
 * Kąt załamania, powyżej którego wierzchołek dostaje ZAŚLEPKĘ (radiany, ~20°).
 *
 * Łamana z obróconych prostokątów styka się w punkcie osi, a nie całą krawędzią: przy
 * ostrym zakręcie po zewnętrznej stronie zostaje klinowaty wycinek, a Android dokłada
 * do tego zaokrąglanie pozycji do pełnych pikseli. Efekt widać dokładnie tam, gdzie
 * trasa się przełamuje — linia wygląda, jakby się urywała i zaczynała od nowa.
 *
 * Zaślepka to kropka o średnicy grubości kreski, postawiona na wierzchołku. Stawiamy ją
 * WYŁĄCZNIE przy realnym załamaniu, bo przy prostej byłaby setką widoków bez powodu.
 */
export const JOINT_MIN_ANGLE_RAD = 0.35;

/**
 * Wierzchołki wymagające zaślepki — te, na których kierunek zmienia się na tyle,
 * że styk dwóch prostokątów zostawia szczerbę.
 */
export function polylineJoints(
  path: readonly Point2D[],
  minAngleRad: number = JOINT_MIN_ANGLE_RAD,
): Point2D[] {
  if (path.length < 3) return [];

  const joints: Point2D[] = [];

  for (let i = 1; i < path.length - 1; i++) {
    const previous = path[i - 1]!;
    const current = path[i]!;
    const next = path[i + 1]!;

    const inAngle = Math.atan2(current.y - previous.y, current.x - previous.x);
    const outAngle = Math.atan2(next.y - current.y, next.x - current.x);

    // Różnicę sprowadzamy do <−π, π>, żeby przejście przez 180° nie udawało zakrętu
    // o pełny obrót.
    let delta = outAngle - inAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    if (Math.abs(delta) >= minAngleRad) joints.push(current);
  }

  return joints;
}
