/**
 * UZ Aero - ŚLAD SESJI PRZEZ SIEĆ: jeden kształt dla serwera i telefonu (issue #47).
 *
 * ══ CO TU JEST, A CZEGO NIE MA ══
 * Payload niesie WYŁĄCZNIE to, czego rejestr na telefonie nie wie: geometrię i liczby
 * z niej policzone. Rejestracji maszyny, listy lotów, czasu w powietrzu ani godzin
 * startów tu NIE MA - telefon ma je lokalnie i liczy z nich tak samo jak dotąd
 * (§6 pkt 1: ekrany liczą się z lokalnego strumienia). Gdyby wjechały do tej koperty,
 * powstałaby druga prawda o sesji, przysłana z drugiej strony łącza, i pierwszy rozjazd
 * czasu po korekcie administratora byłby nie do rozstrzygnięcia.
 *
 * ══ KOMPRESJA (issue #47 pkt 6) ══
 * Nagranie to ~1 fix/s, czyli kilkadziesiąt tysięcy wierszy na dzień lotny. Przez sieć
 * nie idzie ani jeden z nich w surowej postaci:
 *  • **linia** - RDP w metrach (`simplifyTrack`): zostają wierzchołki, które ZMIENIAJĄ
 *    kształt, a prosta między nimi znika,
 *  • **profil** - RDP w stopach (`simplifyProfile`): to samo w osi wysokości,
 *  • **liczby** - przycięte do rozdzielczości, w jakiej cokolwiek znaczą: 5 miejsc po
 *    przecinku to ~1 m w Polsce, a dziesiąte części stopy na wysokości GPS opisują
 *    wyłącznie szum odbiornika.
 * Statystyki liczą się PRZED upraszczaniem, z kompletu punktów - inaczej „max
 * wznoszenie" zależałoby od tolerancji rysowania.
 *
 * ══ CZEGO TU NIE MA: LOGU PUNKTÓW ══
 * Tabela surowych fixów ze stanem bramki jakości była największą częścią tej koperty
 * (~300 wierszy na sesję) i zniknęła z ekranu przy przeglądzie issue #47: to materiał
 * do STROJENIA PROGÓW, a nie odpowiedź na pytanie pilota. Została tam, gdzie służy -
 * w panelu (`admin/queries/flightTrack.ts`, własny kontrakt) i w nagraniu czytanym
 * przez `server/scripts/replay.ts`. Liczby `totalCount`/`usableCount` zostają, bo one
 * jedne mówią coś o jakości TEGO zapisu.
 */

import type { EpochMillis } from '../time';
import { buildFlightTrack, type BuildTrackOptions, type TrackVertex } from './flightTrack';
import type { RawTrackEntry } from './point';
import { buildFlightProfile, type FlightProfile, type ProfileSample } from './profile';
import { DEFAULT_PROFILE_TOLERANCE_FT, simplifyProfile } from './simplifyProfile';
import { buildTrackStats, emptyTrackStats, type TrackStats, type TrackStatsInput } from './stats';

/** Miejsca po przecinku pozycji: 5 ≈ 1,1 m szerokości, więcej opisuje sam szum. */
const POSITION_DECIMALS = 5;

/** Ślad jednej sesji w postaci, w jakiej podróżuje przez sieć. */
export interface SessionTrackPayload {
  sessionUuid: string;
  /** Geometria po bramce jakości i uproszczeniu - to rysuje mapa. */
  line: TrackVertex[];
  /** Profil pionowy: liczby z KOMPLETU odczytów, próbki uproszczone do rysowania. */
  profile: FlightProfile;
  distanceNm: number;
  maxAltitudeFt: number | null;
  /** Pierwszy i ostatni PRZYJĘTY punkt nagrania (nie: okno biegu silnika). */
  startedAt: EpochMillis | null;
  endedAt: EpochMillis | null;
  /** Ile wierszy było w nagraniu i ile weszło do geometrii. */
  totalCount: number;
  usableCount: number;
  stats: TrackStats;
}

