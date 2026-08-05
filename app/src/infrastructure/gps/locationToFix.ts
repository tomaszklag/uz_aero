/**
 * UZ Aero — czysta translacja odczytu platformy na `GpsFix` domeny.
 *
 * Typ parametru jest STRUKTURALNY (nie `Location.LocationObject`), bo moduł musi być
 * widoczny dla testów RN-free (jest nie wciąga expo) i dla modułu taska tła, który
 * nie może dotykać `expo-location` (test architektury trzyma dokładną listę
 * importerów). Odczyt expo pasuje strukturalnie — kompilator pilnuje zgodności
 * w miejscu wywołania. Wzorzec ekstrakcji: `infrastructure/storage/schema.ts`.
 */

import type { GpsFix } from '../../domain';

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
 */
export function locationToFix(loc: RawLocation): GpsFix {
  const { coords, timestamp } = loc;
  const speed = coords.speed;
  const heading = coords.heading;
  return {
    // `timestamp` pochodzi z fixa, nie z zegara aplikacji — to jest ten „drugi zegar".
    time: timestamp,
    groundSpeedKt: speed == null || speed < 0 ? null : speed * MPS_TO_KNOTS,
    altitudeFt: coords.altitude == null ? null : coords.altitude * METERS_TO_FEET,
    // Kurs nad ziemią: był w każdym odczycie i szedł do kosza. Domena liczy z niego
    // prędkość kątową — drugą, niezależną obronę przed „ciasnym zakrętem udającym
    // lądowanie" (§8), za darmo i bez dodatkowego czujnika.
    trackDeg: heading == null || heading < 0 ? null : heading,
    lat: coords.latitude,
    lon: coords.longitude,
    accuracyM: coords.accuracy ?? null,
  };
}
