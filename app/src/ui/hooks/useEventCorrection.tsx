/**
 * UZ Aero — spoina korekty zdarzenia (04c): log → arkusz → komenda.
 *
 * Korektę otwiera się z DWÓCH miejsc (log dnia na 04 i lista ręczna na 08), a jej
 * okablowanie — znalezienie celu, zbudowanie wierszy odniesienia, zapis, obsługa
 * odrzucenia — jest identyczne. Hook trzyma je w jednym miejscu; ekran dostaje
 * `openCorrection` do podpięcia pod ołówek i gotowy element arkusza do wyrenderowania.
 *
 * Cel znajdujemy po uuid w SUROWYM strumieniu (nie efektywnym): korygować można też
 * zdarzenie już poprawione — kolejna korekta po prostu zastępuje poprzednią
 * („ostatnia wygrywa" w `applyCorrections`).
 */

import React, { useCallback, useMemo, useState } from 'react';

import { applyCorrections } from '../../domain';
import type { Event } from '../../domain';
import { CorrectionSheet, type CorrectionRef } from '../components/sheets/CorrectionSheet';
import { useSessionStore } from '../store';
import { duration, timeUtc } from '../format';
import {
  correctionImpact,
  flightNumberOf,
  methodBadgeFor,
  voidLabelFor,
} from '../screens/logic/correction';

/** Etykiety zdarzeń w karcie korekty — spójne z logiem dnia. */
const LABEL: Partial<Record<Event['type'], string>> = {
  engine_start: 'Start engine',
  engine_stop: 'Stop engine',
  taxi: 'Taxi',
  takeoff: 'Takeoff',
  landing: 'Landing',
  drop: 'Zrzut',
  refuel: 'Tankowanie',
  manual_log_entry: 'Wpis ręczny',
};

export interface EventCorrectionApi {
  /** Otwiera arkusz dla zdarzenia o danym uuid — do podpięcia pod `EventLog.onCorrect`. */
  openCorrection: (uuid: string) => void;
  /** Arkusz do wyrenderowania na końcu ekranu (null, gdy zamknięty). */
  correctionSheet: React.ReactElement | null;
}

export function useEventCorrection(): EventCorrectionApi {
  const events = useSessionStore((s) => s.events);
  const correctEvent = useSessionStore((s) => s.correctEvent);

  const [target, setTarget] = useState<Event | null>(null);
  const [busy, setBusy] = useState(false);

  const openCorrection = useCallback(
    (uuid: string) => {
      const found = events.find((e) => e.uuid === uuid);
      if (found != null && found.type !== 'event_correction') setTarget(found);
    },
    [events],
  );

  /** Czas EFEKTYWNY celu — po wcześniejszych korektach; od niego liczy się delta. */
  const originalTime = useMemo(() => {
    if (target == null) return 0;
    const effective = applyCorrections(events).find((e) => e.uuid === target.uuid);
    return effective?.gpsTime ?? effective?.deviceTime ?? target.gpsTime ?? target.deviceTime;
  }, [events, target]);

  const refsFor = useCallback(
    (newTime: number): CorrectionRef[] => {
      if (target == null) return [];
      const refs: CorrectionRef[] = [];

      const badge = methodBadgeFor(target);
      if (badge != null) {
        refs.push({ label: 'Metoda wykrycia', value: badge === 'ręcznie' ? 'wpis pilota' : 'GPS' });
      }

      const impact = correctionImpact(events, target, newTime);
      if (impact != null) {
        refs.push({
          label: impact.label,
          value: `${duration(impact.beforeMs)} → ${duration(impact.afterMs)}`,
        });
      }
      return refs;
    },
    [events, target],
  );

  const run = useCallback(
    async (payload: { action: 'retime'; newTime: number } | { action: 'void' }) => {
      if (target == null) return;
      setBusy(true);
      try {
        await correctEvent({ targetUuid: target.uuid, ...payload });
        setTarget(null);
      } catch {
        // Twarde odrzucenie (np. okno 24 h minęło) jest w `lastError` — pokazuje je ekran.
        setTarget(null);
      } finally {
        setBusy(false);
      }
    },
    [correctEvent, target],
  );

  const correctionSheet =
    target == null ? null : (
      <CorrectionSheet
        visible
        eventLabel={[
          LABEL[target.type] ?? target.type,
          flightNumberOf(events, target) != null
            ? `Lot ${flightNumberOf(events, target)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        eventIcon={
          target.type === 'takeoff'
            ? 'takeoff'
            : target.type === 'refuel'
              ? 'refuel'
              : target.type === 'drop'
                ? 'drop'
                : 'landing'
        }
        originalTime={originalTime}
        methodBadge={methodBadgeFor(target)}
        refsFor={refsFor}
        formatTime={timeUtc}
        maxTime={Date.now()}
        voidLabel={voidLabelFor(target.type)}
        voidHint={
          'Oznacza zdarzenie jako błędne (nie usuwa go z rejestru) · użyj, gdy autodetekcja ' +
          'zaliczyła przelot nad lotniskiem jako lądowanie'
        }
        busy={busy}
        onSave={(newTime) => void run({ action: 'retime', newTime })}
        onVoid={() => void run({ action: 'void' })}
        onCancel={() => setTarget(null)}
      />
    );

  return { openCorrection, correctionSheet };
}
