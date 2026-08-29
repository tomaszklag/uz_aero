/**
 * UZ Aero - projekcja ŚLADU LOTU: surowe wpisy + okno czasowe lotu → trasa do narysowania.
 *
 * KLUCZOWA DECYZJA (2026-08-03): lot i ślad wiąże CZAS, nie żaden nowy identyfikator.
 * `Flight` z `projections/session.ts` niesie `takeoffAt` i `landingAt`, a każdy wpis
 * śladu ma `time` i `sessionUuid` - więc „ślad lotu 3" to po prostu wycinek zapisu tej
 * sesji między dwoma znacznikami. Nie trzeba ani migracji, ani wiązania zapisywanego
 * w locie, a ślad pozostaje tym, czym był: materiałem obok rejestru, nie jego częścią.
 *
 * Konsekwencja, o której trzeba pamiętać: gdy administrator poprawi czas startu
 * (`event_correction` typu `retime`), ślad lotu ZMIENI SIĘ sam przy następnym otwarciu,
 * bo okno liczy się z rejestru po korektach. To jest pożądane - mapa ma pokazywać lot
 * tak, jak go dziś rozumie rejestr, a nie tak, jak rozumiał go telefon w chwili zapisu.
 */

import { distanceNm, type LatLon } from '../detection/geo';
import type { EpochMillis } from '../time';
import { isUsablePoint, type RawTrackEntry, type TrackPoint } from './point';
import { rejectionReason } from './quality';
import { DEFAULT_SIMPLIFY_TOLERANCE_M, simplifyTrack } from './simplify';
import { GPS_THRESHOLDS, type GpsThresholds } from '../detection/thresholds';

/** Okno czasowe lotu. `landingAt: null` = lot w powietrzu (ślad do teraz). */
export interface FlightWindow {
  takeoffAt: EpochMillis;
  landingAt: EpochMillis | null;
}

/** Punkt geometrii z czasem - linia na mapie plus możliwość pokazania „gdzie o której". */
export interface TrackVertex extends LatLon {
  time: EpochMillis;
  altitudeFt: number | null;
  /**
   * Prędkość względem ziemi (kt) w tym punkcie.
   *
   * Doszła przy issue #47 razem z kursorem sprzężonym: po kompresji telefon nie ma już
   * surowych fixów, więc odczyt „co się działo o 08:31" musi mieć z czego powstać.
   * Koszt to kilka bajtów na wierzchołek uproszczonej linii - nieporównywalnie mniej
   * niż wysyłanie w tym celu pełnego nagrania.
   */
  groundSpeedKt: number | null;
}

/** Gotowy ślad lotu - wszystko, czego potrzebuje ekran mapy i log punktów. */
export interface FlightTrack {
  /** Wszystkie punkty w oknie, RAZEM z odrzuconymi (log pokazuje powód). */
  points: TrackPoint[];
  /** Geometria po bramce i uproszczeniu - to rysuje mapa. */
  line: TrackVertex[];
  /** Suma odcinków między przyjętymi punktami (mile morskie). */
  distanceNm: number;
  /** Najwyższy przyjęty odczyt wysokości GPS; null, gdy żaden punkt jej nie niósł. */
  maxAltitudeFt: number | null;
  /** Czas pierwszego i ostatniego PRZYJĘTEGO punktu (nie: okna lotu). */
  startedAt: EpochMillis | null;
  endedAt: EpochMillis | null;
  /** Ile wpisów wpadło w okno i ile z nich weszło do geometrii. */
  totalCount: number;
  usableCount: number;
}

/** Pusty ślad - lot bez zapisu GPS (wpis ręczny albo zapis po retencji). Wariant 14B. */
export function emptyFlightTrack(): FlightTrack {
  return {
    points: [],
    line: [],
    distanceNm: 0,
    maxAltitudeFt: null,
    startedAt: null,
    endedAt: null,
    totalCount: 0,
    usableCount: 0,
  };
}

export interface BuildTrackOptions {
  /** Tolerancja upraszczania linii (metry). */
  toleranceM?: number;
  thresholds?: GpsThresholds;
}

/**
 * Buduje ślad lotu z surowego zapisu.
 *
 * @param entries wpisy śladu JEDNEJ sesji, w dowolnej kolejności (sortujemy sami -
 *   zapis wsadowy i retro-datowanie potrafią je pomieszać, tak samo jak w rejestrze).
 * @param window okno lotu z projekcji sesji.
 */
