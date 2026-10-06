/**
 * Ninerdeck - dostęp do usług platformy (GPS, rejestrator śladu) dla drzewa ekranów.
 *
 * Warstwy danych ekrany dostają przez store (`attachRepo` w composition root), ale GPS
 * jest usługą strumieniową i wygodniej podać go kontekstem. Kluczowe: ekran widzi
 * **port**, nie `expo-location` - dzięki temu ten sam ekran działa z odtworzeniem trasy
 * (`ReplayGpsAdapter`) w testach i podglądzie.
 *
 * Rejestrator śladu (faza 5) jedzie tym samym kontekstem: hook detekcji dopisuje do
 * niego surowe fixy i markery, ekran 13 czyta statystyki. Kanał klubu (4.0.0) - też:
 * łącze i szyna powstają raz, w composition root, a ekrany podpinają się do szyny.
 * Klient zleceń (4.0.0) jedzie tą samą drogą - powstaje raz, ekrany go tylko wołają.
 *
 * Plik eksportuje WYŁĄCZNIE komponent - kontekst i hooki `useGps`/`useSensors`/`useTrace`
 * mieszkają w `servicesContext.ts` (powód zapisany tam).
 */

import React, { useMemo } from 'react';

import type { GpsPort, SensorPort } from '../../application/ports';
import type { OrderClient, TraceRecorder } from '../../application';
import { ServicesContext, type LiveChannel, type Services } from './servicesContext';

export function ServicesProvider({
  gps,
  sensors = null,
  trace = null,
  live = null,
  orders = null,
  children,
}: {
  gps: GpsPort | null;
  sensors?: SensorPort | null;
  trace?: TraceRecorder | null;
  live?: LiveChannel | null;
  orders?: OrderClient | null;
  children: React.ReactNode;
}) {
  const value = useMemo<Services>(
    () => ({ gps, sensors, trace, live, orders }),
    [gps, sensors, trace, live, orders],
  );
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}
