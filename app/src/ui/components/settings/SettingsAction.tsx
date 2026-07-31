/**
 * UZ Aero — SettingsAction (`.action-item` z mockupu 13-ustawienia)
 *
 * Wiersz akcji sekcji ustawień: ikona, nazwa, podpis, strzałka. Podpis nie jest
 * ozdobnikiem — przy zablokowanej akcji niesie POWÓD blokady (ton amber), zgodnie
 * z zasadą „nigdy cichy błąd" (§6 pkt 3); wiersz zostaje widoczny, tylko przygaszony.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { fontFamily } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface SettingsActionProps {
  icon: IconName;
  name: string;
  /** Podpis pod nazwą; przy `disabled` renderowany amber — tu mieszka powód blokady. */
  sub: string;
  disabled?: boolean;
  onPress: () => void;
}

export function SettingsAction({
  icon,
  name,
  sub,
  disabled = false,
  onPress,
}: SettingsActionProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfaceHover : theme.colors.surfaceRaised,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <Icon name={icon} size={16} color={disabled ? theme.colors.textMuted : theme.colors.textSecondary} />
      <View style={styles.body}>
        <AppText variant="body" style={styles.name}>
          {name}
        </AppText>
        <AppText variant="mono" tone={disabled ? 'amber' : 'muted'} style={styles.sub}>
          {sub}
        </AppText>
      </View>
      <Icon name="more" size={14} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 13, fontFamily: fontFamily.bodySemiBold },
  sub: { fontSize: 9, letterSpacing: 0.5 },
});