/**
 * Surowe wiersze śladu → punkty po bramce jakości, w kolejności czasu.
 *
 * Wydzielone z `buildFlightTrack`, bo tej samej konwersji potrzebuje oś faz pionowych
 * (`consumption/phaseTimeline.ts`), która pracuje na CAŁYM nagraniu, a nie na oknie
 * jednego lotu. Druga kopia tej pętli oznaczałaby drugą bramkę jakości - i ślad
 * pokazywałby na mapie coś innego, niż widziała analityka.
 *
 * Wejście musi być posortowane rosnąco po czasie: test skoku pozycji porównuje z ostatnim
 * PRZYJĘTYM punktem, więc przemieszana kolejność dałaby fałszywe odrzucenia.
 */
export function toTrackPoints(
  entries: readonly RawTrackEntry[],
  thresholds: GpsThresholds = GPS_THRESHOLDS,
): TrackPoint[] {
  const points: TrackPoint[] = [];
  // Ostatni PRZYJĘTY punkt - odniesienie testu skoku. Odrzucony nie może być
  // odniesieniem, bo jedna teleportacja unieważniłaby cały ogon trasy.
  let previousAccepted: { lat: number; lon: number; time: EpochMillis } | null = null;

  for (const entry of entries) {
    const rejected = rejectionReason(entry, previousAccepted, thresholds);
    const point: TrackPoint = {
      time: entry.time,
      // Punkty bez pozycji dostają 0/0 i `rejected = 'no-position'` - nigdy nie trafią
      // do geometrii, a log ma pokazać, że wiersz w zapisie był.
      lat: entry.lat ?? 0,
      lon: entry.lon ?? 0,
      altitudeFt: entry.alt ?? null,
      groundSpeedKt: entry.gs ?? null,
      trackDeg: entry.trackDeg ?? null,
      accuracyM: entry.accuracyM ?? null,
      rejected,
    };
    points.push(point);
    if (rejected == null) {
      previousAccepted = { lat: point.lat, lon: point.lon, time: point.time };
    }
  }

  return points;
}

export function buildFlightTrack(
  entries: readonly RawTrackEntry[],
  window: FlightWindow,
  options: BuildTrackOptions = {},
): FlightTrack {
  const toleranceM = options.toleranceM ?? DEFAULT_SIMPLIFY_TOLERANCE_M;
  const thresholds = options.thresholds ?? GPS_THRESHOLDS;

  // Lot otwarty (w powietrzu) nie ma górnej granicy - ślad idzie do ostatniego wpisu.
  const until = window.landingAt ?? Number.POSITIVE_INFINITY;

  const inWindow = entries
    .filter((e) => e.kind === 'fix' && e.time >= window.takeoffAt && e.time <= until)
    .sort((a, b) => a.time - b.time);

  if (inWindow.length === 0) return emptyFlightTrack();

  const points = toTrackPoints(inWindow, thresholds);

  const usable = points.filter(isUsablePoint);
  if (usable.length === 0) {
    return { ...emptyFlightTrack(), points, totalCount: points.length };
  }

  // Dystans z PEŁNEJ listy przyjętych punktów, nie z uproszczonej: upraszczanie służy
  // rysowaniu, a nie liczeniu. Liczenie po uproszczonej zaniżyłoby dystans o długość
  // wszystkich ściętych zakrętów - najbardziej właśnie tam, gdzie samolot krąży.
  let distance = 0;
  for (let i = 1; i < usable.length; i++) {
    distance += distanceNm(
      { lat: usable[i - 1]!.lat, lon: usable[i - 1]!.lon },
      { lat: usable[i]!.lat, lon: usable[i]!.lon },
    );
  }

  const altitudes = usable
    .map((p) => p.altitudeFt)
    .filter((a): a is number => a != null);

  const vertices: TrackVertex[] = usable.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    time: p.time,
    altitudeFt: p.altitudeFt,
    groundSpeedKt: p.groundSpeedKt,
  }));

  return {
    points,
    line: simplifyTrack(vertices, toleranceM),
    distanceNm: distance,
    maxAltitudeFt: altitudes.length > 0 ? Math.max(...altitudes) : null,
    startedAt: usable[0]!.time,
    endedAt: usable[usable.length - 1]!.time,
    totalCount: points.length,
    usableCount: usable.length,
  };
}
