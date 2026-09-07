/**
 * UZ Aero - dostęp do usług platformy (GPS, rejestrator śladu) dla drzewa ekranów.
 *
 * Warstwy danych ekrany dostają przez store (`attachRepo` w composition root), ale GPS
 * jest usługą strumieniową i wygodniej podać go kontekstem. Kluczowe: ekran widzi
 * **port**, nie `expo-location` - dzięki temu ten sam ekran działa z odtworzeniem trasy
 * (`ReplayGpsAdapter`) w testach i podglądzie.
 *
 * Rejestrator śladu (faza 5) jedzie tym samym kontekstem: hook detekcji dopisuje do
 * niego surowe fixy i markery, ekran 13 czyta statystyki.
 *
 * Plik eksportuje WYŁĄCZNIE komponent - kontekst i hooki `useGps`/`useSensors`/`useTrace`
 * mieszkają w `servicesContext.ts` (powód zapisany tam).
 */

import React, { useMemo } from 'react';

import type { GpsPort, SensorPort } from '../../application/ports';
import type { TraceRecorder } from '../../application';
import { ServicesContext, type Services } from './servicesContext';

export function ServicesProvider({
  gps,
  sensors = null,
  trace = null,
  children,
}: {
  gps: GpsPort | null;
  sensors?: SensorPort | null;
  trace?: TraceRecorder | null;
  children: React.ReactNode;
}) {
  const value = useMemo<Services>(() => ({ gps, sensors, trace }), [gps, sensors, trace]);
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}
