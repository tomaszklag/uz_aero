/**
 * Ninerdeck - PathSteps (`.step` z makiet 23B–23E, 3.1.0, epik R-I).
 *
 * Kroki ścieżki akceptacji na karcie rezerwacji: znacznik w tonie stanu, nazwa kroku
 * i chwila po prawej. Nazwisk NIE MA (§9.4): krok bywa obsadzony przez kilka osób
 * i rozstrzyga pierwsza - ekran mówi, ILE kroków zostało i KTÓRY trzyma sprawę.
 * Krok, o który nikt nie zapytał, blednie („nie zaczął") - to zapis, nie zarzut.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import type { PathStepVm } from '../../screens/logic/bookingApproval';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';

export interface PathStepsProps {
  steps: readonly PathStepVm[];
}

export function PathSteps({ steps }: PathStepsProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View>
      {steps.map((step, i) => (
        <View key={step.id} style={[s.step, i < steps.length - 1 && s.stepDivider]}>
          <Mark mark={step.mark} theme={theme} />
          <AppText variant="body" style={[s.name, step.mark === 'idle' && s.nameIdle]}>
            {step.label}
          </AppText>
          <AppText variant="mono" style={s.when}>
            {step.when}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function Mark({ mark, theme }: { mark: PathStepVm['mark']; theme: Theme }) {
  const s = styles(theme);
  const c =
    mark === 'ok'
      ? toneColors(theme, 'green')
      : mark === 'now'
        ? toneColors(theme, 'amber')
        : mark === 'no'
          ? toneColors(theme, 'red')
          : null;
  const box = [
    s.mark,
    c == null
      ? { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceRaised }
      : { borderColor: c.border, backgroundColor: c.muted },
  ];
  const color = c?.accent ?? theme.colors.textMuted;

  if (mark === 'ok') {
    return (
      <View style={box}>
        <Icon name="check" size={11} color={color} />
      </View>
    );
  }
  if (mark === 'no') {
    return (
      <View style={box}>
        <Icon name="clear" size={11} color={color} />
      </View>
    );
  }
  // Krok bieżący i krok jeszcze nie pytany: trzy kropki (makieta) - „w toku" bez zegara.
  return (
    <View style={box}>
      <View style={s.dots}>
        {[0, 1, 2].map((k) => (
          <View key={k} style={[s.dot, { backgroundColor: color }]} />
        ))}
      </View>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 13 },
    stepDivider: { borderBottomWidth: t.borderWidth, borderBottomColor: t.colors.border },
    mark: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      flexShrink: 0,
    },
    dots: { flexDirection: 'row', gap: 2 },
    dot: { width: 2.5, height: 2.5, borderRadius: 1.25 },
    name: { flex: 1, fontSize: 12.5, lineHeight: 17, color: t.colors.textPrimary },
    nameIdle: { color: t.colors.textSecondary },
    when: { fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.colors.textMuted },
  });
