/**
 * UZ Aero — spoina: czujniki pokładowe → ślad kalibracyjny.
 *
 * Osobny hook obok `useFlightDetection`, bo robi coś zupełnie innego: NIC nie decyduje.
 * Czujniki są tu wyłącznie NAGRYWANE — barometr i inercja nie mają żadnego wpływu na
 * detekcję i nie będą go mieć, dopóki nie zostaną wystrojone na nagraniach z fazy 5.
 *
 * Ta rozdzielność jest celowa i warto ją utrzymać: gdyby nagrywanie mieszkało w hooku
 * detekcji, granica „co wpływa na zdarzenia, a co nie" zatarłaby się przy pierwszej
 * refaktoryzacji. Tutaj widać ją w nazwie pliku.
 *
 * Warunek włączenia jest ten sam co dla detekcji (pracujący silnik): anomalia z definicji
 * jest nieplanowana, więc najciekawszy lot nie może być tym niezapisanym — ale nagrywanie
 * czujników przy zgaszonym silniku to już tylko koszt baterii bez materiału.
 */

import { useEffect } from 'react';

import type { SensorPort } from '../../application/ports';
import { useSessionStore } from '../store';
import { useTrace } from '../bootstrap/servicesContext';

export interface UseSensorTraceOptions {
  /** Port czujników; null = urządzenie bez czujników albo środowisko testowe. */
  sensors: SensorPort | null;
  /** Czy nagrywać. Zwykle: silnik pracuje. */
  enabled: boolean;
}

export function useSensorTrace({ sensors, enabled }: UseSensorTraceOptions): void {
  const sessionUuid = useSessionStore((s) => s.context?.sessionUuid ?? null);
  const trace = useTrace();

  useEffect(() => {
    if (sensors == null || trace == null || !enabled) return;

    let stop: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const release = await sensors.start((sample) => trace.sensor(sample, sessionUuid));
      // Ekran mógł zniknąć, zanim subskrypcja wstała — inaczej nikt jej nie zamknie
      // i akcelerometr zostaje przy 50 Hz do końca dnia lotnego.
      if (cancelled) {
        release();
        return;
      }
      stop = release;
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [enabled, sensors, sessionUuid, trace]);
}
