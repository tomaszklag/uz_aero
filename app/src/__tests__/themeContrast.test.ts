/**
 * UZ Aero - AKCENTY MUSZĄ BYĆ CZYTELNE NA SWOIM TLE (oba motywy).
 *
 * Test powstał przy uwadze z urządzenia (2026-09-04: „w jasnym motywie czerwony i zielony
 * wyglądają raczej jak czarny"). Poprawka polegała na ROZJAŚNIENIU akcentów Solar aż do
 * granicy czytelności - a granicę trzeba było czymś przybić, bo następna taka uwaga
 * skusi do zejścia jeszcze niżej i nikt nie zauważy, że kolorowy tekst przestał się
 * czytać w słońcu.
 *
 * Próg: WCAG AA dla tekstu (4,5) liczony wobec DWÓCH podłoży, na których akcent naprawdę
 * stoi - tła ekranu i karty. Dotyczy obu motywów, bo reguła jest o czytelności, nie
 * o jasnym motywie: Night też przez nią przechodzi (najciaśniej czerwień, 4,56 na karcie).
 *
 * Czego ten test NIE pilnuje: kolorowości. Ona jest drugą połową tamtej uwagi i mieszka
 * w komentarzu przy palecie (`packages/tokens/src/themes.ts`) - liczba bez oka nie
 * rozstrzygnie, czy zieleń „wygląda na zieloną", a oko bez liczby nie zauważy, że właśnie
 * zeszło pod próg.
 */

import { THEMES, type Theme } from '@uzaero/tokens';

/** Względna luminancja wg WCAG 2.1 (kanały sRGB po linearyzacji). */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const AA_TEXT = 4.5;
const ACCENTS = ['green', 'amber', 'red', 'blue'] as const;

describe.each(Object.values(THEMES))('$name - akcenty na swoich podłożach', (theme: Theme) => {
  it.each(ACCENTS)('%s czyta się na tle ekranu i na karcie', (accent) => {
    const color = theme.colors[accent];

    expect(contrast(color, theme.colors.bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(color, theme.colors.surfaceRaised)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('napis na przycisku `solid` czyta się na wypełnieniu akcentem', () => {
    // `ActionButton` maluje treść kolorem `bg` - czyli czytelność napisu to ta sama
    // liczba, co czytelność akcentu jako tekstu. Osobna asercja, bo osobna reguła:
    // gdyby kolor napisu kiedyś się zmienił, ta się nie zmieni razem z tamtą.
    for (const accent of ACCENTS) {
      expect(contrast(theme.colors[accent], theme.colors.bg)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

/** Powyżej tego kontrastu kolor na białym tle przestaje być kolorem, a staje się czernią. */
const TOO_DARK = 6.0;

describe('Solar - kolor niesie znaczenie, więc nie może być czernią', () => {
  /*
   * Druga połowa uwagi z urządzenia i jedyny sposób, w jaki daje się ją zmierzyć: skoro
   * tłem jest biel, to ZA WYSOKI kontrast znaczy „za ciemny". Stąd przedział, nie próg -
   * dolna granica broni czytelności, górna barwy.
   *
   * Że to nie jest asercja pod dzisiejsze wartości: stara paleta wypadała z niej trzema
   * kolorami na cztery - zieleń 6,25, czerwień 8,99 i błękit 9,01 (bursztyn 5,96 mieścił
   * się i faktycznie nie był w zgłoszeniu wymieniony).
   */
  it.each(ACCENTS)('%s jest kolorem, nie czernią', (accent) => {
    const ratio = contrast(THEMES.solar.colors[accent], THEMES.solar.colors.bg);

    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio).toBeLessThanOrEqual(TOO_DARK);
  });
});
