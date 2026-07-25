/**
 * UZ Aero — design tokens
 *
 * ŹRÓDŁO PRAWDY: design/05-themes.html
 * Motyw Night pochodzi z bloku CSS `:root`. Pozostałe cztery motywy z
 * `.phone[data-theme="..."]` — w pliku HTML nadpisują tylko część zmiennych,
 * a reszta kaskaduje z `:root` (Night). Odwzorowujemy to tutaj rozszerzając
 * `nightColors` operatorem spread i nadpisując dokładnie te same tokeny, które
 * nadpisuje CSS. Wartości są SKOPIOWANE z pliku — nie wymyślone.
 *
 * Zasada twarda (CLAUDE.md): kolory wyłącznie stąd. Zero hardcoded hex w komponentach.
 */

export type ThemeName = 'night' | 'paper' | 'solar' | 'sky' | 'amber';

/** Pełny zestaw tokenów kolorów jednego motywu. */
export interface ThemeColors {
  bg: string;
  bgTint: string;
  surface: string;
  surfaceRaised: string;
  surfaceHover: string;
  border: string;
  borderStrong: string;
  hairline: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  green: string;
  greenHover: string;
  greenMuted: string;
  greenBorder: string;
  greenGlow: string;
  amber: string;
  amberMuted: string;
  amberBorder: string;
  amberGlow: string;
  red: string;
  redMuted: string;
  redBorder: string;
  redGlow: string;
  blue: string;
  blueMuted: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NIGHT — motyw domyślny (05-themes.html :root)
// ─────────────────────────────────────────────────────────────────────────────
const nightColors: ThemeColors = {
  bg: '#0D0D0D',
  bgTint: '#111318',
  surface: '#141414',
  surfaceRaised: '#1A1A1A',
  surfaceHover: '#222222',
  border: '#252525',
  borderStrong: '#333333',
  hairline: 'rgba(255,255,255,0.04)',
  textPrimary: '#E8E8E8',
  textSecondary: '#888888',
  textMuted: '#7A7A7A',
  green: '#2ECC71',
  greenHover: '#3DDC82',
  greenMuted: 'rgba(46,204,113,0.12)',
  greenBorder: 'rgba(46,204,113,0.28)',
  greenGlow: 'rgba(46,204,113,0.4)',
  amber: '#F39C12',
  amberMuted: 'rgba(243,156,18,0.12)',
  amberBorder: 'rgba(243,156,18,0.28)',
  amberGlow: 'rgba(243,156,18,0.35)',
  red: '#E74C3C',
  redMuted: 'rgba(231,76,60,0.12)',
  redBorder: 'rgba(231,76,60,0.28)',
  redGlow: 'rgba(231,76,60,0.4)',
  blue: '#3498DB',
  blueMuted: 'rgba(52,152,219,0.12)',
};

// ─────────────────────────────────────────────────────────────────────────────
// PAPER — jasny, ciepła biel "papierowej mapy" ([data-theme="paper"])
// ─────────────────────────────────────────────────────────────────────────────
const paperColors: ThemeColors = {
  ...nightColors,
  bg: '#F4EEE1',
  bgTint: '#FAF5EA',
  surface: '#FBF7ED',
  surfaceRaised: '#EFE8D6',
  border: '#D9CEB6',
  borderStrong: '#B3A583',
  hairline: 'rgba(60,40,10,0.08)',
  textPrimary: '#241C10',
  textSecondary: '#544A3A',
  textMuted: '#6E6250',
  green: '#1E7A40',
  greenMuted: 'rgba(30,122,64,0.12)',
  greenBorder: 'rgba(30,122,64,0.38)',
  amber: '#9E5C00',
  amberMuted: 'rgba(158,92,0,0.12)',
  amberBorder: 'rgba(158,92,0,0.38)',
  red: '#A62A18',
  redMuted: 'rgba(166,42,24,0.12)',
  redBorder: 'rgba(166,42,24,0.38)',
  blue: '#205C90',
  blueMuted: 'rgba(32,92,144,0.10)',
};

// ─────────────────────────────────────────────────────────────────────────────
// SOLAR — jasny, maksymalny kontrast, ostre słońce ([data-theme="solar"])
// ─────────────────────────────────────────────────────────────────────────────
const solarColors: ThemeColors = {
  ...nightColors,
  bg: '#FFFFFF',
  bgTint: '#F8F8F8',
  surface: '#FFFFFF',
  surfaceRaised: '#F0F0F0',
  border: '#A8A8A8',
  borderStrong: '#5E5E5E',
  hairline: 'rgba(0,0,0,0.08)',
  textPrimary: '#000000',
  textSecondary: '#2E2E2E',
  textMuted: '#666666',
  green: '#007030',
  greenMuted: 'rgba(0,112,48,0.10)',
  greenBorder: 'rgba(0,112,48,0.40)',
  amber: '#9A5000',
  amberMuted: 'rgba(154,80,0,0.10)',
  amberBorder: 'rgba(154,80,0,0.40)',
  red: '#980000',
  redMuted: 'rgba(152,0,0,0.10)',
  redBorder: 'rgba(152,0,0,0.40)',
  blue: '#004890',
  blueMuted: 'rgba(0,72,144,0.10)',
};

// ─────────────────────────────────────────────────────────────────────────────
// SKY — jasny, chłodna tonacja błękitno-szara ([data-theme="sky"])
// ─────────────────────────────────────────────────────────────────────────────
const skyColors: ThemeColors = {
  ...nightColors,
  bg: '#E9EFF5',
  bgTint: '#F2F6FA',
  surface: '#F7FAFD',
  surfaceRaised: '#E1E9F1',
  border: '#B7C5D3',
  borderStrong: '#7E93A8',
  hairline: 'rgba(15,30,44,0.08)',
  textPrimary: '#0F1E2C',
  textSecondary: '#334454',
  textMuted: '#556579',
  green: '#14784A',
  greenMuted: 'rgba(20,120,74,0.12)',
  greenBorder: 'rgba(20,120,74,0.40)',
  amber: '#A05E00',
  amberMuted: 'rgba(160,94,0,0.12)',
  amberBorder: 'rgba(160,94,0,0.40)',
  red: '#A82418',
  redMuted: 'rgba(168,36,24,0.10)',
  redBorder: 'rgba(168,36,24,0.40)',
  blue: '#16528E',
  blueMuted: 'rgba(22,82,142,0.10)',
};

// ─────────────────────────────────────────────────────────────────────────────
// AMBER / NVG — ciemny, bursztyn na czerni, zero błękitu ([data-theme="amber"])
// W pliku HTML nadpisuje tylko amber/blue + bg/surface/border/text; green i red
// (oraz ich warianty) kaskadują z Night — dlatego tu również dziedziczą.
// ─────────────────────────────────────────────────────────────────────────────
const amberColors: ThemeColors = {
  ...nightColors,
  bg: '#070400',
  bgTint: '#0F0800',
  surface: '#100600',
  surfaceRaised: '#190D00',
  border: '#2A1600',
  borderStrong: '#3C2000',
  hairline: 'rgba(255,176,32,0.04)',
  textPrimary: '#FFB020',
  textSecondary: '#D09030',
  textMuted: '#A87020',
  amber: '#FF7800',
  amberMuted: 'rgba(255,120,0,0.12)',
  amberBorder: 'rgba(255,120,0,0.32)',
  blue: '#60A0F0',
  blueMuted: 'rgba(96,160,240,0.10)',
};

// ─────────────────────────────────────────────────────────────────────────────
// SKALE NIEZALEŻNE OD MOTYWU
// ─────────────────────────────────────────────────────────────────────────────

/** Skala odstępów (px). Wartości: 4,8,12,16,20,24,32,40,48 (docs/_main.md.txt §9). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
} as const;

/** Promienie zaokrągleń. Karty/pola = 12, przyciski = 14/16, modale = 24, pill = 999. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Rodziny czcionek — nazwy zgodne z eksportami @expo-google-fonts.
 * Bebas Neue = display/nagłówki. Archivo = body/etykiety/przyciski.
 * JetBrains Mono = cyfry timerów, kody ICAO, wartości GPS, MH, kody pilotów.
 */
export const fontFamily = {
  display: 'BebasNeue_400Regular',
  body: 'Archivo_400Regular',
  bodyMedium: 'Archivo_500Medium',
  bodySemiBold: 'Archivo_600SemiBold',
  bodyBold: 'Archivo_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

/** Pojedynczy token typograficzny (bez koloru — kolor idzie z motywu). */
export interface TypographyToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: 'uppercase' | 'none';
}

/**
 * Skala typografii. Rozmiary/letter-spacing skopiowane z 05-themes.html:
 *  - display     → .film-strip / .phase-hero-name (Bebas Neue)
 *  - timer_large → duży timer, cyfry mono (CLAUDE.md: "cyfry timerów = JetBrains Mono")
 *  - param_value → .param-value (mono 28 / ls 2 / lh 1)
 *  - param_label → .param-label (mono 10 / ls 2.5 / UPPERCASE)
 *  - body        → tekst Archivo
 *  - label       → etykiety/przyciski Archivo
 *  - mono_code   → inline kody: ICAO, GPS, MH, kod pilota (.compact-info)
 */
export const typography = {
  display: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: 2,
  },
  timer_large: {
    fontFamily: fontFamily.mono,
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: 2,
  },
  param_value: {
    fontFamily: fontFamily.mono,
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: 2,
  },
  param_label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  label: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  mono_code: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1,
  },
} satisfies Record<string, TypographyToken>;

export type TypographyName = keyof typeof typography;

// ─────────────────────────────────────────────────────────────────────────────
// TYP MOTYWU I REJESTR
// ─────────────────────────────────────────────────────────────────────────────

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