export interface BuildSessionTrackOptions extends BuildTrackOptions {
  /** Tolerancja upraszczania profilu (stopy). */
  profileToleranceFt?: number;
}

/** Pusty ślad - sesja bez nagrania. Kształt ten sam, żeby odbiorca nie miał wariantu. */
export function emptySessionTrackPayload(sessionUuid: string): SessionTrackPayload {
  return {
    sessionUuid,
    line: [],
    profile: buildFlightProfile([]),
    distanceNm: 0,
    maxAltitudeFt: null,
    startedAt: null,
    endedAt: null,
    totalCount: 0,
    usableCount: 0,
    stats: emptyTrackStats(),
  };
}

/**
 * Buduje kopertę śladu z surowego nagrania jednej sesji.
 *
 * @param entries wiersze nagrania w dowolnej kolejności - `buildFlightTrack` sortuje.
 * @param stats okno biegu silnika i odcinki lotu Z REJESTRU; okno wyznacza też zakres
 *   nagrania, które w ogóle bierzemy pod uwagę.
 */
export function buildSessionTrackPayload(
  sessionUuid: string,
  entries: readonly RawTrackEntry[],
  stats: TrackStatsInput,
  options: BuildSessionTrackOptions = {},
): SessionTrackPayload {
  const track = buildFlightTrack(
    entries,
    { takeoffAt: stats.engineFrom, landingAt: stats.engineTo },
    options,
  );

  if (track.points.length === 0) return emptySessionTrackPayload(sessionUuid);

  const profile = buildFlightProfile(track.points);

  return {
    sessionUuid,
    line: track.line.map(roundVertex),
    profile: {
      ...roundProfileNumbers(profile),
      samples: simplifyProfile(
        profile.samples,
        options.profileToleranceFt ?? DEFAULT_PROFILE_TOLERANCE_FT,
      ).map(roundSample),
    },
    distanceNm: round(track.distanceNm, 2),
    maxAltitudeFt: track.maxAltitudeFt == null ? null : Math.round(track.maxAltitudeFt),
    startedAt: track.startedAt,
    endedAt: track.endedAt,
    totalCount: track.totalCount,
    usableCount: track.usableCount,
    // Statystyki z KOMPLETU punktów, przed upraszczaniem - patrz nagłówek pliku.
    stats: buildTrackStats(track.points, stats),
  };
}

function roundVertex(vertex: TrackVertex): TrackVertex {
  return {
    lat: round(vertex.lat, POSITION_DECIMALS),
    lon: round(vertex.lon, POSITION_DECIMALS),
    time: vertex.time,
    altitudeFt: vertex.altitudeFt == null ? null : Math.round(vertex.altitudeFt),
    groundSpeedKt: vertex.groundSpeedKt == null ? null : Math.round(vertex.groundSpeedKt),
  };
}

function roundSample(sample: ProfileSample): ProfileSample {
  return { time: sample.time, altitudeFt: Math.round(sample.altitudeFt) };
}

/** Liczby podpisu profilu - stopy całkowite, prędkości pionowe do jednego miejsca. */
function roundProfileNumbers(profile: FlightProfile): FlightProfile {
  return {
    ...profile,
    peakAltitudeFt: profile.peakAltitudeFt == null ? null : Math.round(profile.peakAltitudeFt),
    startAltitudeFt: profile.startAltitudeFt == null ? null : Math.round(profile.startAltitudeFt),
    endAltitudeFt: profile.endAltitudeFt == null ? null : Math.round(profile.endAltitudeFt),
    averageClimbFtPerMin:
      profile.averageClimbFtPerMin == null ? null : round(profile.averageClimbFtPerMin, 1),
    averageDescentFtPerMin:
      profile.averageDescentFtPerMin == null ? null : round(profile.averageDescentFtPerMin, 1),
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
