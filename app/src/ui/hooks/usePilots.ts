/**
 * Ninerdeck - lista pilotów z cache'u referencyjnego + rozwiązywanie kodu.
 *
 * Ten sam wzorzec „useState + useEffect + strażnik `alive`", co `useAircraft` -
 * i ta sama historia: `queries.pilots()` ładowało sobie już SZEŚĆ ekranów, każdy
 * własną kopią, a siódma (kafelek załogi w kokpicie) pokazywała surowy identyfikator
 * zamiast kodu pilota (uwaga z urządzenia, 2026-09-03 - ta sama klasa błędu, co guid
 * przy Dualu na 07 i guid w pasku kokpitu).
 *
 * Dane WYŁĄCZNIE z lokalnego cache'u (`reference_pilots`) - hook działa offline
 * i nigdy nie czeka na sieć.
 */

import { useCallback, useEffect, useState } from 'react';

import type { ReferencePilot } from '../../domain';
import { useSessionStore } from '../store';

export function usePilots(): ReferencePilot[] {
  const queries = useSessionStore((s) => s.queries);
  const [pilots, setPilots] = useState<ReferencePilot[]>([]);

  useEffect(() => {
    if (queries == null) return;

    let alive = true;
    void queries.pilots().then((list) => {
      if (alive) setPilots(list);
    });

    return () => {
      alive = false;
    };
  }, [queries]);

  return pilots;
}

/**
 * KOD pilota z cache floty; `null` dla pilota spoza cache'u - ekran stawia wtedy kreskę.
 *
 * Do 4.0.0 zapasem był surowy identyfikator (reguła z 07, przegląd 2026-09-02), ale od
 * wielofirmowości 2.0 to długi ciąg znaków, który na ekranie nie mówi nic nikomu
 * (przegląd treści 2026-10-08).
 */
export function usePilotCode(): (id: string | null) => string | null {
  const pilots = usePilots();
  return useCallback(
    (id: string | null) => (id == null ? null : (pilots.find((p) => p.id === id)?.code ?? null)),
    [pilots],
  );
}
