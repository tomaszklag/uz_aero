/**
 * UZ Aero - CounterRow (`.type-row` z mockupu 05e)
 *
 * Wiersz licznika: nazwa z podpowiedzią po lewej, para przycisków −/+ z wartością po prawej.
 *
 * Powstał dla liczby skoczków w wyniesieniu i to on dyktuje rozmiary: przyciski **46 px**,
 * bo pilot ustawia je w rękawicach, w kabinie, przy pracującym silniku. To ten sam wniosek
 * z audytu użyteczności, który wcześniej wyrzucił suwaki z odczytów paliwa.
 *
 * Różnica wobec `Stepper`: tam wartość jest ciągła i ma jednostkę, więc komponent zna
 * duży krok, zakres i formatowanie. Tu liczymy sztuki - krok zawsze wynosi 1, a wartości
 * poniżej zera nie ma sensu wpisywać.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface CounterRowProps {
  label: string;
  /** Podpowiedź pod nazwą - kogo dotyczy ta pozycja („z instruktorem"). */
  hint?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  tone?: Tone;
  style?: ViewStyle;
}

export function CounterRow({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 99,
  tone = 'blue',
  style,
}: CounterRowProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  const bump = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  };

  return (
    <View
      style={[
        styles.row,
        {
          paddingHorizontal: 11,
          paddingVertical: 9,
          // Mockup 05e daje `.type-row` promień 13 - znormalizowany do kanonu
          // `radius.btn`; dryf 13/14 ubity celowo, wzorem `colors.overlay`.
          borderRadius: theme.radius.btn,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      <View style={styles.name}>
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
        {hint != null && (
          <AppText variant="mono" tone="muted" style={styles.hint}>
            {hint}
          </AppText>
        )}
      </View>

      <View style={styles.stepper}>
        <StepButton label="−" onPress={() => bump(-1)} disabled={value <= min} tone={c} />
        <AppText variant="display" style={[styles.value, { color: theme.colors.textPrimary }]}>
          {value}
        </AppText>
        <StepButton label="+" onPress={() => bump(1)} disabled={value >= max} tone={c} />
      </View>
    </View>
  );
}

function StepButton({
  label,
  onPress,
  disabled,
  tone,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  tone: { accent: string; muted: string; border: string };
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Zwiększ' : 'Zmniejsz'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          // Mockup 05e: `.step-btn` też ma 13 - znormalizowane do `radius.btn` jak wiersz wyżej.
          borderRadius: theme.radius.btn,
          borderWidth: theme.borderWidth,
          borderColor: pressed ? tone.border : theme.colors.borderStrong,
          backgroundColor: pressed ? tone.muted : theme.colors.surfaceRaised,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <AppText variant="display" style={[styles.buttonLabel, { color: theme.colors.textPrimary }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, gap: 2 },
  label: { fontSize: 14, letterSpacing: 0.5 },
  hint: { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // 46 px - próg dla rękawic; ten sam co w `Stepper`.
  button: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  buttonLabel: { fontSize: 26, lineHeight: 28 },
  value: { minWidth: 28, fontSize: 24, lineHeight: 26, textAlign: 'center' },
});
