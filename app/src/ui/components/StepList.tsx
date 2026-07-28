/**
 * UZ Aero — StepList (`.handover-steps` z mockupu 07)
 *
 * Numerowana lista kroków procedury: kółko z numerem + zdanie. Fragmenty wymagające
 * uwagi (`emphasis`) są rozjaśnione — odpowiednik pogrubień z mockupu.
 *
 * Używana tam, gdzie aplikacja NIE prowadzi pilota za rękę, bo procedura wychodzi poza
 * ten telefon (przekazanie samolotu dzieje się na dwóch urządzeniach). Skoro nie możemy
 * poprowadzić — musimy przynajmniej dokładnie opisać drogę.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tone';

export interface StepListItem {
  /** Fragmenty zdania; te z `emphasis` renderują się kolorem tekstu głównego. */
  parts: { text: string; emphasis?: boolean }[];
}

export interface StepListProps {
  steps: StepListItem[];
  /** Ton numerków — amber dla procedur „uwaga, to kończy sesję". */
  tone?: Tone;
  style?: ViewStyle;
}

export function StepList({ steps, tone = 'amber', style }: StepListProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View style={[styles.list, style]}>
      {steps.map((step, index) => (
        <View key={index} style={styles.step}>
          <View
            style={[
              styles.num,
              {
                borderWidth: theme.borderWidth,
                borderColor: c.border,
                backgroundColor: c.muted,
              },
            ]}
          >
            <AppText variant="mono" style={[styles.numLabel, { color: c.accent }]}>
              {index + 1}
            </AppText>
          </View>

          <AppText variant="body" tone="secondary" style={styles.text}>
            {step.parts.map((part, i) => (
              <AppText
                key={i}
                variant="body"
                tone={part.emphasis === true ? 'primary' : 'secondary'}
                style={styles.text}
              >
                {part.text}
              </AppText>
            ))}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 7 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  num: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  numLabel: { fontSize: 9, lineHeight: 12 },
  text: { flex: 1, fontSize: 11, lineHeight: 17 },
});
