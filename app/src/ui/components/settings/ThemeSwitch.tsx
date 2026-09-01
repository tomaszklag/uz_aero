/**
 * UZ Aero - ThemeSwitch (sekcja „Motyw wyświetlacza" na 13, issue #72)
 *
 * Przełącznik JASNOŚCI: ciemny ↔ jasny. Zastąpił `ThemePicker` - listę pięciu kart
 * z nazwami palet („Night", „Paper", „Solar", „Sky", „Amber") i opisami, kiedy która
 * ma sens. Pięć wariantów było wyborem, którego pilot nie ma po co dokonywać: pyta
 * „widzę czy nie widzę ekranu", a nie „która biel". Zostały dwa motywy i jedno pytanie.
 *
 * DWIE POZYCJE OBOK SIEBIE, nie suwak: suwak pokazuje stan bieżący i każe zgadywać,
 * co się stanie po przesunięciu, a tu obie odpowiedzi mają być widoczne naraz - ta sama
 * reguła, przez którą w całej aplikacji zamiast selecta stoją karty (`CLAUDE.md`).
 * Wybrana pozycja jest zielona, jak każdy wybór w tej aplikacji.
 *
 * Zmiana przemalowuje ekran od razu (`setTheme` → cały drzewo komponentów) i zapisuje
 * się w profilu pilota; wysyłką zajmie się pętla okazji - zmiana motywu NIGDY nie czeka
 * na sieć.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { THEME_LABELS, THEME_ORDER, THEMES, fontFamily } from '../../theme/tokens';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface ThemeSwitchProps {
  style?: ViewStyle;
}

export function ThemeSwitch({ style }: ThemeSwitchProps) {
  const { theme, themeName, setTheme } = useTheme();

  return (
    <View style={[styles.row, style]}>
      {THEME_ORDER.map((name) => {
        const active = name === themeName;
        return (
          <Pressable
            key={name}
            onPress={() => setTheme(name)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.half,
              {
                borderRadius: theme.radius.md,
                borderWidth: active ? theme.borderWidthStrong : theme.borderWidth,
                borderColor: active ? theme.colors.greenBorder : theme.colors.border,
                backgroundColor: active
                  ? theme.colors.greenMuted
                  : pressed
                    ? theme.colors.surfaceHover
                    : theme.colors.surface,
              },
            ]}
          >
            <Icon
              name={THEMES[name].isLight ? 'theme-light' : 'theme-dark'}
              size={16}
              color={active ? theme.colors.green : theme.colors.textMuted}
            />
            <AppText variant="body" tone={active ? 'primary' : 'muted'} style={styles.label}>
              {THEME_LABELS[name]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  half: {
    // Połowa szerokości każda; cel dotykowy 52 px - ta sama wysokość, co wiersz akcji
    // ustawień obok (rękawice).
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  label: { fontSize: 13, fontFamily: fontFamily.bodySemiBold },
});
