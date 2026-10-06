/**
 * Ninerdeck - DaySeparator (`.day-sep` z makiet 29, 29A, 29B): granica doby w rozmowie.
 *
 * „Wczoraj", „Dziś", dalej data - doba klubu, nie telefonu. Linie po obu stronach napisu
 * mówią „tu zaczyna się inny dzień" bez przerywania rytmu dymków.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';

export function DaySeparator({ label }: { label: string }) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.row} accessibilityRole="header">
      <View style={s.line} />
      <AppText variant="mono" style={s.label}>
        {label}
      </AppText>
      <View style={s.line} />
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 4 },
    line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border },
    label: { fontSize: 8.5, lineHeight: 12, letterSpacing: 2, textTransform: 'uppercase', color: t.colors.textMuted },
  });
