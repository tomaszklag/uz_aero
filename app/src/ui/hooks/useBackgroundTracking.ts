/**
 * UZ Aero — spoina: `engineRunning` → tryb źródła GPS (`GpsPort.setBackgroundMode`).
 *
 * Okno usługi pierwszoplanowej = pracujący silnik (decyzja 2026-08-03): między lotami
 * zero GPS i zero powiadomienia. Hook jest GŁUPI — całą maszynę stanów (adopcja,
 * retry z tła, sprzątanie osieroconej usługi) ma adapter za portem.
 *
 * Stan początkowy TEŻ jest komendą, nie tylko zbocza: po powrocie z headless-restartu
 * adoptuje działającą usługę (silnik gra), a po zamkniętym dniu sprząta osieroconą.
 * Dlatego hook wolno zamontować dopiero, gdy store zna PRAWDZIWY stan dnia —
 * po `loadSession` (patrz binder w `ResumeGate`), nigdy przed nim.
 */

import { useEffect } from 'react';

import type { GpsPort } from '../../application/ports';
import { useSessionStore } from '../store';

export function useBackgroundTracking(gps: GpsPort | null): void {
  useEffect(() => {
    if (gps == null) return;

    // Kontrakt portu: nigdy nie odrzuca — void jest tu świadome, nie przeoczone.
    const apply = (engineOn: boolean): void => void gps.setBackgroundMode(engineOn);

    apply(useSessionStore.getState().projection.engineRunning);
    return useSessionStore.subscribe((state, prev) => {
      if (state.projection.engineRunning !== prev.projection.engineRunning) {
        apply(state.projection.engineRunning);
      }
    });
  }, [gps]);
}
