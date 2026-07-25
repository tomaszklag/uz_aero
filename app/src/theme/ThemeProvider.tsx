/**
 * UZ Aero — ThemeProvider
 *
 * Context + Provider trzymający aktywny motyw. Wybór motywu jest persystowany
 * w AsyncStorage i przywracany przy starcie. Domyślny motyw: Night.
 *
 * useTheme() zwraca: tokeny aktywnego motywu (`theme`), `themeName` oraz `setTheme`.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_THEME, THEMES, type Theme, type ThemeName } from './tokens';

const STORAGE_KEY = 'uzaero.theme';

export interface ThemeContextValue {
  /** Komplet tokenów aktywnego motywu (colors, spacing, radius, typography, ...). */
  theme: Theme;
  /** Nazwa aktywnego motywu. */
  themeName: ThemeName;
  /** Ustawia i persystuje motyw. */
  setTheme: (name: ThemeName) => void;
  /** true po odczytaniu zapisanego wyboru z AsyncStorage. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
  children: ReactNode;
  /** Nadpisanie motywu początkowego (głównie do testów). */
  initialTheme?: ThemeName;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>(initialTheme ?? DEFAULT_THEME);
  const [ready, setReady] = useState(false);

  // Przywróć zapisany wybór motywu (offline-safe: brak zapisu => Night).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (mounted && saved && saved in THEMES) {
          setThemeName(saved as ThemeName);
        }
      } catch {
        // Odczyt storage nie może blokować startu aplikacji — zostajemy przy Night.
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    AsyncStorage.setItem(STORAGE_KEY, name).catch(() => {
      // Zapis best-effort — brak persystencji nie psuje bieżącej sesji.
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: THEMES[themeName], themeName, setTheme, ready }),
    [themeName, setTheme, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() musi być użyty wewnątrz <ThemeProvider>.');
  }
  return ctx;
}
