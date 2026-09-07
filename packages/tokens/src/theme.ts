/**
 * UZ Aero - ZŁOŻENIE MOTYWU: palety + skale + typografia w jeden obiekt.
 *
 * `Theme` jest tym, co dostaje `ThemeProvider` aplikacji i (po zamianie na zmienne
 * CSS przez `cssVars.ts`) panel webowy. Rejestr `THEMES` trzyma OBA motywy -
 * ciemny Night i jasny Solar (issue #72; wcześniej było ich pięć).
 */

import { fontFamily, typography } from './typography';
import { radius, spacing } from './scale';
import { nightColors, solarColors, type ThemeColors, type ThemeName } from './themes';

export interface Theme {
  name: ThemeName;
  /** true dla Solara - steruje podbiciem wagi cyfr i grubszymi borderami (§6). */
  isLight: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  fontFamily: typeof fontFamily;
  /** §6: w motywie jasnym pogrubiamy bordery 1 → 1.5 px. */
  borderWidth: number;
  borderWidthStrong: number;
}

function makeTheme(name: ThemeName, colors: ThemeColors, isLight: boolean): Theme {
  return {
    name,
    isLight,
    colors,
    spacing,
    radius,
    typography,
    fontFamily,
    borderWidth: isLight ? 1.5 : 1,
    borderWidthStrong: isLight ? 2 : 1.5,
  };
}

export const THEMES: Record<ThemeName, Theme> = {
  night: makeTheme('night', nightColors, false),
  solar: makeTheme('solar', solarColors, true),
};

/** Kolejność w przełączniku: ciemny → jasny (issue #72 - dwie pozycje, nie pięć). */
export const THEME_ORDER: ThemeName[] = ['night', 'solar'];

/**
 * Napisy przełącznika. Pilot wybiera JASNOŚĆ ekranu, nie nazwę palety - „Night"
 * i „Solar" zostały nazwami wewnętrznymi (są w rejestrze, w bazie i w tym kodzie).
 */
export const THEME_LABELS: Record<ThemeName, string> = {
  night: 'Ciemny',
  solar: 'Jasny',
};

export const DEFAULT_THEME: ThemeName = 'night';

/**
 * Motywy WYCOFANE przy issue #72 → najbliższy z pozostałych.
 *
 * Nazwa motywu jest zapisana w profilu pilota (AsyncStorage + kolumna `pilots.theme`),
 * więc telefon, który już raz zsynchronizował Paper albo Amber, dostanie tę nazwę
 * z powrotem. Bez tej tablicy pilot pracujący w słońcu na Paperze obudziłby się
 * w motywie ciemnym - odwzorowujemy więc JASNOŚĆ, którą wybrał: Paper i Sky były
 * jasne (→ Solar), Amber/NVG ciemny (→ Night).
 */
const RETIRED_THEMES = new Map<string, ThemeName>([
  ['paper', 'solar'],
  ['sky', 'solar'],
  ['amber', 'night'],
]);

/**
 * Nazwa motywu → motyw, który wolno pomalować. Nazwa nieznana (literówka w bazie,
 * zapis z nowszej wersji aplikacji) schodzi do domyślnego, zamiast wywracać ekran.
 *
 * Sprawdzamy PRZEZ LISTĘ i mapę, nigdy przez `name in THEMES` ani odczyt z gołego
 * obiektu: rekord `{ theme: 'toString' }` odpowiadał na oba pytania twierdząco
 * (prototyp!), a wołający dostawał funkcję zamiast motywu i wywracał render.
 */
export function resolveThemeName(name: string | null | undefined): ThemeName {
  if (name == null) return DEFAULT_THEME;
  if (THEME_ORDER.includes(name as ThemeName)) return name as ThemeName;
  return RETIRED_THEMES.get(name) ?? DEFAULT_THEME;
}
