/**
 * UZ Aero — SŁUŻBA PILOTA w bieżącej dobie UTC (ekran 01 „Mój dzień").
 *
 * Klamry służby NIE DA SIĘ wyczytać z projekcji jednej sesji i to jest własność modelu,
 * nie brak danych: służba należy do PILOTA, a `SessionState` opisuje jeden SAMOLOT
 * (`packages/domain/src/projections/duty.ts`). Pilot, który w jednej dobie latał dwiema
 * maszynami, ma jedną służbę i dwie sesje — żadna z nich nie zna drugiej. Dlatego hook
 * bierze WSZYSTKIE dni z lokalnego strumienia (tą samą drogą co historia 12) i składa
 * z nich oś doby czystą projekcją `projectDuty`, która sama odfiltruje cudze sesje
 * i te spoza doby.
 *
 * Wszystko liczy się lokalnie, więc ekran domowy działa w pełni offline — to dane sesji
 * z §6 pkt 1, zawsze świeże, bez wariantu „z cache".
 *
 * `null` do czasu pierwszego odczytu, a nie pusta doba: pusta doba jest ZNACZĄCYM
 * stanem (wariant 01A „jeszcze żadnego wzlotu") i mignięcie nim pilotowi, który ma
 * za sobą trzy wzloty, byłoby kłamstwem na ułamek sekundy.
 */

import { useEffect, useState } from 'react';

import { projectDuty, type DutyDay, type UtcDayStart } from '../../domain';
import { useSessionStore } from '../store';

export function useDutyDay(pilotId: string, day: UtcDayStart): DutyDay | null {
  const queries = useSessionStore((s) => s.queries);
  // Licznik zdarzeń bieżącej sesji jest jedyną rzeczą, która może zmienić dobę, kiedy
  // pilot patrzy na ekran — po powrocie z kokpitu jest już inny i wymusza ponowny odczyt.
  const eventCount = useSessionStore((s) => s.projection.eventCount);

  const [duty, setDuty] = useState<DutyDay | null>(null);

  useEffect(() => {
    if (queries == null) return;

    let alive = true;
    void queries.historyDays().then((days) => {
      if (alive) setDuty(projectDuty(days.map((d) => d.state), pilotId, day));
    });

    return () => {
      alive = false;
    };
  }, [queries, pilotId, day, eventCount]);

  return duty;
}
