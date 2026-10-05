/**
 * Ninerdeck - kontekst usług platformy (GPS, czujniki, rejestrator śladu) i jego czytniki.
 *
 * Osobny plik od `ServicesProvider.tsx` z tego samego powodu co `ui/theme/themeContext.ts`:
 * **Fast Refresh podmienia moduł w miejscu tylko wtedy, gdy WSZYSTKIE jego eksporty są
 * komponentami**. Trzy hooki obok komponentu odbierały modułowi status granicy
 * odświeżania, a wtedy `createContext` re-ewaluuje się razem z komponentami i
 * zamontowany provider podaje INNY obiekt kontekstu niż ten, którego szuka odświeżony
 * ekran. Skutek jest cichy i mylący: `useGps()` zwraca `null`, czyli ekran raportuje
 * „brak GPS" przy działającym odbiorniku.
 *
 * Wartością domyślną kontekstu są same `null`-e i to jest ZAMIERZONE: brak portu jest
 * stanem normalnym (testy, telefon bez barometru), nie awarią - więc czytnik
 * nie rzuca, w odróżnieniu od `useTheme`.
 */

import { createContext, useContext } from 'react';

import type { GpsPort, SensorPort } from '../../application/ports';
import type { LiveBus, LiveLink, TraceRecorder } from '../../application';

/**
 * Kanał klubu (4.0.0, epik KK-C #246): JEDNO łącze na telefon (K1) i szyna, na której
 * ekrany podpinają się tematami. Oba żyją przez całe uruchomienie aplikacji; kiedy łącze
 * stoi, rozstrzyga binder za bramką tożsamości (`useLiveLink`).
 */
export interface LiveChannel {
  link: LiveLink;
  bus: LiveBus;
}

export interface Services {
  gps: GpsPort | null;
  /** Czujniki pokładowe (barometr, inercja) - na razie WYŁĄCZNIE do nagrywania śladu. */
  sensors: SensorPort | null;
  trace: TraceRecorder | null;
  live: LiveChannel | null;
}

export const ServicesContext = createContext<Services>({
  gps: null,
  sensors: null,
  trace: null,
  live: null,
});

/** Port GPS albo null, gdy niedostępny (brak uprawnień, środowisko bez lokalizacji). */
export function useGps(): GpsPort | null {
  return useContext(ServicesContext).gps;
}

/**
 * Port czujników pokładowych albo null. `NullSensorAdapter` też zwraca „nic nie mam" -
 * telefon bez barometru jest stanem normalnym, nie awarią, więc wołający nie musi
 * odróżniać „brak portu" od „port bez czujników".
 */
export function useSensors(): SensorPort | null {
  return useContext(ServicesContext).sensors;
}

/** Rejestrator śladu kalibracyjnego albo null (testy bez magazynu). */
export function useTrace(): TraceRecorder | null {
  return useContext(ServicesContext).trace;
}

/** Kanał klubu albo null (awaria startu) - ekran bez kanału po prostu nie dostaje sygnałów. */
export function useLive(): LiveChannel | null {
  return useContext(ServicesContext).live;
}
