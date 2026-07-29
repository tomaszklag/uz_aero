/**
 * UZ Aero — dostęp do usług platformy (GPS, rejestrator śladu) dla drzewa ekranów.
 *
 * Warstwy danych ekrany dostają przez store (`attachRepo` w composition root), ale GPS
 * jest usługą strumieniową i wygodniej podać go kontekstem. Kluczowe: ekran widzi
 * **port**, nie `expo-location` — dzięki temu ten sam ekran działa z odtworzeniem trasy
 * (`ReplayGpsAdapter`) w testach i podglądzie.
 *
 * Rejestrator śladu (faza 5) jedzie tym samym kontekstem: hook detekcji dopisuje do
 * niego surowe fixy i markery, ekran 13 czyta statystyki.
 */

import React, { createContext, useContext, useMemo } from 'react';

import type { GpsPort } from '../../application/ports';
import type { TraceRecorder } from '../../application';

interface Services {
  gps: GpsPort | null;
  trace: TraceRecorder | null;
}

const ServicesContext = createContext<Services>({ gps: null, trace: null });

export function ServicesProvider({
  gps,
  trace = null,
  children,
}: {
  gps: GpsPort | null;
  trace?: TraceRecorder | null;
  children: React.ReactNode;
}) {
  const value = useMemo<Services>(() => ({ gps, trace }), [gps, trace]);
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

/** Port GPS albo null, gdy niedostępny (brak uprawnień, środowisko bez lokalizacji). */
export function useGps(): GpsPort | null {
  return useContext(ServicesContext).gps;
}

/** Rejestrator śladu kalibracyjnego albo null (testy/StyleGuide bez magazynu). */
export function useTrace(): TraceRecorder | null {
  return useContext(ServicesContext).trace;
}
