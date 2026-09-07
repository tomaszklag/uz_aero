/**
 * UZ Aero - konfiguracja i norma samolotu z cache'u referencyjnego.
 *
 * Wzorzec „useState + useEffect + strażnik `alive`" powtarzał się w dwóch ekranach
 * (tankowanie, preflight), a wraz z normą zużycia doszedł trzeci - kokpit. Trzecia kopia
 * tego samego kodu jest momentem, w którym staje się on hookiem: strażnik przed zapisem
 * do odmontowanego ekranu łatwo pominąć przy kopiowaniu, a jego brak objawia się dopiero
 * ostrzeżeniem w konsoli przy szybkim przechodzeniu między ekranami.
 *
 * Dane pochodzą WYŁĄCZNIE z lokalnego cache'u (`reference_aircraft` + `reference_consumption`),
 * więc hook działa offline i nigdy nie czeka na sieć. Świeżość niesie `fetchedAt` rekordu -
 * ocenia ją ekran, nie ten hook (§4.8: trzy stany świeżości to sprawa prezentacji).
 */

import { useEffect, useState } from 'react';

import type { ReferenceAircraft } from '../../domain';
import { useSessionStore } from '../store';

/**
 * @param aircraftId identyfikator z projekcji sesji; `null` = nie ma czego pobierać.
 */
export function useAircraft(aircraftId: string | null): ReferenceAircraft | null {
  const queries = useSessionStore((s) => s.queries);
  const [aircraft, setAircraft] = useState<ReferenceAircraft | null>(null);

  useEffect(() => {
    if (queries == null || aircraftId == null) {
      setAircraft(null);
      return;
    }

    let alive = true;
    void queries.aircraftById(aircraftId).then((row) => {
      if (alive) setAircraft(row);
    });

    return () => {
      alive = false;
    };
  }, [queries, aircraftId]);

  return aircraft;
}
