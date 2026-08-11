/**
 * UZ Aero — czysta translacja odczytu platformy na `GpsFix` domeny.
 *
 * Typ parametru jest STRUKTURALNY (nie `Location.LocationObject`), bo moduł musi być
 * widoczny dla testów RN-free (jest nie wciąga expo) i dla modułu taska tła, który
 * nie może dotykać `expo-location` (test architektury trzyma dokładną listę
 * importerów). Odczyt expo pasuje strukturalnie — kompilator pilnuje zgodności
 * w miejscu wywołania. Wzorzec ekstrakcji: `infrastructure/storage/schema.ts`.
 */

import { geoidUndulationM, type GpsFix } from '../../domain';

/** Kształt odczytu platformy — dokładnie te pola, które konsumujemy. */
export interface RawLocation {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
  };
  /** Czas FIXA (zegar GPS), nie zegar urządzenia — §4.5. */
  timestamp: number;
}

export const METERS_TO_FEET = 3.280839895;
export const MPS_TO_KNOTS = 1.943844492;

/**
 * Odczyt platformy → fix domeny.
 *
 * BRAK POMIARU MAPUJEMY NA `null`, NIGDY NA ZERO (poprawka 2026-07-30). Poprzednia
 * wersja robiła `coords.speed ?? 0` i to była realna przyczyna spóźnionego wykrywania
 * kołowania: Android przy małych prędkościach albo nie podaje prędkości wcale, albo
 * zeruje ją filtrem static-hold w układzie GNSS. Detektor dostawał wtedy twarde „0 kt"
 * — pomiar, którego nikt nie wykonał, w przebraniu pomiaru wiarygodnego. Teraz brak
 * jest jawny i domena odtwarza prędkość z przemieszczenia (`trends.groundSpeed`).
 *
 * Wartości ujemne to androidowy idiom „niedostępne" (−1) — traktujemy jak brak.
 *
 * WYSOKOŚĆ PRZECHODZI KOREKTĘ ELIPSOIDA→AMSL (poprawka 2026-08-11, zgłoszenie
 * z EPNL: elewacja 830 ft, wskazanie ~950 ft). Android podaje wysokość nad elipsoidą
 * WGS84, a domena kontraktowo mówi stopami AMSL — różnicę (undulację geoidy, w Polsce
 * ~30–40 m) odejmujemy TUTAJ, bo to własność układu odniesienia platformy, nie danych
 * lotu: nagrane ślady niosą już wysokość po korekcie i `replay.ts` nie może jej
 * nakładać drugi raz. Poza pokryciem wkompilowanej siatki (Europa, patrz
 * `egm96Grid.ts`) korekty nie ma i wysokość zostaje elipsoidalna — uczciwa degradacja
 * zamiast ekstrapolacji. Detekcji to nie dotyczy: liczy AGL względem wysokości
 * z ENGINE START, więc stały składnik i tak się skraca. Gdyby kiedyś doszedł iOS,
 * korekta MUSI dostać bramkę platformy — CoreLocation podaje AMSL i odjęlibyśmy
 * undulację podwójnie.
 */
export function locationToFix(loc: RawLocation): GpsFix {
  const { coords, timestamp } = loc;
  const speed = coords.speed;
  const heading = coords.heading;
  const undulationM = geoidUndulationM({ lat: coords.latitude, lon: coords.longitude });
  return {
    // `timestamp` pochodzi z fixa, nie z zegara aplikacji — to jest ten „drugi zegar".
    time: timestamp,
    groundSpeedKt: speed == null || speed < 0 ? null : speed * MPS_TO_KNOTS,
    altitudeFt: coords.altitude == null ? null : (coords.altitude - (undulationM ?? 0)) * METERS_TO_FEET,
    // Kurs nad ziemią: był w każdym odczycie i szedł do kosza. Domena liczy z niego
    // prędkość kątową — drugą, niezależną obronę przed „ciasnym zakrętem udającym
    // lądowanie" (§8), za darmo i bez dodatkowego czujnika.
    trackDeg: heading == null || heading < 0 ? null : heading,
    lat: coords.latitude,
    lon: coords.longitude,
    accuracyM: coords.accuracy ?? null,
  };
}
