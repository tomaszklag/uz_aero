/**
 * UZ Aero — Card
 *
 * Powtarzalny pojemnik z mockupów (.section / .card / .day-log): powierzchnia,
 * obramowanie, zaokrąglenie, opcjonalny nagłówek z etykietą mono UPPERCASE.
 *
 * Używany przez log dnia, siatki parametrów, sekcje formularzy — wszędzie, gdzie
 * w designie występuje „karta".
 */

import React from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';

/**
 * `bar`    — `.day-log` z ekranów kokpitu: nagłówek na wyróżnionym tle, oddzielony linią.
 *            Karta jest osobnym „przyrządem", nagłówek ma być widoczny przy przewijaniu.
 * `inline` — `.section` z formularzy: mała etykieta mono jako pierwszy element treści,
 *            bez linii i bez tła. Formularz to ciąg sekcji — paski nagłówków posiekałyby
 *            go na kilkanaście pudełek.
 */
export type CardHeader = 'bar' | 'inline';

export interface CardProps extends ViewProps {
  /** Etykieta nagłówka (mono, UPPERCASE). Bez niej karta nie ma nagłówka. */
  title?: string;
  header?: CardHeader;
  /** Element po prawej stronie nagłówka (licznik, tag „opcjonalne", akcja). */
  headerRight?: React.ReactNode;
  /** Zeruje wewnętrzny padding — dla list, które same zarządzają odstępami. */
  flush?: boolean;
  contentStyle?: ViewStyle;
}

export function Card({
  title,
  header = 'bar',
  headerRight,
  flush = false,
  contentStyle,
  style,
  children,
  ...rest
}: CardProps) {
  const { theme } = useTheme();
  const { colors, spacing, radius, borderWidth } = theme;
  const inline = header === 'inline';

  const label =
    title == null ? null : (
      <View style={styles.header}>
        <AppText
          variant={inline ? 'mono' : 'label'}
          tone="muted"
          style={inline ? styles.inlineLabel : undefined}
        >
          {title}
        </AppText>
        {headerRight}
      </View>
    );

  return (
    <View
      style={[
        {
          borderRadius: inline ? radius.lg : radius.md,
          borderWidth,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        style,
      ]}
      {...rest}
    >
      {label != null && !inline && (
        <View
          style={[
            styles.header,
            {
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderBottomWidth: borderWidth,
              borderBottomColor: colors.border,
              backgroundColor: colors.surfaceRaised,
            },
          ]}
        >
          <AppText variant="label" tone="muted">
            {title}
          </AppText>
          {headerRight}
        </View>
      )}

      <View
        style={[
          flush ? undefined : { padding: inline ? spacing.lg - 2 : spacing.md, gap: spacing.md },
          contentStyle,
        ]}
      >
        {inline && label}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inlineLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
});
