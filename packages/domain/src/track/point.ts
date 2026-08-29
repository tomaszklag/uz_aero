/**
 * UZ Aero - typy punktu śladu lotu.
 *
 * DLACZEGO OSOBNO OD `detection/fix.ts`: `GpsFix` opisuje odczyt, który WŁAŚNIE
 * przyszedł do detektora i o którym trzeba coś zdecydować. Tutaj mówimy o czymś
 * innym - o odczycie ODCZYTANYM Z ZAPISU po locie, żeby go narysować. Różnią się
 * kierunkiem: `GpsFix` jest wejściem automatu, `TrackPoint` wyjściem projekcji.
 *
 * Wspólny mianownik (czas, pozycja, wysokość, dokładność) jest ten sam i to nie
 * przypadek - `RawTrackEntry` daje się zmapować na `GpsFix` jedną funkcją, dzięki
 * czemu bramka jakości śladu może wołać `fixUsable` detektora zamiast powtarzać
 * jego progi. Ślad ma pokazywać to, co widział algorytm, a nie własną wersję.
 */

import type { EpochMillis } from '../time';

/**
 * Surowy wiersz śladu - dokładnie to, co telefon zapisał i wysłał.
 *
 * Kształt jest luźny z premedytacją (pola opcjonalne, `kind` jako string): po jednej
 * stronie czyta go SQLite telefonu, po drugiej NDJSON z serwera, a koperta `POST /traces`
 * jest celowo nieszczelna, żeby nowy kanał czujników nie wymagał zmiany serwera.
 * Zawężenie do punktów rysowalnych robi `flightTrack.ts`, nie ten typ.
 */
export interface RawTrackEntry {
  kind: string;
  time: EpochMillis;
  lat?: number | null;
  lon?: number | null;
  /** Wysokość GPS (stopy AMSL) - NIE ciśnieniowa, bez korekty QNH. */
  alt?: number | null;
  /** Prędkość względem ziemi (węzły); `null` = odbiornik nie podał. */
  gs?: number | null;
  trackDeg?: number | null;
  accuracyM?: number | null;
  /** Treść markera dla `kind` = `detection` / `undo`. */
  detail?: string | null;
}

/** Powód, dla którego punkt nie wszedł do trasy. Null = punkt użyty. */
export type TrackRejection =
  /** Dokładność gorsza niż `MAX_FIX_ACCURACY_M` - odbiornik sam przyznaje, że zgaduje. */
  | 'accuracy'
  /** Prędkość ponad `MAX_PLAUSIBLE_SPEED_KT` - odczyt fizycznie niemożliwy dla tego statku. */
  | 'speed'
  /** Skok pozycji wymagający prędkości ponad progiem - multipath albo spoofing. */
  | 'jump'
  /** Wiersz bez pozycji - nie ma czego narysować (np. fix przed ustaleniem pozycji). */
  | 'no-position';

/**
 * Punkt śladu po bramce jakości - jednostka, z której powstaje linia i profil.
 *
 * `rejected` NIE usuwa punktu z wyniku i to jest decyzja: panel pokazuje odrzucone
 * wiersze z powodem (mockup A02c), bo właśnie one są materiałem do strojenia progów.
 * Z geometrii i metryk odrzucone wypadają - ale z logu nie.
 */
export interface TrackPoint {
  time: EpochMillis;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  trackDeg: number | null;
  accuracyM: number | null;
  /** Null = punkt wszedł do trasy; wartość = powód pominięcia w geometrii. */
  rejected: TrackRejection | null;
}

/** Czy punkt wchodzi do geometrii i metryk. */
export function isUsablePoint(point: TrackPoint): boolean {
  return point.rejected == null;
}
