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
