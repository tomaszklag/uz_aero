/**
 * UZ Aero - PALETY MOTYWÓW.
 *
 * DWA MOTYWY (issue #72, 2026-09-01): **Night** - ciemny, domyślny - i **Solar** -
 * jasny, o maksymalnym kontraście, do pracy w pełnym słońcu. Paper, Sky i Amber/NVG
 * zostały usunięte: pięć palet dawało wybór, którego pilot nie ma po co dokonywać,
 * a każda dokładała czwarty i piąty odcień do każdej decyzji o kolorze. Wartości
 * usuniętych palet są w historii gita.
 *
 * ŹRÓDŁO PRAWDY: **ten plik**. Do issue #72 był nim `design/05-themes.html` (mockup
 * podglądu motywów, skasowany razem z ekranem, który pokazywał) - odtąd palety żyją
 * w kodzie, a mockupy aplikacji biorą kolory z bloku `:root` swojego `<head>`.
 * Kopia dla panelu (`admin/src/styles/tokens.css`) jest GENEROWANA stąd, a równości
 * z `design/admin/SZABLON.html` pilnuje `app/src/__tests__/tokensCssVars.test.ts`.
 *
 * Solar nadpisuje część tokenów Night i dziedziczy resztę spreadem `...nightColors` -
 * odwzorowanie kaskady, którą miał mockup (`[data-theme="solar"]` nadpisywał wybrane
 * zmienne, reszta spływała z `:root`).
 *
 * Zasada twarda (`CLAUDE.md`): kolory wyłącznie stąd, zero hardcoded hex w komponentach.
 */

export type ThemeName = 'night' | 'solar';

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
// NIGHT - motyw domyślny (ciemny)
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
// SOLAR - motyw jasny, maksymalny kontrast, ostre słońce
// ─────────────────────────────────────────────────────────────────────────────
export const solarColors: ThemeColors = {
  ...nightColors,
  bg: '#FFFFFF',
  bgTint: '#F8F8F8',
  surface: '#FFFFFF',
  surfaceRaised: '#F0F0F0',
  // `surfaceHover` bierze się z weba, gdzie jest stanem `:hover` - telefon go nie ma,
  // więc używamy tego tokenu jako powierzchni „przygaszonej". Bez własnej wartości
  // dziedziczyłby czerń z Night i dawał prawie czarny prostokąt na jasnym tle;
  // wartość: o stopień ciemniejsza od `raised`.
  surfaceHover: '#E2E2E2',
  border: '#A8A8A8',
  borderStrong: '#5E5E5E',
  hairline: 'rgba(0,0,0,0.08)',
  textPrimary: '#000000',
  textSecondary: '#2E2E2E',
  textMuted: '#666666',
  textPlaceholder: '#8A8A8A',
  /*
   * AKCENTY: NAJWIĘCEJ KOLORU, JAKI MIEŚCI SIĘ W PROGU CZYTELNOŚCI
   * (uwaga z urządzenia, 2026-09-04: „w jasnym motywie czerwony i zielony mało się
   * wyróżniają, wyglądają raczej jak czarny").
   *
   * Skarga NIE dotyczyła kontrastu - ten był aż nadto wysoki (zieleń 6,25, czerwień 8,99
   * wobec bieli, przy progu AA 4,5). Dotyczyła KOLOROWOŚCI: barwa niesie tu znaczenie
   * (zielony = w normie, czerwony = błąd, bursztyn = uwaga), a przy jasności 22-30%
   * wszystkie cztery czytały się jak czerń. Kontrast był realizowany kosztem funkcji.
   *
   * Wartości dobrane rachunkiem, nie na oko: w obrębie odcienia marki (ten sam hue, co
   * w Night) szukamy MAKSYMALNEJ chromy CIELAB przy zachowanym kontraście ≥4,5 wobec
   * tła (`bg`) I wobec karty (`surfaceRaised`) - progu pilnuje `themeContrast.test.ts`.
   *
   * Dlaczego zieleń zyskuje najmniej: kanał zielony waży w luminancji 0,7152, więc
   * każde rozjaśnienie natychmiast zjada kontrast. Czerwony (0,2126) i niebieski
   * (0,0722) mają dużo więcej miejsca - stąd błękit skoczył z chromy 46 na 63,
   * a czerwień z jasności 30% na 43%.
   *
   * Ten sam kolor bywa TŁEM przycisku `solid`, na którym napis ma kolor `bg` (w jasnym
   * motywie: biały) - więc czytelność napisu i czytelność koloru jako tekstu to ta sama
   * liczba i ciągną w tę samą stronę. Rozjaśnianie „aż będzie ładnie" psuje oba naraz.
   */
  green: '#027E2B',
  greenMuted: 'rgba(2,126,43,0.10)',
  greenBorder: 'rgba(2,126,43,0.40)',
  amber: '#A25A01',
  amberMuted: 'rgba(162,90,1,0.10)',
  amberBorder: 'rgba(162,90,1,0.40)',
  red: '#D02A1E',
  redMuted: 'rgba(208,42,30,0.10)',
  redBorder: 'rgba(208,42,30,0.40)',
  blue: '#0069D1',
  blueMuted: 'rgba(0,105,209,0.10)',
  blueBorder: 'rgba(0,105,209,0.40)',
  overlay: 'rgba(0,0,0,0.74)',
  selection: 'rgba(0,0,0,0.16)',
};
