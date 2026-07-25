/**
 * UZ Aero — PhaseHero
 *
 * Główny widget kokpitu w locie (docs/design-notes „Cockpit Running"): faza lotu
 * ogromną czcionką display, pod nią jedna linia kontekstu (np. prędkość pionowa).
 *
 * Dlaczego faza dominuje, a block time jest zdegradowany do chipa: w powietrzu pilot
 * potrzebuje jednego spojrzenia, żeby wiedzieć, w jakim stanie jest lot — nie odczytu
 * sześciu liczb. Kolor niesie znaczenie: air = niebieski, ziemia/aktywne = zielony,
 * uwaga = amber.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tone';

export interface PhaseHeroProps {
  /** Nazwa fazy: Taxi, Takeoff, Climb, Cruise, Descent, Landing, Engine Idle. */
  phase: string;
  /** Linia pod fazą — kontekst, nie ozdobnik (np. „+1 200 FT/MIN"). */
  detail?: string;
  tone?: Tone;
  /** Chip po prawej (np. block time) — drugorzędny wobec fazy. */
  aside?: React.ReactNode;
  style?: ViewStyle;
}

export function PhaseHero({ phase, detail, tone = 'blue', aside, style }: PhaseHeroProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View style={[styles.wrap, { padding: theme.spacing.md, gap: theme.spacing.xs }, style]}>
      <View style={styles.top}>
        <AppText
          variant="display"
          accessibilityRole="header"
          style={[styles.phase, { color: c.accent }]}
        >
          {phase.toUpperCase()}
        </AppText>
        {aside}
      </View>
      {detail != null && (
        <AppText variant="label" tone="muted">
          {detail}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Faza ma dominować — stąd skok ponad rozmiar wariantu `display`.
  phase: { fontSize: 48, lineHeight: 52, letterSpacing: 4 },
});
