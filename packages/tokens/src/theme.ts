/**
 * UZ Aero — ZŁOŻENIE MOTYWU: palety + skale + typografia w jeden obiekt.
 *
 * `Theme` jest tym, co dostaje `ThemeProvider` aplikacji i (po zamianie na zmienne
 * CSS przez `cssVars.ts`) panel webowy. Rejestr `THEMES` trzyma wszystkie pięć.
 */

import { fontFamily, typography } from './typography';
import { radius, spacing } from './scale';
import {
  amberColors,
  nightColors,
  paperColors,
  skyColors,
  solarColors,
  type ThemeColors,
  type ThemeName,
} from './themes';

export interface Theme {
  name: ThemeName;
  /** true dla Paper/Solar/Sky — steruje podbiciem wagi cyfr i grubszymi borderami (§6). */
  isLight: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  fontFamily: typeof fontFamily;
  /** §6: w motywach jasnych pogrubiamy bordery 1 → 1.5 px. */
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
  paper: makeTheme('paper', paperColors, true),
  solar: makeTheme('solar', solarColors, true),
  sky: makeTheme('sky', skyColors, true),
  amber: makeTheme('amber', amberColors, false),
};

/** Kolejność w przełączniku motywów — zgodna z sekcją theme-picker w 05-themes.html. */
export const THEME_ORDER: ThemeName[] = ['night', 'paper', 'solar', 'sky', 'amber'];

/** Etykiety wyświetlane w ThemePicker. */
export const THEME_LABELS: Record<ThemeName, string> = {
  night: 'Night',
  paper: 'Paper',
  solar: 'Solar',
  sky: 'Sky',
  amber: 'Amber',
};

export const DEFAULT_THEME: ThemeName = 'night';
