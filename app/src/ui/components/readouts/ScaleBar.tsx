/**
 * UZ Aero — ScaleBar (pasek poziomu z PODZIAŁKĄ, mockup 06)
 *
 * `LevelBar` odpowiada na pytanie „dużo to czy mało" jednym spojrzeniem. Gdy pasek idzie
 * przez całą szerokość karty, samo wypełnienie przestaje wystarczać — trzeba wiedzieć,
 * do czego się odnosi. Stąd podpisy pod paskiem: w `.fob-bar-labels` są dwa („0 L" ↔
 * „pojemność: 330 L"), w `.slider-labels` pięć (ćwiartki dolewki).
 *
 * Świadomie NIE jest kontrolką. W mockupie ten sam kształt niósł uchwyt suwaka; audyt
 * użyteczności go odrzucił (≈1,4 litra na piksel w rękawicach — patrz `Stepper`), więc
 * wartość ustawia `Stepper`, a pasek został **wyłącznie wskaźnikiem**: pokazuje, gdzie
 * na skali jest to, co pilot właśnie wpisał.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { LevelBar } from './LevelBar';
import type { Tone } from '../tone';

export interface ScaleBarProps {
  /** Wypełnienie 0–1 (przycinane przez `LevelBar`). */
  ratio: number;
  tone?: Tone;
  /**
   * Podpisy podziałki, od lewej do prawej. Skrajne trzymają się krawędzi paska —
   * tak jak `justify-content: space-between` w mockupie.
   */
  scale?: string[];
  /** Grubość paska: 6 px przy kontrolce, 8 px w karcie-przyrządzie (`.fob-bar`). */
  height?: number;
  style?: ViewStyle;
}

export function ScaleBar({ ratio, tone = 'amber', scale = [], height = 6, style }: ScaleBarProps) {
  const { theme } = useTheme();

  return (
    <View style={[{ width: '100%', gap: 5 }, style]}>
      <LevelBar
        ratio={ratio}
        tone={tone}
        style={{ width: '100%', height, borderRadius: height / 2 }}
      />

      {scale.length > 0 && (
        <View style={styles.labels}>
          {scale.map((label, i) => (
            <AppText
              // Podpisy podziałki bywają identyczne (np. dwa „0 L" przy pustym baku),
              // więc kluczem jest pozycja — to ona, a nie treść, definiuje element.
              key={`${i}-${label}`}
              variant="mono"
              tone="muted"
              style={[styles.label, { color: theme.colors.textMuted }]}
            >
              {label}
            </AppText>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  label: { fontSize: 9, letterSpacing: 0.5, lineHeight: 12 },
});
