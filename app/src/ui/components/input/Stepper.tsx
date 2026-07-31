/**
 * UZ Aero — Stepper
 *
 * Wprowadzanie wartości liczbowej przyciskami ±, nie suwakiem.
 *
 * Dlaczego nie suwak: audyt użyteczności wykazał, że dolewka paliwa była ustawiana
 * uchwytem 16×16 px na torze 312 px — około **1,4 litra na piksel** przeciągnięcia.
 * W rękawicach, na słońcu, przy pracującym silniku to nie jest precyzja, tylko loteria.
 * Stepper daje dokładność co do kroku i cele dotykowe 46 px.
 *
 * Używany do odczytów paliwa i motogodzin (02a, 09), liczby skoczków (05e) oraz korekty
 * czasu zdarzenia (04c, 05f).
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tone';

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  /** Krok podstawowy (przyciski ±). */
  step?: number;
  /** Krok przyspieszony — drugi rząd przycisków (np. ±10 L). Brak = jeden rząd. */
  bigStep?: number;
  min?: number;
  max?: number;
  /** Jak sformatować wartość (np. litry, MH w hh:mm, czas UTC). */
  format?: (value: number) => string;
  /** Podpis pod wartością (np. „maks. 218 L do pełna"). */
  hint?: string;
  unit?: string;
  tone?: Tone;
  style?: ViewStyle;
}

export function Stepper({
  value,
  onChange,
  step = 1,
  bigStep,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  format,
  hint,
  unit,
  tone = 'amber',
  style,
}: StepperProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  const bump = useCallback(
    (delta: number) => {
      const next = Math.min(max, Math.max(min, value + delta));
      if (next !== value) onChange(next);
    },
    [max, min, onChange, value],
  );

  const Button = ({ delta, label }: { delta: number; label: string }) => {
    const disabled = value + delta > max || value + delta < min;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${delta > 0 ? 'Zwiększ' : 'Zmniejsz'} o ${Math.abs(delta)}`}
        disabled={disabled}
        onPress={() => bump(delta)}
        style={({ pressed }) => [
          styles.btn,
          {
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth,
            borderColor: theme.colors.borderStrong,
            backgroundColor: pressed ? c.muted : theme.colors.surfaceRaised,
            opacity: disabled ? 0.35 : 1,
          },
        ]}
      >
        <AppText variant="mono" tone={disabled ? 'muted' : 'primary'}>
          {label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View style={[{ gap: theme.spacing.sm }, style]}>
      <View
        style={[
          styles.row,
          {
            gap: theme.spacing.sm,
            padding: theme.spacing.sm,
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth,
            borderColor: c.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Button delta={-step} label={`−${step}`} />

        <View style={styles.value}>
          <AppText variant="param" style={{ color: c.accent }}>
            {format ? format(value) : String(value)}
          </AppText>
          {unit != null && (
            <AppText variant="label" tone="secondary">
              {unit}
            </AppText>
          )}
        </View>

        <Button delta={step} label={`+${step}`} />
      </View>

      {bigStep != null && (
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <Button delta={-bigStep} label={`−${bigStep}`} />
          <View style={{ flex: 1 }} />
          <Button delta={bigStep} label={`+${bigStep}`} />
        </View>
      )}

      {hint != null && (
        <AppText variant="label" tone="muted">
          {hint}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // 46 px — próg celu dotykowego dla rękawic (audyt ergonomii).
  btn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  value: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
});
