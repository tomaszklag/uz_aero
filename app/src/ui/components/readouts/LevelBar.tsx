/**
 * UZ Aero - LevelBar (pasek poziomu z mockupu 02a)
 *
 * Wąski pasek pokazujący wypełnienie w stosunku do pojemności - przy paliwie i oleju
 * stoi pod wartością i odpowiada na pytanie „dużo to czy mało", którego same litry nie
 * rozstrzygają (150 L to pełny zbiornik w Cessnie i ćwiartka w An-2). Olej dokłada
 * znacznik minimum (`markerRatio`) - patrz nota przy propie.
 *
 * Nie jest kontrolką - wartość zmienia się przez `Stepper` albo arkusz odczytu.
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
  /**
   * Pozycja znacznika progu (0–1) - pionowa kreska na pasku, np. minimum oleju przed
   * lotem (uwaga z urządzenia, 2026-09-02: „zamiast pisać min pokaż podziałkę ze
   * znacznikiem"). Bursztynowa niezależnie od tonu wypełnienia: to granica ostrzeżenia,
   * nie część poziomu. `null`/brak = pasek bez znacznika, jak przy paliwie.
   */
  markerRatio?: number | null;
  width?: number;
  style?: ViewStyle;
}

export function LevelBar({ ratio, tone = 'amber', markerRatio = null, width = 130, style }: LevelBarProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const marker =
    markerRatio != null && Number.isFinite(markerRatio)
      ? Math.max(0, Math.min(1, markerRatio))
      : null;

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
      {marker != null && (
        <View
          style={{
            position: 'absolute',
            left: `${marker * 100}%`,
            top: 0,
            bottom: 0,
            width: 2,
            marginLeft: -1,
            backgroundColor: toneColors(theme, 'amber').accent,
          }}
        />
      )}
    </View>
  );
}
