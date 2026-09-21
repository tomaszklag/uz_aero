/**
 * Ninerdeck - SUGESTIE WOLNYCH GODZIN dla maszyny w dobie (`GET /bookings/suggestions`).
 *
 * Rachunek upakowania dnia liczy domena (`suggestSlots`), a trasa jest tylko drogą do
 * niego: ten sam kod policzyłby to na telefonie, gdyby telefon trzymał zajętości floty.
 * Nie trzyma (§2.2), więc pytamy serwer - i pytamy WYŁĄCZNIE wtedy, gdy jest o co:
 * bez maszyny i bez długości terminu sugestia nie miałaby czego zaproponować.
 *
 * `null` = nie wiadomo (brak sieci, odmowa, starszy serwer). Sekcja sugestii wtedy nie
 * istnieje i to jest stan poprawny: propozycja godzin jest UŁATWIENIEM, a nie warunkiem
 * rezerwacji - pilot ustawia godziny sam, kontrolką obok.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RemoteSlotSuggestions } from '../../application';
import { useSessionStore } from '../store';

export interface UseSlotSuggestions {
  /** `undefined` = pytanie w toku, `null` = nie wiadomo. */
  data: RemoteSlotSuggestions | null | undefined;
}

export interface SlotQuery {
  aircraftId: string | null;
  /** Dowolna chwila doby, o którą pytamy; trasa sprowadzi ją do granic doby klubu. */
  day: number | null;
  /** Żądana długość terminu (minuty); `null` = pilot jeszcze go nie ustawił. */
  minutes: number | null;
  /** Pora dnia, o którą pilot prosił - premiuje sloty blisko niej. */
  preferredAt?: number | null;
  enabled: boolean;
}

export function useSlotSuggestions(query: SlotQuery): UseSlotSuggestions {
  const sync = useSessionStore((s) => s.sync);
  const [data, setData] = useState<RemoteSlotSuggestions | null | undefined>(null);
  const alive = useRef(true);

  const { aircraftId, day, minutes, preferredAt, enabled } = query;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (sync == null || !enabled || aircraftId == null || day == null || minutes == null) {
      setData(null);
      return;
    }

    setData(undefined);
    void sync
      .fetchSlots({
        aircraftId,
        day,
        minutes,
        ...(preferredAt != null ? { preferredAt } : {}),
      })
      .then((view) => {
        if (alive.current) setData(view);
      })
      .catch(() => {
        // `authorizedFetch` zwija offline i odmowy do `null`; tu łapiemy resztę.
        // Nieudana podpowiedź nie ma prawa wywrócić formularza.
        if (alive.current) setData(null);
      });
  }, [sync, enabled, aircraftId, day, minutes, preferredAt]);

  useEffect(load, [load]);

  return { data };
}
