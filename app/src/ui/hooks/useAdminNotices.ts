/**
 * UZ Aero - komunikaty o operacjach zakończonych / unieważnionych przez administratora
 * (issue #81) na ekranie domowym.
 *
 * Czyta LOKALNY rejestr (`queries.historyDays`), jak każdy ekran dnia - decyzja panelu
 * jest w nim od chwili dosyłki (§4.9). Te same dwa liczniki, co w `usePilotDay`:
 * zdarzenia bieżącej operacji (kokpit właśnie zszedł) i odtworzenie rejestru z serwera.
 * Potwierdzenie pilota trwa w `session_meta`, więc komunikat nie wraca po restarcie.
 */

import { useCallback, useEffect, useState } from 'react';

import { useSessionStore } from '../store';
import {
  ADMIN_NOTICES_META_ACKED,
  buildAdminNotices,
  parseAcked,
  serializeAcked,
  type AdminNotice,
} from '../screens/logic/adminNotices';

export interface AdminNotices {
  notices: AdminNotice[];
  /** Pilot przeczytał komunikat o tej operacji - znika i nie wraca. */
  acknowledge: (sessionUuid: string) => void;
}

export function useAdminNotices(): AdminNotices {
  const repo = useSessionStore((s) => s.repo);
  const queries = useSessionStore((s) => s.queries);
  const eventCount = useSessionStore((s) => s.projection.eventCount);
  const streamRevision = useSessionStore((s) => s.streamRevision);

  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [acked, setAcked] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (repo == null) return;
    let alive = true;
    void repo.getMeta(ADMIN_NOTICES_META_ACKED).then((raw) => {
      if (alive) setAcked(parseAcked(raw));
    });
    return () => {
      alive = false;
    };
  }, [repo]);

  useEffect(() => {
    if (queries == null || acked == null) return;
    let alive = true;
    void queries.historyDays().then((days) => {
      if (alive) setNotices(buildAdminNotices(days, acked));
    });
    return () => {
      alive = false;
    };
  }, [queries, acked, eventCount, streamRevision]);

  const acknowledge = useCallback(
    (sessionUuid: string) => {
      // Stan lokalny od razu, zapis na dysk jako skutek uboczny - jak przy banerach
      // pouczających (`useEduBanner`): ekran reaguje na tapnięcie, nie na zapis.
      setAcked((prev) => {
        const next = new Set(prev ?? []);
        next.add(sessionUuid);
        void repo?.setMeta(ADMIN_NOTICES_META_ACKED, serializeAcked(next));
        return next;
      });
    },
    [repo],
  );

  return { notices, acknowledge };
}
