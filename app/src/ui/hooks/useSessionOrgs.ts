/**
 * UZ Aero - KLUB OPERACJI po identyfikatorze (wielofirmowość §7, issue #102).
 *
 * „Mój dzień" i historia pokazują operacje WSZYSTKICH klubów pilota (§7.2), więc kafelek
 * musi umieć odpowiedzieć, do którego klubu należy - a rejestr zdarzeń tego nie niesie:
 * przynależność jest własnością OPERACJI i mieszka w osobnej tabeli (`session_orgs`).
 *
 * Ten sam wzorzec „useState + useEffect + strażnik `alive`", co `useAircraftRegistrations`,
 * i ta sama granica: dane WYŁĄCZNIE z lokalnego magazynu, więc hook działa offline.
 *
 * `streamRevision` w zależnościach, bo odtworzenie rejestru z serwera (§4.9) dopisuje
 * operacje razem z ich klubem - bez tego kafelek dopisanej operacji byłby bez plakietki
 * do najbliższego wejścia na ekran.
 */

import { useCallback, useEffect, useState } from 'react';

import { useSessionStore } from '../store';

/** Klub operacji; `null` = zapis sprzed 2.0.0 albo operacja nieznana magazynowi. */
export type OrgOf = (sessionUuid: string) => string | null;

export function useSessionOrgs(): OrgOf {
  const repo = useSessionStore((s) => s.repo);
  const streamRevision = useSessionStore((s) => s.streamRevision);
  const eventCount = useSessionStore((s) => s.projection.eventCount);
  const [byUuid, setByUuid] = useState<Record<string, string>>({});

  useEffect(() => {
    if (repo == null) return;

    let alive = true;
    void repo.getSessionOrgs().then((map) => {
      if (alive) setByUuid(map);
    });

    return () => {
      alive = false;
    };
  }, [repo, streamRevision, eventCount]);

  /**
   * `useCallback` NIE JEST tu optymalizacją, tylko warunkiem poprawności: ta funkcja
   * wchodzi do listy zależności efektu w `useOperationSignatures` (klub jest kubełkiem
   * numerowania). Nowa tożsamość przy każdym renderze zapętliłaby tamten efekt -
   * odczyt → `setState` → render → odczyt - i to na urządzeniu, nie w teście.
   */
  return useCallback((sessionUuid: string) => byUuid[sessionUuid] ?? null, [byUuid]);
}
