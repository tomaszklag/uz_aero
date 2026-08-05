/**
 * UZ Aero — pasy startowe z OpenStreetMap (`aeroway=runway`).
 *
 * PO CO: OurAirports nie ma ani jednego wiersza pasa dla 37 polskich lotnisk — akurat
 * tych aeroklubowych i lądowisk, z których lata lotnictwo ogólne (EPJG, EPOP, EPZR, EPJS…).
 * OSM ma je wszystkie, z oznaczeniem progu i nawierzchnią.
 *
 * DWIE PUŁAPKI GEOMETRII, które ten moduł rozbraja:
 *
 * 1. Pas bywa w OSM ROZBITY na kilka wayów (odcinek utwardzony osobno od trawiastego,
 *    przecięcie z drogą kołowania osobno). Długość pojedynczego waya zaniża wtedy pas
 *    nawet dwukrotnie — EPJS wychodziło 357 m przy realnych ~700 m. Dlatego odcinki
 *    o wspólnej osi łączymy i mierzymy ROZRZUT WZDŁUŻ OSI, a nie długość odcinka.
 *
 * 2. Kierunek waya jest przypadkowy — rysujący mógł prowadzić linię od progu 24 do 06.
 *    Dla prostokąta na mapie to bez znaczenia (ta sama linia), ale wartość w katalogu ma
 *    dać się porównać z oznaczeniem pasa okiem, więc obracamy ją do progu z tagu `ref`.
 *
 * LICENCJA: dane OSM są na ODbL — wygenerowany katalog jest bazą pochodną i musi być
 * udostępniony na tej samej licencji, a aplikacja podaje atrybucję. Szczegóły i powód
 * odrzucenia AIP PAŻP: `docs/dane-lotnisk.md`.
 */

import { axisDeg, axisDifference, bearingDeg, distanceM, projectOnAxis, type LatLon } from './geo';

/** Way z Overpass API (`out geom`) — tylko to, czego używamy. */
export interface OverpassWay {
  readonly id: number;
  readonly tags?: Readonly<Record<string, string>>;
  readonly geometry?: readonly LatLon[];
}

/** Pas złożony z odcinków OSM. */
export interface OsmRunway {
  /** Kurs progu (0–360), obrócony do oznaczenia z `ref`, jeśli jest. */
  readonly headingDeg: number;
  readonly lengthM: number;
  readonly center: LatLon;
  readonly ref: string | null;
}

/** Rozjazd osi, przy którym uznajemy odcinki za ten sam pas. */
const AXIS_TOLERANCE_DEG = 10;

/**
 * Odsunięcie BOCZNE od osi, przy którym odcinek to wciąż ten sam pas.
 *
 * Sama zgodność osi nie wystarcza: Krosno ma dwa pasy równoległe (11R/29L asfalt
 * i 11L/29R trawa) przesunięte względem siebie WZDŁUŻ osi, więc bez tego warunku
 * skleiły się w jedną płytę o długości 1939 m, której tam nie ma. Najszersze pasy
 * mają ~60 m, a pasy równoległe rozdziela się o co najmniej 150 m — próg trafia
 * w środek tej przerwy.
 */
const MAX_LATERAL_OFFSET_M = 80;

/**
 * Kurs z oznaczenia pasa: `06/24` → 60, `13-31` → 130, `09R/27L` → 90, `18/36` → 180.
 * Bierzemy PIERWSZY próg, bo tak zapisuje się pas (od mniejszego numeru).
 */
export function headingFromRef(ref: string | null | undefined): number | null {
  if (ref == null) return null;
  const m = /(\d{1,2})/.exec(ref.trim());
  if (m == null) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 36) return null;
  return (n * 10) % 360;
}

/**
 * Oś obrócona tak, żeby zgadzała się z oznaczeniem progu.
 *
 * Bez `ref` zostawiamy oś w zakresie 0–180: pas jest tą samą płytą niezależnie od tego,
 * który koniec nazwiemy początkiem, więc wybieramy wariant deterministyczny zamiast
 * przypadkowego kierunku rysowania w OSM.
 *
 * Oznaczenia są MAGNETYCZNE, a geometria geograficzna — w Polsce różnica to ~6°, czyli
 * dużo mniej niż połowa zakresu, więc wybór bliższego wariantu jest jednoznaczny.
 */
