/**
 * UZ Aero - ProfileChip (`.profile-chip` z mockupu 00)
 *
 * Karta lokalnego profilu na zamku PIN: okrągły awatar z inicjałami, nazwisko, kod.
 * Mówi pilotowi, CZYJ profil odblokowuje - na wspólnym telefonie klubowym to nie
 * ornament, tylko ochrona przed wpisaniem swojego PIN-u w cudzy profil.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { fontFamily } from '../../theme/tokens';
import { AppText } from '../foundation/AppText';
import { toneColors } from '../tone';

export interface ProfileChipProps {
  name: string;
  /** Kod pilota (TMK) - mono, pod nazwiskiem. */
  code: string;
  style?: ViewStyle;
}

export function ProfileChip({ name, code, style }: ProfileChipProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth,
          borderRadius: theme.radius.lg,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: green.muted,
            borderColor: green.border,
            borderWidth: theme.borderWidth,
          },
        ]}
      >
        <AppText variant="mono" style={[styles.initials, { color: green.accent }]}>
          {initials}
        </AppText>
      </View>
      <View style={styles.text}>
        <AppText variant="body" style={styles.name}>
          {name}
        </AppText>
        <View style={styles.subRow}>
          <View style={[styles.dot, { backgroundColor: green.accent }]} />
          <AppText variant="mono" tone="muted" style={styles.code}>
            {code}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 264,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 14, fontFamily: fontFamily.monoBold },
  text: { gap: 4 },
  name: { fontSize: 15, fontFamily: fontFamily.bodySemiBold, lineHeight: 16 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  code: { fontSize: 8.5, letterSpacing: 1.5, textTransform: 'uppercase' },
});
