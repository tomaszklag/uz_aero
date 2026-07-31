/**
 * UZ Aero — AppText
 *
 * Typografia oparta wyłącznie na tokenach motywu. Warianty pokrywają całą skalę
 * z 05-themes.html. Reguła §6 (docs/_main.md.txt): w motywach jasnych podbijamy
 * wagę cyfr — realizujemy to zamianą rodziny JetBrains Mono na cięższą dla
 * wariantów "cyfrowych" (timer / param / mono).
 */

import React, { useMemo } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '../../theme';
import { type Theme, type TypographyName, type TypographyToken } from '../../theme/tokens';

/** Warianty publiczne. Wymagane przez zadanie: display | body | label | mono | timer.
 *  Dodatkowo param / paramLabel — pełna skala tokenów (param_value / param_label) —
 *  oraz micro: mikro-etykiety 9 px w wersalikach (`.diag-key`, `.header-sub`). */
export type AppTextVariant =
  | 'display'
  | 'timer'
  | 'param'
  | 'paramLabel'
  | 'button'
  | 'buttonSmall'
  | 'body'
  | 'label'
  | 'mono'
  | 'micro';

export type AppTextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'green'
  | 'amber'
  | 'red'
  | 'blue';

const VARIANT_TOKEN: Record<AppTextVariant, TypographyName> = {
  display: 'display',
  timer: 'timer_large',
  param: 'param_value',
  paramLabel: 'param_label',
  button: 'button',
  buttonSmall: 'button_small',
  body: 'body',
  label: 'label',
  mono: 'mono_code',
  micro: 'micro',
};

/** Warianty renderujące cyfry mono — kandydaci do podbicia wagi w motywach jasnych.
 *  `micro` (jak `paramLabel`) celowo poza zbiorem — etykieta nie jest odczytem. */
const DIGIT_VARIANTS: ReadonlySet<AppTextVariant> = new Set<AppTextVariant>([
  'timer',
  'param',
  'mono',
]);

function toneColor(theme: Theme, tone: AppTextTone): string {
  switch (tone) {
    case 'secondary':
      return theme.colors.textSecondary;
    case 'muted':
      return theme.colors.textMuted;
    case 'green':
      return theme.colors.green;
    case 'amber':
      return theme.colors.amber;
    case 'red':
      return theme.colors.red;
    case 'blue':
      return theme.colors.blue;
    case 'primary':
    default:
      return theme.colors.textPrimary;
  }
}

export interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
  tone?: AppTextTone;
}

export function AppText({
  variant = 'body',
  tone = 'primary',
  style,
  children,
  ...rest
}: AppTextProps) {
  const { theme } = useTheme();

  const computed = useMemo<TextStyle>(() => {
    const token: TypographyToken = theme.typography[VARIANT_TOKEN[variant]];

    // §6: podbicie wagi cyfr w motywach jasnych = cięższa rodzina mono.
    let fontFamily = token.fontFamily;
    if (theme.isLight && DIGIT_VARIANTS.has(variant)) {
      fontFamily = variant === 'timer' ? theme.fontFamily.monoBold : theme.fontFamily.monoMedium;
    }

    return {
      fontFamily,
      fontSize: token.fontSize,
      lineHeight: token.lineHeight,
      letterSpacing: token.letterSpacing,
      textTransform: token.textTransform,
      color: toneColor(theme, tone),
    };
  }, [theme, variant, tone]);

  return (
    <Text {...rest} style={[computed, style]}>
      {children}
    </Text>
  );
}
