/**
 * UZ Aero - panel: ślad lotu (`/admin/api/sessions/:uuid/track/:flight`).
 *
 * Jeden plik = jeden zasób, jak reszta `api/`. Adres jest zagnieżdżony pod sesją,
 * bo ślad nie ma własnej tożsamości - istnieje wyłącznie jako wycinek zapisu sesji
 * wyznaczony przez lot z rejestru (`server/src/http/routes/admin/tracks.ts`).
 *
 * 404 jest tu ODPOWIEDZIĄ, nie awarią, i ma dwa różne znaczenia: `no_session`
 * („nie ma takiego dnia") i `no_flight` („ten dzień nie ma lotu o tym numerze").
 * Ekran mówi o nich innym zdaniem, więc rozróżnienie musi dojść nietknięte.
 */

import type { FlightTrackDto } from './dto';
import { apiGet } from './httpClient';

export function getFlightTrack(sessionUuid: string, flightIndex: number): Promise<FlightTrackDto> {
  return apiGet<FlightTrackDto>(
    `/sessions/${encodeURIComponent(sessionUuid)}/track/${flightIndex}`,
  );
}
