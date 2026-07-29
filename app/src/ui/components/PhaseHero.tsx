/**
 * UZ Aero — PhaseHero (`.phase-hero` z mockupu 05)
 *
 * Główny display kokpitu w locie: kwadratowa plakietka z sylwetką samolotu i obok niej
 * nazwa fazy ogromną czcionką (54 px / ls 6) z jedną linią kontekstu pod spodem.
 *
 * Dlaczego faza dominuje nad wszystkim innym: w powietrzu pilot ma jedno spojrzenie,
 * a nie chwilę na czytanie. Nazwa fazy odpowiada na pytanie „co się teraz dzieje",
 * liczby (GS, wysokość, paliwo) są od pytania „jak bardzo" i dlatego siedzą niżej,
 * w siatce parametrów.
 *
 * Kolor niesie znaczenie i pochodzi z tonu: `blue` = w powietrzu, `green` = na ziemi
 * z pracującym silnikiem, `amber` = uwaga, `neutral` = stan bierny.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { radius } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tone';

export interface PhaseHeroProps {
  /** Nazwa fazy: Taxi, Climb, Cruise, Descent, Engine Idle. */
  phase: string;
  /** Linia pod fazą — kontekst, nie ozdobnik (np. „+1 200 FT/MIN"). */
  detail?: string;
  tone?: Tone;
  icon?: IconName;
  /** Chip po prawej — drugorzędny wobec fazy. */
  aside?: React.ReactNode;
  style?: ViewStyle;
}

export function PhaseHero({
  phase,
  detail,
  tone = 'blue',
  icon = 'aircraft',
  aside,
  style,
}: PhaseHeroProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: 10,
          paddingBottom: 12,
          borderBottomWidth: theme.borderWidth,
          borderBottomColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View style={styles.body}>
        <View
          style={[
            styles.iconBox,
            {
              borderWidth: theme.borderWidth,
              borderColor: theme.colors.borderStrong,
              backgroundColor: theme.colors.surfaceRaised,
            },
          ]}
        >
          <Icon name={icon} size={28} color={theme.colors.textPrimary} />
        </View>

        <View style={styles.texts}>
          <AppText
            variant="display"
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.phase, { color: tone === 'neutral' ? theme.colors.textSecondary : c.accent }]}
          >
            {phase.toUpperCase()}
          </AppText>
          {detail != null && (
            <AppText variant="mono" tone="muted" style={styles.detail}>
              {detail}
            </AppText>
          )}
        </View>

        {aside}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  body: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // Plakietka nie jest przyciskiem, ale mockup (`.phase-hero-icon`, 14 px) rysuje ją tym
  // samym promieniem co rodzinę kafli — bierzemy kanon `radius.btn`, nie literał.
  iconBox: { width: 52, height: 52, borderRadius: radius.btn, alignItems: 'center', justifyContent: 'center' },
  texts: { gap: 3 },
  phase: { fontSize: 54, lineHeight: 56, letterSpacing: 6 },
  detail: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
});
