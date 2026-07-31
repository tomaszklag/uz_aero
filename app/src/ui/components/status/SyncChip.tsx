/**
 * UZ Aero — SyncChip
 *
 * Jedyny globalny wskaźnik łączności (offline-first, docs/_main.md.txt §4.3, §6):
 *   - synced  → "SYNC"        (zielony pill)
 *   - offline → "OFFLINE · n" (amber pill, n = liczba zdarzeń w outboksie)
 *
 * Wzorzec z mockupów (.sync-chip): pill, kropka-wskaźnik, tekst mono UPPERCASE.
 * Ikona zrealizowana jako kropka (spójna z językiem wizualnym designu — kropki
 * statusu są używane w całych mockupach); docelowo można podmienić na SVG.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../foundation/AppText';

export type SyncStatus = 'synced' | 'offline';

export interface SyncChipProps {
  status: SyncStatus;
  /** Liczba zdarzeń w outboksie — renderowana jako "OFFLINE · n" (tylko dla offline). */
  outboxCount?: number;
  style?: ViewStyle;
}

export function SyncChip({ status, outboxCount, style }: SyncChipProps) {
  const { theme } = useTheme();
  const synced = status === 'synced';

  const accent = synced ? theme.colors.green : theme.colors.amber;
  const background = synced ? theme.colors.greenMuted : theme.colors.amberMuted;
  const borderColor = synced ? theme.colors.greenBorder : theme.colors.amberBorder;

  const label = synced
    ? 'SYNC'
    : outboxCount != null
      ? `OFFLINE · ${outboxCount}`
      : 'OFFLINE';

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={synced ? 'Zsynchronizowano' : `Offline, ${outboxCount ?? 0} w kolejce`}
      style={[
        styles.chip,
        {
          backgroundColor: background,
          borderColor,
          borderWidth: theme.borderWidth,
          borderRadius: theme.radius.pill,
        },
        style,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <AppText variant="mono" style={[styles.label, { color: accent, fontFamily: theme.fontFamily.monoMedium }]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
