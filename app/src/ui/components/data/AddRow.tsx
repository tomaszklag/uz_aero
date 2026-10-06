/**
 * Ninerdeck - AddRow (`.add-row` z makiety 31B; zlecenia 4.0.0).
 *
 * Wejście w dopisanie: przerywana ramka, PLUS w kwadracie i szewron - „Dodaj adresatów",
 * „Wybierz osobę". Plus, nie ołówek: ołówek obiecuje poprawienie istniejącej wartości,
 * a to jest dopisanie (reguła z issue #43). Wiersz jest kontrolką, na której widać brak
 * adresatów - przycisk wysyłki blokuje się wtedy bez zdania (issue #55).
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface AddRowProps {
  label: string;
  onPress: () => void;
}

export function AddRow({ label, onPress }: AddRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
    >
      <View style={s.icon}>
        <Icon name="add" size={14} color={theme.colors.textSecondary} />
      </View>
      <AppText variant="body" style={s.label}>
        {label}
      </AppText>
      <Icon name="more" size={15} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
      paddingVertical: 6,
      paddingLeft: 8,
      paddingRight: 10,
      borderRadius: 12,
      borderWidth: t.borderWidth,
      borderStyle: 'dashed',
      borderColor: t.colors.borderStrong,
    },
    pressed: { borderColor: t.colors.greenBorder },
    icon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceRaised,
    },
    label: { flex: 1, fontFamily: t.fontFamily.bodySemiBold, fontSize: 13, lineHeight: 17, color: t.colors.textSecondary },
  });
