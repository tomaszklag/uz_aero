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

export interface CardProps extends ViewProps {
  /** Etykieta nagłówka (mono, UPPERCASE). Bez niej karta nie ma paska nagłówka. */
  title?: string;
  /** Element po prawej stronie nagłówka (licznik, akcja). */
  headerRight?: React.ReactNode;
  /** Zeruje wewnętrzny padding — dla list, które same zarządzają odstępami. */
  flush?: boolean;
  contentStyle?: ViewStyle;
}

export function Card({
  title,
  headerRight,
  flush = false,
  contentStyle,
  style,
  children,
  ...rest
}: CardProps) {
  const { theme } = useTheme();
  const { colors, spacing, radius, borderWidth } = theme;

  return (
    <View
      style={[
        {
          borderRadius: radius.md,
          borderWidth,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        style,
      ]}
      {...rest}
    >
      {title != null && (
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
      <View style={[flush ? undefined : { padding: spacing.md }, contentStyle]}>{children}</View>
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
});
