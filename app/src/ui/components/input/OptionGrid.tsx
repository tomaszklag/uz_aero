/**
 * UZ Aero — OptionGrid (`.op-grid` z mockupu 02)
 *
 * Siatka kart z ikonami — obowiązkowa forma wyboru rodzaju operacji. `CLAUDE.md` mówi
 * wprost: *Rodzaj operacji — siatka kart z ikonami, NIE select*. Powód jest praktyczny:
 * operacja jest wybierana raz dziennie, opcji jest pięć i wszystkie mieszczą się na ekranie,
 * więc ukrywanie ich za rozwijaną listą tylko dokłada tapnięcie.
 *
 * Różnica wobec `CardPicker`: tam pozycje mają zmienną, długą treść (samolot z typem,
 * blokadą PIC, podglądem) i muszą być pełnej szerokości. Tu opcje są krótkie, stałe
 * i rozpoznawalne po ikonie — dwie kolumny są czytelniejsze i krótsze do przewijania.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors } from './tone';

export interface GridOption<T extends string> {
  value: T;
  label: string;
  icon: IconName;
}

export interface OptionGridProps<T extends string> {
  options: GridOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  style?: ViewStyle;
}

export function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  style,
}: OptionGridProps<T>) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');

  return (
    <View style={[styles.grid, style]}>
      {options.map((opt) => {
        const selected = opt.value === value;

        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.cell,
              {
                gap: theme.spacing.sm,
                padding: theme.spacing.sm + 2,
                borderRadius: theme.radius.sm,
                borderWidth: theme.borderWidth,
                borderColor: selected ? green.border : theme.colors.border,
                backgroundColor: selected ? green.muted : theme.colors.surfaceRaised,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.iconBox,
                {
                  borderRadius: 7,
                  borderWidth: theme.borderWidth,
                  borderColor: selected ? green.border : theme.colors.border,
                  backgroundColor: selected ? green.muted : theme.colors.surface,
                },
              ]}
            >
              <Icon
                name={opt.icon}
                size={14}
                color={selected ? green.accent : theme.colors.textMuted}
              />
            </View>

            <AppText
              variant="mono"
              numberOfLines={2}
              style={{
                flex: 1,
                fontSize: 10,
                lineHeight: 12,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: selected ? green.accent : theme.colors.textSecondary,
              }}
            >
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  // Dwie kolumny: 50% minus połowa odstępu. `minHeight` trzyma cel dotykowy dla rękawic.
  cell: { flexDirection: 'row', alignItems: 'center', width: '48.5%', minHeight: 48 },
  iconBox: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
