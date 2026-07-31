/**
 * UZ Aero — GhostAction (`.block-add` z mockupu 08)
 *
 * Dyskretna akcja w stopce karty: kreskowana linia u góry, wyśrodkowany napis mono
 * z ikoną. Celowo NIE wygląda jak przycisk — to zaproszenie („Dodaj zdarzenie ręcznie"),
 * a nie krok procedury. Pełnowymiarowy `ActionButton` w tym miejscu sugerowałby, że
 * dopisywanie ręczne jest normalną częścią przepływu, a jest ratunkiem.
 *
 * Mimo dyskrecji cel dotykowy trzyma próg: min. 44 px wysokości.
 */

import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';

export interface GhostActionProps {
  label: string;
  icon?: IconName;
  onPress: () => void;
  style?: ViewStyle;
}

export function GhostAction({ label, icon, onPress, style }: GhostActionProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          borderTopWidth: theme.borderWidth,
          borderStyle: 'dashed',
          borderTopColor: theme.colors.border,
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      {icon != null && <Icon name={icon} size={12} color={theme.colors.textMuted} />}
      <AppText variant="mono" tone="muted" style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  label: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
});
