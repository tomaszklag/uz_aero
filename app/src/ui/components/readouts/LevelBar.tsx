/**
 * UZ Aero — LevelBar (pasek poziomu z mockupu 02a)
 *
 * Wąski pasek pokazujący wypełnienie w stosunku do pojemności — przy paliwie stoi
 * pod wartością i odpowiada na pytanie „dużo to czy mało", którego same litry nie
 * rozstrzygają (150 L to pełny zbiornik w Cessnie i ćwiartka w An-2).
 *
 * Nie jest kontrolką — wartość zmienia się przez `Stepper` albo arkusz odczytu.
 * Suwak w tym miejscu przegrał audyt użyteczności (rękawice), więc pasek jest
 * świadomie **tylko wskaźnikiem**.
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { toneColors, type Tone } from '../tone';

export interface LevelBarProps {
  /** Wypełnienie 0–1; wartości spoza zakresu przycinamy. */
  ratio: number;
  tone?: Tone;
  width?: number;
  style?: ViewStyle;
}

export function LevelBar({ ratio, tone = 'amber', width = 130, style }: LevelBarProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height: 6,
          borderRadius: 3,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: theme.colors.surfaceRaised,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: c.accent,
        }}
      />
    </View>
  );
}
