/**
 * Ninerdeck - podgląd pilota i samolotu przy decyzji (3.1.0, issue #206).
 *
 * Ten sam kształt, co `useBooking`: odczyt przy KAŻDYM wejściu na ekran, `undefined`
 * = w toku (skeleton), `null` = nie wiadomo TERAZ (offline, odmowa, osoba spoza
 * sprawy) - ekran mówi wtedy, że podgląd składa serwer. Cache'u nie ma i nie wolno go
 * dorobić (§12.1): zgoda jest umową między ludźmi składaną przy biurku.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import type { RemoteAircraftPreview, RemotePilotPreview } from '../../application/ports';
import { useSessionStore } from '../store';

export interface UsePreview<T> {
  data: T | null | undefined;
  reload: () => void;
}

function usePreview<T>(load: (() => Promise<T | null>) | null): UsePreview<T> {
  const [data, setData] = useState<T | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(() => {
    if (load == null) {
      setData(null);
      return;
    }
    setData(undefined);
    void load()
      .then((wire) => {
        if (alive.current) setData(wire);
      })
      .catch(() => {
        // `authorizedFetch` zwija offline i odmowy do `null`; tu łapiemy resztę.
        if (alive.current) setData(null);
      });
  }, [load]);

  useFocusEffect(run);

  return { data, reload: run };
}

export function usePilotPreview(bookingId: string | null, pilotId: string | null): UsePreview<RemotePilotPreview> {
  const sync = useSessionStore((s) => s.sync);
  const load = useCallback(
    () => (sync == null || bookingId == null || pilotId == null ? Promise.resolve(null) : sync.fetchPilotPreview(bookingId, pilotId)),
    [sync, bookingId, pilotId],
  );
  return usePreview<RemotePilotPreview>(sync == null || bookingId == null || pilotId == null ? null : load);
}

export function useAircraftPreview(bookingId: string | null): UsePreview<RemoteAircraftPreview> {
  const sync = useSessionStore((s) => s.sync);
  const load = useCallback(
    () => (sync == null || bookingId == null ? Promise.resolve(null) : sync.fetchAircraftPreview(bookingId)),
    [sync, bookingId],
  );
  return usePreview<RemoteAircraftPreview>(sync == null || bookingId == null ? null : load);
}