export function alignHeadingToRef(headingDeg: number, ref: string | null | undefined): number {
  const axis = axisDeg(headingDeg);
  const target = headingFromRef(ref);
  if (target == null) return Math.round(axis) % 360;

  const opposite = (axis + 180) % 360;
  const gap = (a: number, b: number): number => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  return Math.round(gap(axis, target) <= gap(opposite, target) ? axis : opposite) % 360;
}

interface Segment {
  readonly a: LatLon;
  readonly b: LatLon;
  readonly axis: number;
  readonly lengthM: number;
  readonly ref: string | null;
}

/** Odcinek z waya: liczy się przebieg od pierwszego do ostatniego węzła. */
function segmentOf(way: OverpassWay): Segment | null {
  const geometry = way.geometry;
  if (geometry == null || geometry.length < 2) return null;
  const a = geometry[0]!;
  const b = geometry[geometry.length - 1]!;
  const lengthM = distanceM(a, b);
  if (lengthM < 1) return null;
  return {
    a,
    b,
    axis: axisDeg(bearingDeg(a, b)),
    lengthM,
    ref: way.tags?.ref ?? null,
  };
}

/**
 * Czy odcinek leży na tej samej płycie co odcinek prowadzący grupy: ta sama oś
 * ORAZ ta sama linia, a nie tylko ten sam kierunek gdzieś obok.
 */
function belongsToSameRunway(lead: Segment, segment: Segment): boolean {
  if (axisDifference(lead.axis, segment.axis) > AXIS_TOLERANCE_DEG) return false;

  const middle = {
    lat: (segment.a.lat + segment.b.lat) / 2,
    lon: (segment.a.lon + segment.b.lon) / 2,
  };
  // Rzut na prostopadłą do osi: odległość od linii pasa, niezależnie od tego,
  // jak daleko odcinek leży wzdłuż niej.
  const lateral = Math.abs(projectOnAxis(middle, lead.a, lead.axis + 90));
  return lateral <= MAX_LATERAL_OFFSET_M;
}

/**
 * Pasy JEDNEGO lotniska, od najdłuższego.
 *
 * Wejściem są waye przypisane wcześniej do tego lotniska (`osmAssignment.ts`) — moduł
 * celowo nie zna pojęcia odległości od punktu odniesienia, żeby grupowanie po osi dało
 * się sprawdzić testem bez wymyślania współrzędnych lotniska.
 */
export function runwaysFromWays(ways: readonly OverpassWay[]): OsmRunway[] {
  const segments = ways
    .map(segmentOf)
    .filter((s): s is Segment => s != null)
    // Od najdłuższego: to jego oś i oznaczenie opisują grupę, bo krótkie fragmenty
    // mają większy błąd kierunku i częściej gubią tag `ref`.
    .sort((x, y) => y.lengthM - x.lengthM);

  const groups: Segment[][] = [];
  for (const segment of segments) {
    const group = groups.find((g) => belongsToSameRunway(g[0]!, segment));
    if (group == null) groups.push([segment]);
    else group.push(segment);
  }

  return groups
    .map((group) => {
      const lead = group[0]!;
      const points = group.flatMap((s) => [s.a, s.b]);
      const origin = lead.a;

      // Długość = rozrzut rzutów na oś. Odcinki rozbitego pasa sumują się w całość,
      // a dwa pasy równoległe nie wydłużają wyniku o przekątną między nimi.
      const projections = points.map((p) => projectOnAxis(p, origin, lead.axis));
      const lengthM = Math.round(Math.max(...projections) - Math.min(...projections));

      const ref = group.find((s) => s.ref != null)?.ref ?? null;
      return {
        headingDeg: alignHeadingToRef(lead.axis, ref),
        lengthM,
        center: {
          lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
          lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
        },
        ref,
      };
    })
    .sort((x, y) => y.lengthM - x.lengthM);
}
