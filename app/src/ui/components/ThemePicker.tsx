/**
 * UZ Aero — ThemePicker
 *
 * Przełącznik 5 motywów (wzorzec: sekcja theme-picker w 05-themes.html).
 * Każdy przycisk = pill z próbką koloru + etykietą; aktywny wyróżniony.
 * Zmiana motywu przez setTheme() → cały ekran przemalowuje się na żywo.
 *
 * Próbka koloru (swatch) jest budowana z tokenów danego motywu (bg + akcent green),
 * więc nie ma tu żadnych hardcoded hex — wszystko pochodzi z pliku tokenów.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { THEME_LABELS, THEME_ORDER, THEMES } from '../theme/tokens';
import { AppText } from './AppText';

export interface ThemePickerProps {
  style?: ViewStyle;
}

export function ThemePicker({ style }: ThemePickerProps) {
  const { theme, themeName, setTheme } = useTheme();

  return (
    <View style={[styles.row, style]}>
      <AppText variant="paramLabel" tone="muted" style={styles.groupLabel}>
        Motyw
      </AppText>

      {THEME_ORDER.map((name) => {
        const active = name === themeName;
        const swatch = THEMES[name].colors;
        return (
          <Pressable
            key={name}
            onPress={() => setTheme(name)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.btn,
              {
                borderRadius: theme.radius.sm,
                borderWidth: theme.borderWidth,
                borderColor: active ? theme.colors.borderStrong : theme.colors.border,
                backgroundColor: active ? theme.colors.surfaceRaised : 'transparent',
              },
            ]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: swatch.bg, borderColor: swatch.green },
              ]}
            />
            <AppText variant="mono" tone={active ? 'primary' : 'muted'} style={styles.btnLabel}>
              {THEME_LABELS[name]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupLabel: {
    marginRight: 2,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  btnLabel: {
    fontSize: 11,
    letterSpacing: 1,
  },
});
