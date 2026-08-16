/**
 * UZ Aero — PODZIAŁKA ODLEGŁOŚCI profilu pionowego (issue #47, trzecia tura przeglądu).
 *
 * Profil ma oś CZASU, a podziałka pokazuje DROGĘ — i to jest cała trudność tego pliku.
 * Na osi czasu nie ma stałego przelicznika „NM na piksel": pięć minut wznoszenia po
 * 70 kt to inna droga niż pięć minut przelotu po 110 kt, a pięć minut postoju to zero.
 * „Średnia NM na piksel" byłaby liczbą, która nie opisuje żadnego miejsca wykresu.
 *
 * Dlatego idziemy jak przy podziałce mapy, tylko od drugiej strony: wybieramy ŁADNĄ
 * liczbę mil (1-2-5) i szukamy, ILE PIKSELI zajmuje ta droga OD LEWEJ KRAWĘDZI kadru.
 * Pasek jest wtedy prawdziwy dla miejsca, w którym stoi: „2 NM" znaczy „tyle ekranu
 * zajęły dwie mile TUTAJ". Przy przesuwaniu wykresu pasek zmienia długość i to jest
 * poprawne — w innym miejscu lotu te same dwie mile trwały inaczej.
 *
 * Gdy w kadrze samolot nie przebył żadnej drogi (postój przy pracującym silniku),
 * podziałki NIE MA: pasek zerowej długości albo rozciągnięty na cały ekran opisywałby
 * wyłącznie dzielenie przez zero.
 */

/** Ładne kroki w milach morskich — ten sam ciąg 1-2-5, co na mapie. */
const STEPS_NM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];

export interface DistanceScale {
  nm: number;
  pixels: number;
  label: string;
}

/**
 * @param distanceAtX droga narastająco (NM) w punkcie X kadru; musi być niemalejąca.
 * @param plotW szerokość kadru (px).
 * @param maxPixels górna granica długości paska.
 */
export function distanceScaleBar(
  distanceAtX: (x: number) => number | null,
  plotW: number,
  maxPixels: number,
): DistanceScale | null {
  if (plotW <= 0 || maxPixels <= 0) return null;

  const start = distanceAtX(0);
  const end = distanceAtX(plotW);
  if (start == null || end == null) return null;
  if (end - start <= 0) return null;

  // Od największego kroku w dół: bierzemy pierwszy, który mieści się w limicie.
  for (let i = STEPS_NM.length - 1; i >= 0; i--) {
    const nm = STEPS_NM[i]!;
    if (start + nm > end) continue; // tej drogi nie ma w kadrze

    const pixels = pixelsFor(distanceAtX, plotW, start + nm);
    if (pixels != null && pixels <= maxPixels) {
      return { nm, pixels, label: `${formatNm(nm)} NM` };
    }
  }

  return null;
}

/** Ile pikseli od lewej krawędzi do miejsca, w którym droga osiąga `target` (bisekcja). */
function pixelsFor(
  distanceAtX: (x: number) => number | null,
  plotW: number,
  target: number,
): number | null {
  let low = 0;
  let high = plotW;

  // Droga jest niemalejąca, więc bisekcja jest tu poprawna; 24 kroki starczają na
  // dokładność poniżej pół piksela przy każdej realnej szerokości wykresu.
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    const value = distanceAtX(mid);
    if (value == null) return null;
    if (value < target) low = mid;
    else high = mid;
  }

  return high;
}

/**
 * „0.5", „2", „10" — bez zbędnego zera po przecinku.
 *
 * Kropka, nie przecinek: tak samo jak dystans sesji w statystykach („38.4 NM"), żeby
 * dwie liczby o tej samej wielkości na jednym ekranie nie były pisane inaczej.
 */
export function formatNm(nm: number): string {
  return String(Number(nm.toFixed(2)));
}
