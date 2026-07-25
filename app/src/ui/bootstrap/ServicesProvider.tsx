/**
 * UZ Aero — dostęp do usług platformy (GPS) dla drzewa ekranów.
 *
 * Warstwy danych ekrany dostają przez store (`attachRepo` w composition root), ale GPS
 * jest usługą strumieniową i wygodniej podać go kontekstem. Kluczowe: ekran widzi
 * **port**, nie `expo-location` — dzięki temu ten sam ekran działa z odtworzeniem trasy
 * (`ReplayGpsAdapter`) w testach i podglądzie.
 */

import React, { createContext, useContext, useMemo } from 'react';

import type { GpsPort } from '../../application/ports';

interface Services {
  gps: GpsPort | null;
}

const ServicesContext = createContext<Services>({ gps: null });

export function ServicesProvider({
  gps,
  children,
}: {
  gps: GpsPort | null;
  children: React.ReactNode;
}) {
  const value = useMemo<Services>(() => ({ gps }), [gps]);
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

/** Port GPS albo null, gdy niedostępny (brak uprawnień, środowisko bez lokalizacji). */
export function useGps(): GpsPort | null {
  return useContext(ServicesContext).gps;
}
