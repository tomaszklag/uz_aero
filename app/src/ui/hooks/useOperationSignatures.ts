/**
 * UZ Aero - SYGNATURY OPERACJI po identyfikatorze sesji (issue #68).
 *
 * ══ DLACZEGO CAŁY STRUMIEŃ, A NIE JEDNA SESJA ══
 * Numeru operacji w dobie nie da się policzyć z niej samej - to jej miejsce wśród
 * SĄSIADÓW (`operationIndexes`). Ta sama własność, przez którą listy sesji doby nie da
 * się wyczytać z `SessionState` (patrz `usePilotDay`): sesja opisuje jeden samolot,
 * a doba należy do pilota.
 *
 * Hook czyta więc cały lokalny strumień raz i oddaje FUNKCJĘ - ekran 01 pyta o kilka
 * kafelków, ekran 12 o kilkadziesiąt, ekran 10 o jeden, a rachunek jest wspólny.
 *
 * ══ DRUGI ODCZYT TEJ SAMEJ TABELI JEST ŚWIADOMY ══
 * Na 01 i 12 `historyDays()` czyta się przez to dwa razy (raz dla listy, raz tutaj).
 * Alternatywą byłoby wstrzykiwanie stanów z zewnątrz - czyli parametr, o którym każdy
 * nowy ekran musiałby pamiętać, żeby sygnatura się w ogóle pojawiła. Odczyt idzie
 * z lokalnego SQLite i dotyczy WŁASNYCH operacji pilota, a wejście w ekran i tak
 * czeka na jego pierwszy przebieg (wzorzec skeletonu, §2).
 *
 * ══ WSZYSTKO LOKALNIE ══
 * Rejestr, znak maszyny (cache floty) i kod pilota (profil logowania) mieszkają na
 * telefonie, więc sygnatura wychodzi bez sieci - to dane sesji z §6 pkt 1, bez wariantu
 * „z cache". Maszyna, której cache nie zna, nie ma znaku: `operationSignature` oddaje
 * wtedy `null`, a co z tym zrobić rozstrzyga ekran (ta sama granica, co
 * w `useAircraftRegistrations`).
 */

import { useEffect, useState } from 'react';

import {
  operationAnchor,
  operationIndexes,
  operationSignature,
  type EpochMillis,
} from '../../domain';
import { useAuthStore } from '../store/authStore';
import { useCurrentPilot, useSessionStore } from '../store';
import { useAircraftRegistrations } from './useAircraftRegistrations';

/** Sygnatura operacji („SP-AXA/2026-09-01/AKO/1"); `null` = nie ma jej z czego złożyć. */
export type OperationSignatureOf = (sessionUuid: string) => string | null;

/** Co o operacji trzeba wiedzieć, żeby złożyć jej sygnaturę przy wywołaniu. */
interface OperationFacts {
  aircraftId: string | null;
  startedAt: EpochMillis;
  index: number;
}

export function useOperationSignatures(): OperationSignatureOf {
  const queries = useSessionStore((s) => s.queries);
  // Te same dwa liczniki, co w `usePilotDay`: zdarzenia bieżącej sesji i odtworzenie
  // rejestru z serwera (§4.9). Dopisana operacja zmienia numery swoim sąsiadom.
  const eventCount = useSessionStore((s) => s.projection.eventCount);
  const streamRevision = useSessionStore((s) => s.streamRevision);

  const pilotId = useCurrentPilot((s) => s.id);
  // Kod pilota z profilu logowania - nigdzie o niego nie pytamy (CLAUDE.md).
  const picCode = useAuthStore((s) => s.pilot?.code) ?? null;
  const regOf = useAircraftRegistrations();

  const [facts, setFacts] = useState<Map<string, OperationFacts>>(new Map());

  useEffect(() => {
    if (queries == null) return;

    let alive = true;
    void queries.historyDays().then((days) => {
      if (!alive) return;

      const states = days.map((d) => d.state);
      const indexes = operationIndexes(states, pilotId);
      const next = new Map<string, OperationFacts>();

      for (const state of states) {
        const uuid = state.sessionUuid;
        // Ta sama kotwica, którą numeruje `operationIndexes` (issue #75): uruchomienie
        // silnika, a przy operacji bez biegu - przejęcie. Doba w sygnaturze musi być
        // dobą, w której kafelek stoi na liście.
        const startedAt = operationAnchor(state);
        if (uuid == null || startedAt == null) continue;

        const index = indexes.get(uuid);
        if (index == null) continue;

        next.set(uuid, { aircraftId: state.aircraftId, startedAt, index });
      }

      setFacts(next);
    });

    return () => {
      alive = false;
    };
  }, [queries, pilotId, eventCount, streamRevision]);

  return (sessionUuid) => {
    const operation = facts.get(sessionUuid);
    if (operation == null) return null;

    return operationSignature({
      reg: operation.aircraftId == null ? null : regOf(operation.aircraftId),
      startedAt: operation.startedAt,
      picCode,
      index: operation.index,
    });
  };
}
