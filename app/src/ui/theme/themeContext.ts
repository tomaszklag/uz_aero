/**
 * UZ Aero — kontekst motywu i jego JEDYNY czytnik.
 *
 * Osobny plik od `ThemeProvider.tsx` z powodu narzędziowego: **Fast Refresh podmienia
 * moduł w miejscu tylko wtedy, gdy WSZYSTKIE jego eksporty są komponentami**. Hook
 * `useTheme` obok komponentu `ThemeProvider` sprawiał, że moduł przestawał być granicą
 * odświeżania — a to nie jest wyłącznie strata wygody.
 *
 * Groźny jest sam `createContext`: gdyby re-ewaluował się razem z komponentami,
 * zamontowany provider podawałby STARY obiekt kontekstu, a świeżo odświeżony ekran
 * czytałby NOWY. `useContext` zwróciłby wtedy `undefined`, czyli — po tym rzucie niżej —
 * „useTheme poza ThemeProvider" na ekranie, który stoi dokładnie wewnątrz providera.
 * Tożsamość kontekstu MUSI przetrwać odświeżenie komponentów, które go czytają,
 * więc mieszka poza granicą odświeżania.
 *
 * Kontekst i hook zostają RAZEM, bo to jedna odpowiedzialność — dostęp do motywu.
 * Rozdzielenie ich kazałoby eksportować sam obiekt kontekstu szerzej, a wtedy
 * `useContext(ThemeContext)` z pominięciem hooka omijałby rzut i wracał `undefined`.
 *
 * To samo rozstrzygnięcie po stronie panelu: `admin/src/auth/sessionContext.ts`
 * (`docs/architektura-panelu-frontend.md` §2.3).
 */

import { createContext, useContext } from 'react';

import type { Theme, ThemeName } from './tokens';

export interface ThemeContextValue {
  /** Komplet tokenów aktywnego motywu (colors, spacing, radius, typography, ...). */
  theme: Theme;
  /** Nazwa aktywnego motywu. */
  themeName: ThemeName;
  /** Ustawia i persystuje motyw (pod zalogowanego pilota; zapis lokalny, sync przy okazji). */
  setTheme: (name: ThemeName) => void;
  /** true po odczytaniu zapisanego wyboru pilota z magazynu. */
  ready: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() musi być użyty wewnątrz <ThemeProvider>.');
  }
  return ctx;
}
