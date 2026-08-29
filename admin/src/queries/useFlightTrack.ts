/**
 * UZ Aero - panel: odczyt śladu jednego lotu (`A02c`).
 *
 * Osobny plik od `useSessionDay.ts`, bo to inne zapytanie o innym koszcie: karta dnia
 * czyta strumień zdarzeń (dziesiątki wierszy), a ślad - plik NDJSON sesji (dziesiątki
 * tysięcy). Sklejenie ich w jedno pytanie kazałoby liście dni ciągnąć geometrię, której
 * nigdy nie pokaże.
 *
 * `retry: false` przy 404: „ten lot nie ma śladu" to odpowiedź, a nie usterka sieci -
 * ponawianie jej opóźniałoby wyłącznie moment, w którym ekran powie prawdę.
 */

import { useQuery } from '@tanstack/react-query';

import type { FlightTrackDto } from '../api/dto';
import { isHttpError } from '../api/httpClient';
import { getFlightTrack } from '../api/tracks';
import { keys } from './keys';

export function useFlightTrack(sessionUuid: string, flightIndex: number) {
  return useQuery<FlightTrackDto>({
    queryKey: keys.sessions.track(sessionUuid, flightIndex),
    queryFn: () => getFlightTrack(sessionUuid, flightIndex),
    enabled: sessionUuid !== '' && Number.isFinite(flightIndex) && flightIndex > 0,
    retry: (count, error) => {
      if (isHttpError(error) && error.status === 404) return false;
      return count < 2;
    },
  });
}
