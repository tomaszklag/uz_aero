/**
 * UZ Aero — ThemeProvider
 *
 * Context + Provider trzymający aktywny motyw. Od decyzji 2026-07-29 motyw jest
 * preferencją PILOTA, nie telefonu: rekord żyje per pilot (`ThemePrefsStore`,
 * AsyncStorage) i wędruje między urządzeniami przez `/me/prefs` (`ThemePrefsSync`).
 *
 * Trzy źródła zmiany motywu, wszystkie schodzą się tutaj:
 *  • **tożsamość** — po odblokowaniu/przelogowaniu wchodzi motyw TEGO pilota
 *    (subskrypcja store'u auth); bez pilota obowiązuje default (Night);
 *  • **dotknięcie pilota** — `setTheme` przemalowuje od razu i zapisuje rekord
 *    z `dirty` + stemplem decyzji; wysyłką zajmie się pętla okazji (zmiana motywu
 *    NIGDY nie czeka na sieć);
 *  • **serwer** — adopcja nowszego wyboru z innego urządzenia przychodzi słuchaczem
 *    `ThemePrefsSync.onApplied` i przemalowuje ekran na żywo.
 *
 * Nazwa motywu spoza tokenów (stary zapis, literówka w bazie) NIE wywraca niczego —
 * nakładamy wyłącznie nazwy znane `THEMES`, reszta zjeżdża do Night.
 *
 * Plik eksportuje WYŁĄCZNIE komponent — kontekst i hook `useTheme` mieszkają
 * w `themeContext.ts` (powód zapisany tam). Dla wołających nic się nie zmienia:
 * barrel `ui/theme/index.ts` wystawia jedno i drugie.
 */

import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemePrefsStore } from '../../infrastructure/prefs/themePrefsStore';
import { useAuthStore } from '../store/authStore';
import { useSessionStore } from '../store/sessionStore';
import { ThemeContext, type ThemeContextValue } from './themeContext';
import { DEFAULT_THEME, THEMES, type ThemeName } from './tokens';

export interface ThemeProviderProps {
  children: ReactNode;
  /** Nadpisanie motywu początkowego (głównie do testów). */
  initialTheme?: ThemeName;
}

/** Tylko nazwy z tokenów mają prawo pomalować ekran; reszta = default (Night). */
const knownTheme = (name: string | undefined | null): ThemeName =>
  name != null && name in THEMES ? (name as ThemeName) : DEFAULT_THEME;

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>(initialTheme ?? DEFAULT_THEME);
  const [ready, setReady] = useState(false);

  // Jedno miejsce zna format rekordu (klucze per pilot + migracja starego klucza):
  // ta sama klasa obsługuje zapis w `ThemePrefsSync` — patrz composition root.
  const prefs = useMemo(() => new ThemePrefsStore(AsyncStorage), []);

  const authLoading = useAuthStore((s) => s.status === 'loading');
  const pilotId = useAuthStore((s) => s.pilot?.id ?? null);
  const themeSync = useSessionStore((s) => s.themePrefs);

  // Motyw wchodzi razem z tożsamością: odblokowanie/przelogowanie = motyw TEGO pilota.
  useEffect(() => {
    if (authLoading) return; // magazyn poświadczeń jeszcze czytany — nie migoczmy motywem
    let cancelled = false;
    void (async () => {
      let next: ThemeName = DEFAULT_THEME;
      if (pilotId != null) {
        try {
          next = knownTheme((await prefs.read(pilotId))?.theme);
        } catch {
          // Odczyt storage nie może blokować startu aplikacji — zostajemy przy Night.
        }
      }
      if (!cancelled) {
        setThemeName(next);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, pilotId, prefs]);

  // Adopcja z serwera (LWW wygrał inny telefon tego pilota) — przemalowanie na żywo.
  useEffect(() => {
    if (themeSync == null) return;
    return themeSync.onApplied((forPilotId, theme) => {
      if (forPilotId === useAuthStore.getState().pilot?.id && theme in THEMES) {
        setThemeName(theme as ThemeName);
      }
    });
  }, [themeSync]);

  const setTheme = useCallback(
    (name: ThemeName) => {
      setThemeName(name);
      const pilot = useAuthStore.getState().pilot;
      if (pilot == null) return; // bez tożsamości nie ma czyjego profilu zapisać
      // Zapis best-effort: `updatedAt` to stempel DECYZJI (oś LWW), `dirty` odda go
      // serwerowi przy najbliższej okazji. Brak persystencji nie psuje bieżącej sesji.
      void prefs
        .write(pilot.id, { theme: name, updatedAt: Date.now(), dirty: true })
        .catch(() => {});
    },
    [prefs],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: THEMES[themeName], themeName, setTheme, ready }),
    [themeName, setTheme, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
