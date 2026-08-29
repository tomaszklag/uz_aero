/**
 * UZ Aero - ThemePicker
 *
 * Przełącznik 5 motywów (wzorzec: sekcja theme-picker w 05-themes.html).
 * Każdy przycisk = pill z próbką koloru + etykietą; aktywny wyróżniony.
 * Zmiana motywu przez setTheme() → cały ekran przemalowuje się na żywo.
 *
 * Próbka koloru (swatch) jest budowana z tokenów danego motywu (bg + akcent green),
 * więc nie ma tu żadnych hardcoded hex - wszystko pochodzi z pliku tokenów.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { THEME_LABELS, THEME_ORDER, THEMES, fontFamily } from '../../theme/tokens';
import { AppText } from '../foundation/AppText';

/** Opisy motywów z mockupu 13 (`.theme-desc`) - kiedy który ma sens w kokpicie. */
const THEME_DESC: Record<string, string> = {
  night: 'ciemny · domyślny · kokpit po zmroku',
  paper: 'ciepła biel · mniej odblasków za dnia',
  solar: 'maksymalny kontrast · ostre słońce',
  sky: 'jasny błękitno-szary · day mode awioniki',
  amber: 'bursztyn na czerni · klasyczny kokpit / NVG',
};

export interface ThemePickerProps {
  /**
   * `detailed` - karty z opisem i podwójnym swatchem (mockup 13 `.theme-card`);
   * domyślnie kompaktowe pigułki (katalog DS / StyleGuide).
   */
  detailed?: boolean;
  style?: ViewStyle;
}

export function ThemePicker({ detailed = false, style }: ThemePickerProps) {
  const { theme, themeName, setTheme } = useTheme();

  if (detailed) {
    return (
      <View style={[styles.cards, style]}>
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
                styles.card,
                {
                  borderRadius: theme.radius.md,
                  borderWidth: theme.borderWidth,
                  borderColor: active ? theme.colors.greenBorder : theme.colors.border,
                  backgroundColor: active ? theme.colors.greenMuted : theme.colors.surface,
                },
              ]}
            >
              {/* Podwójny swatch (tło + akcent) - kolory INNEGO motywu z jego tokenów. */}
              <View style={styles.swatchPair}>
                <View style={[styles.swatchHalf, { backgroundColor: swatch.bg, borderColor: theme.colors.borderStrong, borderWidth: theme.borderWidth }]} />
                <View style={[styles.swatchHalf, { backgroundColor: swatch.green, borderColor: theme.colors.borderStrong, borderWidth: theme.borderWidth }]} />
              </View>
              <View style={styles.cardBody}>
                <AppText variant="body" style={styles.cardName}>
                  {THEME_LABELS[name]}
                </AppText>
                <AppText variant="mono" tone="muted" style={styles.cardDesc}>
                  {THEME_DESC[name] ?? ''}
                </AppText>
              </View>
              {active && (
                <AppText variant="mono" style={[styles.cardTag, { color: theme.colors.green }]}>
                  aktywny
                </AppText>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

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
  cards: { gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  swatchPair: { flexDirection: 'row', gap: 3 },
  swatchHalf: { width: 16, height: 16, borderRadius: 5 },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 13, fontFamily: fontFamily.bodySemiBold },
  cardDesc: { fontSize: 9, letterSpacing: 0.5 },
  cardTag: { fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
});
