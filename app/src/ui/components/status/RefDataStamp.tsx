/**
 * UZ Aero - RefDataStamp (`.ref-sync` z mockupów 01 i 13)
 *
 * Stempel cache referencyjnego (§4.8): kropka stanu + „Dane referencyjne · sync HH:MM
 * UTC" albo uczciwe „jeszcze bez synca". Jeden byt na splashu i w ustawieniach -
 * kopiowanie ternary'ego per ekran rozjechałoby brzmienie przy pierwszej zmianie.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { timeUtc } from '../../format';

export interface RefDataStampProps {
  /** Chwila ostatniego potwierdzenia cache (`reference.checkedAt`); null = nigdy. */
  checkedAt: number | null;
  style?: ViewStyle;
}

export function RefDataStamp({ checkedAt, style }: RefDataStampProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.row, style]}>
      <View
        style={[
          styles.dot,
          { backgroundColor: checkedAt != null ? theme.colors.green : theme.colors.amber },
        ]}
      />
      <AppText variant="mono" tone="secondary" style={styles.text}>
        {checkedAt != null
          ? `Dane referencyjne · sync ${timeUtc(checkedAt)} UTC`
          : 'Dane referencyjne · jeszcze bez synca'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
});
