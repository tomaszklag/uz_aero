/**
 * UZ Aero - panel 2.0: KTÓRY znacznik śladu dostaje podpis (moduł CZYSTY).
 *
 * ══ SKĄD SIĘ WZIĄŁ ══
 * Dzień skokowy to kilkanaście startów i lądowań na TYM SAMYM placu: w kadrze mapy
 * ich znaczniki mieszczą się w czterdziestu pikselach, a każdy niósł własny podpis
 * („T/O 1", „LDG 1", „T/O 2"…). Napisy kładły się jeden na drugim i nie dawało się
 * odczytać ANI JEDNEGO - czyli dwanaście podpisów mówiło mniej niż jeden.
 *
 * ══ GASIMY PODPIS, NIE ZNACZNIK ══
 * Kropka zostaje ZAWSZE. Ona niesie fakty, które mapa ma pokazać: gdzie to było
 * i czy to był start (zielona), czy lądowanie (błękitna). Znika sam NAPIS, i to
 * wyłącznie tam, gdzie i tak byłby nieczytelny - lot po trasie zachowuje wszystkie
 * podpisy, bo jego znaczniki stoją osobno.
 *
 * Numeracji „tylko pierwszy i ostatni" świadomie NIE robimy: przy dwunastu lotach
 * dwa podpisy czytałyby się jak dwa loty, czyli kłamałyby o dniu. Numery lotów są
 * na tym samym ekranie, na osi zdarzeń sesji, i tam odpowiadają na „który to lot".
 *
 * ══ PIERWSZEŃSTWO MA WCZEŚNIEJSZY ══
 * Przebieg jest zachłanny w kolejności chronologicznej, więc pierwszy start dnia
 * podpis dostaje ZAWSZE - a to jest ten sam znacznik, który jako jedyny ma pierścień
 * („gdzie zaczyna się bieg", `trackMarkers.ts`). Oba wyróżnienia trafiają więc na tę
 * samą kropkę, zamiast rozchodzić się po mapie.
 */

/** Znacznik z policzoną pozycją na płótnie - tyle, ile trzeba do rozstawienia napisów. */
export interface LabelCandidate {
  x: number;
  y: number;
  label: string;
}

/**
 * Odsunięcie napisu od kropki. Ta sama liczba wchodzi do `MarkerPlacement.labelX`,
 * więc test zderzeń liczy na DOKŁADNIE tych prostokątach, które narysuje `TrackMap`.
 * Do 2026-09-07 offset mieszkał w `.tsx` (`x={marker.x + 12}`), a tu go w ogóle nie
 * było - bo nie było czego liczyć.
 */
export const LABEL_OFFSET_X = 12;

/** Napis stoi na wysokości kropki, lekko pod jej środkiem - jak w mockupie. */
export const LABEL_OFFSET_Y = 4;

/**
 * Szerokość znaku przy `font-size: 10` w JetBrains Mono (~0,6 em). Krój jest
 * o STAŁEJ szerokości, więc oszacowanie jest dokładne co do ułamka piksela - i tylko
 * dlatego wolno tu mnożyć przez długość napisu zamiast mierzyć tekst w przeglądarce.
 */
const CHAR_WIDTH = 6;

/** Połowa wysokości wiersza napisu - pas, w którym napis faktycznie leży. */
const HALF_HEIGHT = 6;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const boxOf = (marker: LabelCandidate): Box => ({
  left: marker.x + LABEL_OFFSET_X,
  right: marker.x + LABEL_OFFSET_X + marker.label.length * CHAR_WIDTH,
  top: marker.y + LABEL_OFFSET_Y - HALF_HEIGHT,
  bottom: marker.y + LABEL_OFFSET_Y + HALF_HEIGHT,
});

const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Które znaczniki dostają podpis - `true` na tej samej pozycji, co znacznik wejściowy.
 *
 * Test jest zderzeniem PROSTOKĄTÓW, a nie odległością środków: dwa znaczniki oddalone
 * o dwadzieścia pikseli w pionie nie przeszkadzają sobie wcale, a te same dwadzieścia
 * w poziomie kładzie napis na napisie - bo napis rośnie tylko w jedną stronę.
 */
export function visibleLabels(markers: readonly LabelCandidate[]): boolean[] {
  const kept: Box[] = [];
  return markers.map((marker) => {
    const box = boxOf(marker);
    if (kept.some((other) => overlap(box, other))) return false;
    kept.push(box);
    return true;
  });
}
