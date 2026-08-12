/**
 * UZ Aero — DZIEŃ PILOTA w bieżącej dobie UTC (ekran 01 „Mój dzień").
 *
 * Listy sesji doby NIE DA SIĘ wyczytać z projekcji jednej sesji i to jest własność
 * modelu, nie brak danych: dzień należy do PILOTA, a `SessionState` opisuje jeden
 * SAMOLOT (`packages/domain/src/projections/pilotDay.ts`). Pilot, który w jednej dobie
 * latał dwiema maszynami, ma jeden dzień i dwie sesje — żadna z nich nie zna drugiej.
 * Dlatego hook bierze WSZYSTKIE dni z lokalnego strumienia (tą samą drogą co historia
 * 12) i składa z nich oś doby czystą projekcją `projectPilotDay`, która sama odfiltruje
 * cudze sesje i te spoza doby.
 *
 * Wszystko liczy się lokalnie, więc ekran domowy działa w pełni offline — to dane sesji
 * z §6 pkt 1, zawsze świeże, bez wariantu „z cache".
 *
 * `null` do czasu pierwszego odczytu, a nie pusta doba: pusta doba jest ZNACZĄCYM
 * stanem (wariant 01A „jeszcze żadnego lotu") i mignięcie nim pilotowi, który ma
 * za sobą trzy sesje, byłoby kłamstwem na ułamek sekundy.
 */

import { useEffect, useState } from 'react';

import { projectPilotDay, type PilotDay, type UtcDayStart } from '../../domain';
import { useSessionStore } from '../store';

export function usePilotDay(pilotId: string, day: UtcDayStart): PilotDay | null {
  const queries = useSessionStore((s) => s.queries);
  // Licznik zdarzeń bieżącej sesji jest jedyną rzeczą, która może zmienić dobę, kiedy
  // pilot patrzy na ekran — po powrocie z kokpitu jest już inny i wymusza ponowny odczyt.
  const eventCount = useSessionStore((s) => s.projection.eventCount);

  const [pilotDay, setPilotDay] = useState<PilotDay | null>(null);

  useEffect(() => {
    if (queries == null) return;

    let alive = true;
    void queries.historyDays().then((days) => {
      if (alive) setPilotDay(projectPilotDay(days.map((d) => d.state), pilotId, day));
    });

    return () => {
      alive = false;
    };
  }, [queries, pilotId, day, eventCount]);

  return pilotDay;
}
