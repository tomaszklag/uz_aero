/**
 * Ninerdeck - FLOTA KLUBU AKTYWNEGO z cache'u referencyjnego.
 *
 * Siostra `usePilots`: ten sam wzorzec „useState + useEffect + strażnik `alive`" i ta
 * sama granica - dane WYŁĄCZNIE z lokalnego cache'u (`reference_aircraft`), więc hook
 * działa offline i nigdy nie czeka na sieć.
 *
 * ══ KLUB AKTYWNY, NIE WSZYSTKIE ══
 * `queries.aircraft()` zawęża do klubu z tokenu i tak ma być: flota jest materiałem
 * do WYBORU (na czym polecieć, co postawić na osi kalendarza), a wybrać da się wyłącznie
 * maszynę klubu, w którym pilot pracuje. Do podpisania kafelka operacji z drugiego klubu
 * służy `useAircraftRegistrations`, które świadomie nie zawęża - to inne pytanie.
 *
 * `loaded` jest osobno od pustej tablicy: bez niego ekran pisałby „brak samolotów"
 * w trakcie normalnego startu (reguła stanu ładowania, issue #33).
 */

import { useEffect, useState } from 'react';

import type { ReferenceAircraft } from '../../domain';
import { useSessionStore } from '../store';

export interface Fleet {
  aircraft: ReferenceAircraft[];
  loaded: boolean;
}

export function useFleet(): Fleet {
  const queries = useSessionStore((s) => s.queries);
  const [aircraft, setAircraft] = useState<ReferenceAircraft[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (queries == null) return;

    let alive = true;
    void queries.aircraft().then((list) => {
      if (!alive) return;
      setAircraft(list);
      setLoaded(true);
    });

    return () => {
      alive = false;
    };
  }, [queries]);

  return { aircraft, loaded };
}
