/**
 * UZ Aero — SummaryStrip (`.summary-strip` z mockupu 09)
 *
 * Wąski pasek pod nagłówkiem: kilka wartości dnia rozdzielonych pionowymi kreskami.
 *
 * Stoi POZA obszarem przewijania, bo na ekranie zakończenia dnia pilot wpisuje odczyty
 * końcowe i musi mieć bilans dnia przed oczami przez cały czas — inaczej sprawdzenie
 * „czy te 6:39 się zgadza" wymagałoby przewijania w górę i z powrotem.
 *
 * Czym różni się od `SummaryGrid`: tam sześć pozycji w dwóch kolumnach, do czytania.
 * Tu cztery liczby w jednej linii, do zerkania.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface SummaryStripItem {
  value: string;
  label: string;
  tone?: Tone;
}

export interface SummaryStripProps {
  items: SummaryStripItem[];
  style?: ViewStyle;
}

export function SummaryStrip({ items, style }: SummaryStripProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.strip,
        {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderBottomWidth: theme.borderWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceRaised,
        },
        style,
      ]}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 && (
            <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          )}
          <View style={styles.item}>
            <AppText
              variant="display"
              numberOfLines={1}
              style={[
                styles.value,
                {
                  color:
                    item.tone == null
                      ? theme.colors.textPrimary
                      : toneColors(theme, item.tone).accent,
                },
              ]}
            >
              {item.value}
            </AppText>
            <AppText variant="mono" tone="muted" style={styles.label}>
              {item.label}
            </AppText>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: { alignItems: 'center', gap: 3, flexShrink: 1 },
  value: { fontSize: 17, lineHeight: 19, letterSpacing: 1 },
  label: { fontSize: 7, letterSpacing: 1, textTransform: 'uppercase' },
  separator: { width: 1, height: 28 },
});
