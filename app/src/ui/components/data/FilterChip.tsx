/**
 * Ninerdeck - CICHY CHIP FILTRA (`design/21-kalendarz.html`, `.filter-chip`).
 *
 * Podpis, który i tak stoi nad osią („12 maszyn"), staje się KONTROLKĄ - nowej ikony
 * w nagłówku ekranu nie dokładamy, bo stoi tam już „+", a dwie ikony obok siebie każą
 * wybierać, zanim wiadomo, co robią.
 *
 * ══ CHIP NIE KRZYCZY ══
 * Pierwsza wersja makiety miała odwrócone zaznaczenie (białe tło) i był to najmocniejszy
 * kontrast na ekranie, mocniejszy niż zielony przycisk akcji (uwaga właściciela
 * 2026-09-19: „biały przycisk z filtrem […] strasznie rzuca się w oczy i jest za duży").
 * Wzorzec odwrócenia zostaje tam, gdzie opisuje WYBÓR W LIŚCIE - wybrany dzień, pozycja
 * kolumny w panelu - a nie kontrolkę w rogu, bo taka uczy oko pomijać ten róg.
 *
 * Sygnał zawężenia niesie SAMA LICZBA („6 z 12" kontra „12"); rozjaśnienie napisu jest
 * dodatkiem, nie komunikatem. Cel dotknięcia zbija się tu do ~26 dp i rozciąga go
 * `hitSlop` - napisu nie powiększamy, bo to przypis do nagłówka (ta sama reguła,
 * co przy plakietce „popr.", issue #43).
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';

export interface FilterChipProps {
  label: string;
  /** Filtr coś chowa - napis o stopień jaśniejszy. */
  active?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  icon?: IconName;
}

export function FilterChip({
  label,
  active = false,
  accessibilityLabel,
  onPress,
  icon = 'filter',
}: FilterChipProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const color = active ? theme.colors.textSecondary : theme.colors.textMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [s.chip, pressed && s.pressed]}
    >
      <Icon name={icon} size={12} color={color} />
      <AppText variant="mono" style={[s.label, { color }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 7,
    },
    pressed: { backgroundColor: t.colors.surfaceRaised },
    label: { fontSize: 8.5, lineHeight: 11, letterSpacing: 1, textTransform: 'uppercase' },
  });
