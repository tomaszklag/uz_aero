/**
 * UZ Aero (serwer) - KONTRAKT śladu lotu w panelu (`A02c-slad.html`).
 *
 * Zgodnie z regułą granicy typów (`contracts/sessions.ts`): `TrackPoint`, `TrackVertex`
 * i `FlightProfile` to byty DOMENOWE i jadą jako typy z domeny, bez własnych DTO -
 * panel rysuje je tym samym kodem, którym telefon rysuje własny ślad, więc rozjazd
 * kształtów byłby czystą stratą.
 *
 * Własny DTO dostaje tylko koperta: to złączenie śladu (pliki NDJSON) z lotem (projekcja
 * rejestru), czyli wygoda panelu, a nie byt, który gdziekolwiek indziej istnieje.
 */

import type { FlightProfile, TrackPoint, TrackVertex } from '@uzaero/domain';

/** Ślad jednego lotu - mapa, profil i log w jednej odpowiedzi. */
export interface AdminFlightTrack {
  sessionUuid: string;
  /** Numer lotu w dniu (1-based), jak w tabeli lotów karty dnia. */
  flightIndex: number;

  /** Okno lotu z rejestru PO korektach - patrz nagłówek `track/flightTrack.ts`. */
  takeoffAt: number;
  /** `null` = lot jeszcze otwarty (samolot w powietrzu). */
  landingAt: number | null;
  /** `auto` / `manual` - lot ręczny nigdy nie ma śladu, i to jest wariant 14B. */
  method: string;

  /** Geometria po bramce i uproszczeniu - to rysuje mapa. */
  line: TrackVertex[];
  /**
   * Log punktów: próbka co 30 s PLUS wszystkie odrzucone. Nie jest to pełny zapis -
   * `totalCount` mówi, ile wierszy naprawdę leży w śladzie.
   */
  log: TrackPoint[];
  profile: FlightProfile;

  distanceNm: number;
  maxAltitudeFt: number | null;
  /** Ile wpisów wpadło w okno lotu i ile z nich weszło do geometrii. */
  totalCount: number;
  usableCount: number;
}
