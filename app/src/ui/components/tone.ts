/**
 * UZ Aero - tony akcentu wspólne dla komponentów Design Systemu.
 *
 * W mockupach akcent zawsze występuje jako trójka: kolor tekstu/ikony, tło `-muted`
 * i obramowanie `-border`. Zamiast powtarzać ten `switch` w każdym komponencie,
 * mamy jedno miejsce - dzięki temu nowy komponent od razu jest spójny, a zmiana
 * palety przechodzi przez cały system.
 *
 * Znaczenia (z designu): green = stan aktywny/OK · amber = uwaga, paliwo, offline
 * · red = zatrzymanie, błąd · blue = informacja, faza w powietrzu · neutral = tło.
 */

import type { Theme } from '../theme/tokens';

/**
 * Rynienka paska poziomu leżącego na TONOWANEJ karcie (`.fob-bar` z mockupu 06):
 * półprzezroczysta czerń działa na obu motywach, bo przyciemnia tło karty zamiast
 * podmieniać je na kolor z palety. Jedna stała, żeby wskaźnik FOB i miarka wyniku
 * tankowania nie rozjechały się o odcień (uwaga z urządzenia, 2026-09-03:
 * „źle wygląda żółty pasek na żółtym tle" - rynienka z `surfaceRaised` zlewała
 * bursztynowe wypełnienie z bursztynową kartą).
 */
export const TINTED_TRACK = 'rgba(0,0,0,0.35)';

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

export interface ToneColors {
  /** Kolor tekstu i ikon. */
  accent: string;
  /** Wypełnienie (przygaszone tło akcentu). */
  muted: string;
  /** Obramowanie. */
  border: string;
}

export function toneColors(theme: Theme, tone: Tone): ToneColors {
  const { colors } = theme;
  switch (tone) {
    case 'green':
      return { accent: colors.green, muted: colors.greenMuted, border: colors.greenBorder };
    case 'amber':
      return { accent: colors.amber, muted: colors.amberMuted, border: colors.amberBorder };
    case 'red':
      return { accent: colors.red, muted: colors.redMuted, border: colors.redBorder };
    case 'blue':
      return { accent: colors.blue, muted: colors.blueMuted, border: colors.blueBorder };
    case 'neutral':
    default:
      return {
        accent: colors.textSecondary,
        muted: colors.surface,
        border: colors.border,
      };
  }
}
