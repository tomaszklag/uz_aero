/**
 * UZ Aero — QueueBox (`.queue-box` z mockupu 11a / `.offline-queue` z 11)
 *
 * Kolejka outboxa na ekranie synchronizacji. Dwa stany z designu:
 *  • `active`   — coś czeka: pełny amber, główny licznik + zapewnienie „nic nie ginie"
 *                 (i przypomnienie o blokadzie wylogowania — §3.0);
 *  • nieaktywny — kolejka pusta: ta sama karta przygaszona do 30% — obecność pudełka
 *                 mówi „taki mechanizm istnieje", przygaszenie — „nie dotyczy cię teraz".
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface QueueBoxProps {
  /** Kolejka niepusta — pełny amber zamiast przygaszenia. */
  active: boolean;
  /** Główna linia („12 zdarzeń czeka na wysyłkę"). */
  main: string;
  /** Druga linia — tylko w stanie aktywnym („Zapisane lokalnie · nic nie ginie…"). */
  sub?: string | null;
  style?: ViewStyle;
}

export function QueueBox({ active, main, sub, style }: QueueBoxProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: active ? colors.amberMuted : colors.surface,
          borderColor: active ? colors.amberBorder : colors.border,
          borderWidth: theme.borderWidth,
          borderRadius: theme.radius.md,
          opacity: active ? 1 : 0.35,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: active ? colors.surface : colors.amberMuted,
            borderColor: colors.amberBorder,
            borderWidth: theme.borderWidth,
            borderRadius: 9,
          },
        ]}
      >
        <Icon name={active ? 'sync' : 'info'} size={15} color={colors.amber} />
      </View>

      <View style={styles.text}>
        <AppText variant="mono" style={[styles.main, { color: colors.amber }]}>
          {main}
        </AppText>
        {active && sub != null && (
          <AppText variant="mono" tone="muted" style={styles.sub}>
            {sub}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  icon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  main: { fontSize: 11, letterSpacing: 0.5 },
  sub: { fontSize: 9, letterSpacing: 0.5 },
});
