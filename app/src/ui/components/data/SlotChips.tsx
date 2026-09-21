/**
 * Ninerdeck - SUGEROWANE GODZINY (`design/22`, `.slots`).
 *
 * Trzy-cztery kafelki NAD kontrolką czasu, a nie lista, z której trzeba wybrać: pilot
 * może ustawić dowolny wolny termin, a sugestia ma mu tylko oszczędzić szukania.
 * Dlatego sekcja po prostu znika, gdy nie ma czego zaproponować - pusta mówiłaby,
 * że wyboru nie ma.
 *
 * Każdy kafelek niesie POWÓD. Bez niego sugestia wygląda na wyrocznię, a pilot nie
 * ma jak ocenić, czy godzina, którą mu podsunięto, jest tą, o którą mu chodziło.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { SlotChipVm } from '../../screens/logic/slotChips';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';

export interface SlotChipsProps {
  chips: readonly SlotChipVm[];
  onSelect: (startsAt: number, endsAt: number) => void;
}

export function SlotChips({ chips, onSelect }: SlotChipsProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.list}>
      {chips.map((chip) => (
        <Pressable
          key={`${chip.startsAt}-${chip.endsAt}`}
          style={[s.chip, chip.selected && s.chipOn]}
          onPress={() => onSelect(chip.startsAt, chip.endsAt)}
          accessibilityRole="button"
          accessibilityState={{ selected: chip.selected }}
        >
          <AppText variant="mono" style={[s.hours, chip.selected && s.hoursOn]}>
            {chip.hours}
          </AppText>
          <AppText variant="mono" style={s.why} numberOfLines={1}>
            {chip.why}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    list: { gap: 6 },
    chip: {
      minHeight: 46,
      justifyContent: 'center',
      gap: 2,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    // Zieleń, bo to jest propozycja DO WZIĘCIA - stan w normie i akcja w jednym.
    chipOn: { borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenMuted },
    hours: { fontSize: 13, lineHeight: 16, letterSpacing: 1, color: t.colors.textPrimary },
    hoursOn: { color: t.colors.green },
    why: { fontSize: 8.5, lineHeight: 11, letterSpacing: 0.5, color: t.colors.textMuted },
  });
