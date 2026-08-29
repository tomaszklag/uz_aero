/**
 * UZ Aero - PALETY MOTYWÓW.
 *
 * ŹRÓDŁO PRAWDY: `design/05-themes.html`. Motyw Night pochodzi z bloku `:root`,
 * pozostałe cztery z `.phone[data-theme="…"]` - w pliku HTML nadpisują tylko część
 * zmiennych, a reszta kaskaduje z Night. Odwzorowujemy to spreadem `nightColors`
 * i nadpisaniem dokładnie tych samych tokenów, które nadpisuje CSS. Wartości są
 * SKOPIOWANE z mockupu - nie wymyślone.
 *
 * Zasada twarda (`CLAUDE.md`): kolory wyłącznie stąd, zero hardcoded hex w komponentach.
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
  /**
   * Podpowiedź w pustym polu (`placeholder`) - o stopień SŁABSZA niż `textMuted`.
   *
   * Osobny token, bo to nie jest treść, tylko instrukcja, którą pilot przeczyta raz
   * i która ma zniknąć z oka po pierwszym znaku (uwaga z urządzenia, 2026-08-14:
   * „placeholdery powinny być bardziej subtelne"). W `textMuted` konkurowały wagą
   * z wpisaną wartością obok - a puste pole wyglądało jak wypełnione.
   *
   * Rozmiaru nie różnicujemy: `placeholder` dziedziczy stopień pisma pola i inaczej
   * się nie da, więc cała różnica siedzi w kontraście.
   */
  textPlaceholder: string;
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
  blueBorder: string;
  /** Przyciemnienie pod arkuszami (scrim) - jedna wartość, koniec dryfu 0.7/0.74. */
  overlay: string;
  /**
   * Tło zaznaczonego tekstu w polach edycji.
   *
   * NEUTRALNE z premedytacją, choć akcent byłby „w tonie": wartości w arkuszach są
   * pisane kolorem tonu (paliwo bursztynem, godzina błękitem), a zaznaczenie w tym samym
   * odcieniu zlewa się z cyframi w jednolity prostokąt - pilot nie widzi ani wartości,
   * ani tego, że jest zaznaczona (zgłoszenie z urządzenia, 2026-07-30). Szara przepuszczalna
   * podkładka zostawia glify czytelne w każdym tonie.
   */
  selection: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NIGHT - motyw domyślny (05-themes.html :root)
// ─────────────────────────────────────────────────────────────────────────────
export const nightColors: ThemeColors = {
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
  textPlaceholder: '#565656',
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
  blueBorder: 'rgba(52,152,219,0.28)',
  overlay: 'rgba(0,0,0,0.74)',
  selection: 'rgba(255,255,255,0.22)',
};

// ─────────────────────────────────────────────────────────────────────────────
// PAPER - jasny, ciepła biel "papierowej mapy" ([data-theme="paper"])
// ─────────────────────────────────────────────────────────────────────────────
export const paperColors: ThemeColors = {
  ...nightColors,
  bg: '#F4EEE1',
  bgTint: '#FAF5EA',
  surface: '#FBF7ED',
  surfaceRaised: '#EFE8D6',
  // 05-themes.html nie nadpisuje `--surface-hover` w motywach jasnych, bo na webie to
  // stan `:hover`, którego na telefonie nie ma. My używamy tego tokenu jako powierzchni
  // „przygaszonej" - bez wartości per motyw dziedziczyłby czerń z Night i dawał
  // prawie czarny prostokąt na jasnym tle. Wartość: o stopień ciemniejsza od `raised`.
  surfaceHover: '#E4DAC4',
  border: '#D9CEB6',
  borderStrong: '#B3A583',
  hairline: 'rgba(60,40,10,0.08)',
  textPrimary: '#241C10',
  textSecondary: '#544A3A',
  textMuted: '#6E6250',
  textPlaceholder: '#8E8474',
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
  blueBorder: 'rgba(32,92,144,0.38)',
  overlay: 'rgba(0,0,0,0.74)',
  selection: 'rgba(36,28,16,0.16)',
};

// ─────────────────────────────────────────────────────────────────────────────
// SOLAR - jasny, maksymalny kontrast, ostre słońce ([data-theme="solar"])
// ─────────────────────────────────────────────────────────────────────────────
export const solarColors: ThemeColors = {
  ...nightColors,
  bg: '#FFFFFF',
  bgTint: '#F8F8F8',
  surface: '#FFFFFF',
  surfaceRaised: '#F0F0F0',
  surfaceHover: '#E2E2E2', // patrz komentarz przy `paperColors.surfaceHover`
  border: '#A8A8A8',
  borderStrong: '#5E5E5E',
  hairline: 'rgba(0,0,0,0.08)',
  textPrimary: '#000000',
  textSecondary: '#2E2E2E',
  textMuted: '#666666',
  textPlaceholder: '#8A8A8A',
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
  blueBorder: 'rgba(0,72,144,0.40)',
  overlay: 'rgba(0,0,0,0.74)',
  selection: 'rgba(0,0,0,0.16)',
};

// ─────────────────────────────────────────────────────────────────────────────
// SKY - jasny, chłodna tonacja błękitno-szara ([data-theme="sky"])
// ─────────────────────────────────────────────────────────────────────────────
export const skyColors: ThemeColors = {
  ...nightColors,
  bg: '#E9EFF5',
  bgTint: '#F2F6FA',
  surface: '#F7FAFD',
  surfaceRaised: '#E1E9F1',
  surfaceHover: '#D3DDE8', // patrz komentarz przy `paperColors.surfaceHover`
  border: '#B7C5D3',
  borderStrong: '#7E93A8',
  hairline: 'rgba(15,30,44,0.08)',
  textPrimary: '#0F1E2C',
  textSecondary: '#334454',
  textMuted: '#556579',
  textPlaceholder: '#7B8998',
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
  blueBorder: 'rgba(22,82,142,0.40)',
  overlay: 'rgba(0,0,0,0.74)',
  selection: 'rgba(15,30,44,0.16)',
};

// ─────────────────────────────────────────────────────────────────────────────
// AMBER / NVG - ciemny, bursztyn na czerni, zero błękitu ([data-theme="amber"])
// W pliku HTML nadpisuje tylko amber/blue + bg/surface/border/text; green i red
// (oraz ich warianty) kaskadują z Night - dlatego tu również dziedziczą.
// ─────────────────────────────────────────────────────────────────────────────
export const amberColors: ThemeColors = {
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
  textPlaceholder: '#7A5218',
  amber: '#FF7800',
  amberMuted: 'rgba(255,120,0,0.12)',
  amberBorder: 'rgba(255,120,0,0.32)',
  blue: '#60A0F0',
  blueMuted: 'rgba(96,160,240,0.10)',
  blueBorder: 'rgba(96,160,240,0.32)',
  overlay: 'rgba(0,0,0,0.74)',
  // Motyw NVG nie dopuszcza białego światła - podkładka też jest bursztynowa.
  selection: 'rgba(255,176,32,0.22)',
};
