/**
 * Ninerdeck - GOSPODARZ BANERA W APLIKACJI (kanał klubu 4.0.0, K5, makieta 25E;
 * epik KK-C #246).
 *
 * Jeden komponent nad nawigacją zbiera dwa źródła i oddaje je jednej regule:
 *  - ramkę `notification` z szyny kanału (klub aktywny, łącze stoi);
 *  - push odebrany przy otwartej aplikacji (inny klub albo chwila bez łącza) - system
 *    przy otwartej aplikacji milczy (`configureNotifications`), więc to jest jego jedyna
 *    zapowiedź poza cichym wpisem na liście systemowej;
 *  - czy baner staje i co mówi - liczy `logic/inAppBanner.ts`.
 * Stoi w nawigatorze, bo tam jest uchwyt do otwierania rzeczy i trasa, na której pilot
 * stoi - czyli ZA bramką tożsamości: nad zamkiem PIN-u banera nie ma, bo pokazałby treść
 * komuś, kto telefonu nie odblokował.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { onNotificationReceived } from '../../infrastructure/push/expoNotifications';
import { isForegroundState } from '../../application/live/linkRule';
import { useLive } from '../bootstrap/servicesContext';
import { InAppBanner } from '../components/status/InAppBanner';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useFleet } from '../hooks/useFleet';
import { usePilots } from '../hooks/usePilots';
import { bannerFits, inAppBanner, type BannerContext, type BannerSource, type BannerVm } from '../screens/logic/inAppBanner';
import type { PushTarget } from '../screens/logic/pushTarget';
import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import type { ScreenRoute } from './activeRoute';
import { holdsAircraft } from './resumeTarget';

export interface BannerHostProps {
  /** Ekran na czubku stosu - po nim reguła poznaje „ekran, którego dotyczy". */
  route: ScreenRoute | null;
  /** Otwarcie rzeczy - ta sama droga, co tapnięcie w push. */
  onOpen: (target: PushTarget) => void;
}

/** Baner na ekranie razem z numerem kolejnym - nowy zastępuje poprzedni nawet przy tym samym id. */
interface Shown {
  seq: number;
  vm: BannerVm;
}

export function BannerHost({ route, onOpen }: BannerHostProps) {
  const live = useLive();
  const holds = useSessionStore((s) => holdsAircraft(s.projection));
  const activeOrgId = useAuthStore((s) => s.org?.id ?? null);
  const memberships = useAuthStore((s) => s.memberships);
  const regOf = useAircraftRegistrations();
  const pilots = usePilots();
  const { aircraft: fleet } = useFleet();

  const [shown, setShown] = useState<Shown | null>(null);
  const seq = useRef(0);

  // Słuchacze żyją od zamontowania, a czytają kontekst z CHWILI wiadomości: trasa, klub,
  // pamięć floty i członków mogły się zmienić, odkąd się podpięły.
  const context = useRef<Omit<BannerContext, 'foreground' | 'now'> | null>(null);
  useEffect(() => {
    context.current = {
      activeOrgId,
      holdsAircraft: holds,
      route,
      regOf,
      nameOf: (id) => pilots.find((p) => p.id === id)?.name ?? null,
      mhFormatOf: (id) => fleet.find((a) => a.id === id)?.mhFormat ?? null,
      clubNameOf: (id) => memberships.find((m) => m.org.id === id)?.org.name ?? null,
    };
  });

  useEffect(() => {
    const show = (source: BannerSource): void => {
      const ctx = context.current;
      if (ctx == null) return;
      const vm = inAppBanner(source, {
        ...ctx,
        foreground: isForegroundState(AppState.currentState),
        now: Date.now(),
      });
      if (vm == null) return;
      seq.current += 1;
      setShown({ seq: seq.current, vm });
    };
    // Ramka bez pozycji skrzynki (sygnał z pusha klubu aktywnego, `useLiveLink`) nie ma
    // czego powiedzieć - baner pokaże wtedy sam push.
    const offFrames = live?.bus.onNotification((frame) => {
      if (frame.item != null) show({ kind: 'frame', item: frame.item, quiet: frame.quiet });
    });
    const offPushes = onNotificationReceived((received) =>
      show({ kind: 'push', id: received.id, title: received.title, body: received.body, data: received.data }),
    );
    return () => {
      offFrames?.();
      offPushes();
    };
  }, [live]);

  // Wejście na ekran rzeczy, której baner dotyczy, albo do kokpitu gasi go na dobre.
  useEffect(() => {
    if (shown != null && !bannerFits(shown.vm, route, holds)) setShown(null);
  }, [shown, route, holds]);

  if (shown == null) return null;
  const { seq: current, vm } = shown;
  return (
    <InAppBanner
      key={current}
      banner={vm}
      onOpen={() => onOpen(vm.target)}
      // Zdejmuje tylko SWÓJ baner: wyjazd poprzedniego kończy się już po wjeździe następnego.
      onDone={() => setShown((now) => (now?.seq === current ? null : now))}
    />
  );
}
