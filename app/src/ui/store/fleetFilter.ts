/**
 * Ninerdeck - trwały wybór maszyn widocznych na osi kalendarza (21D).
 *
 * To jest PREFERENCJA PATRZENIA, nie dane klubu - siostra `useEduBanner` i motywu:
 * `AsyncStorage`, nie rejestr zdarzeń. Rejestr jest append-only i opisuje lot, a nie
 * to, na co ktoś woli patrzeć.
 *
 * ══ KLUCZ NIESIE PILOTA I KLUB ══
 * Pilota, bo na jednym telefonie (wspólny tablet) pracuje kilku, a zawężenie jednego
 * nie ma chować maszyn drugiemu. Klub, bo pilot dwóch klubów ma dwie różne floty -
 * wspólny zapis chowałby w Becie maszyny o identyfikatorach z Alfy, czyli nic, a przy
 * zbiegu identyfikatorów chowałby coś przypadkowego.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthStore } from './authStore';
import { useCurrentPilot } from './currentPilot';

const key = (pilotId: string, orgId: string): string =>
  `ninerdeck.calendar.hidden.${pilotId}.${orgId}`;

export interface FleetFilter {
  /** Identyfikatory maszyn UKRYTYCH - nowa maszyna klubu pojawia się sama. */
  hidden: string[];
  save: (next: readonly string[]) => void;
  /** Odczyt z dysku wrócił - do tego czasu oś rysuje CAŁĄ flotę. */
  loaded: boolean;
}

export function useFleetFilter(): FleetFilter {
  const pilotId = useCurrentPilot((s) => s.id);
  const orgId = useAuthStore((s) => s.org?.id ?? null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (orgId == null) {
      setHidden([]);
      setLoaded(true);
      return;
    }

    setLoaded(false);
    void AsyncStorage.getItem(key(pilotId, orgId))
      .then((value) => {
        if (cancelled) return;
        setHidden(parse(value));
        setLoaded(true);
      })
      .catch(() => {
        // Nieczytelny zapis nie ma prawa zabrać pilotowi kalendarza - pokazujemy
        // wtedy całą flotę, czyli stan domyślny.
        if (!cancelled) {
          setHidden([]);
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pilotId, orgId]);

  const save = useCallback(
    (next: readonly string[]) => {
      // Stan lokalny zmieniamy od razu - zapis na dysk jest efektem ubocznym, a nie
      // warunkiem reakcji interfejsu (ta sama reguła, co w `useEduBanner`).
      setHidden([...next]);
      if (orgId != null) void AsyncStorage.setItem(key(pilotId, orgId), JSON.stringify(next));
    },
    [pilotId, orgId],
  );

  return { hidden, save, loaded };
}

function parse(value: string | null): string[] {
  if (value == null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
