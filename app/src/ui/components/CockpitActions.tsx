/**
 * UZ Aero — CockpitActions (`.action-row` z mockupów 05, 05a–05d)
 *
 * Pasek trzech akcji przyklejony do dołu ekranu w locie: zapis ręczny (szeroki),
 * zrzut (wąski, niebieski) i STOP ENGINE (wąski, czerwony).
 *
 * Proporcje nie są przypadkowe. Zapis ręczny jest najszerszy, bo to **ratunek na fałszywą
 * detekcję** — GPS klasy konsumenckiej gubi starty i lądowania (§8), a poprawka nie może
 * być trudniejsza niż błąd. STOP jest najwęższy i przez większość lotu zablokowany:
 * `engine_stop` w powietrzu byłby fałszywym wpisem, więc pokazujemy powód zamiast
 * chować przycisk (§6 pkt 3).
 *
 * Pasek stoi w stałym miejscu niezależnie od tego, jak długi jest log — w locie pilot
 * sięga po te przyciski, nie patrząc.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tone';

export interface CockpitActionsProps {
  /** Akcja szeroka po lewej — zapis ręczny startu albo lądowania. */
  primaryLabel: string;
  primaryIcon?: IconName;
  onPrimary: () => void;
  /** Zrzut — dostępny tylko w powietrzu. */
  onDrop: () => void;
  dropDisabledReason?: string | null;
  /** STOP ENGINE. */
  onStop: () => void;
  stopDisabledReason?: string | null;
  style?: ViewStyle;
}

export function CockpitActions({
  primaryLabel,
  primaryIcon = 'landing',
  onPrimary,
  onDrop,
  dropDisabledReason = null,
  onStop,
  stopDisabledReason = null,
  style,
}: CockpitActionsProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');
  const red = toneColors(theme, 'red');

  return (
    <View
      style={[
        styles.row,
        { paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.colors.bg },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        onPress={onPrimary}
        style={({ pressed }) => [
          styles.primary,
          {
            borderRadius: 14,
            borderWidth: theme.borderWidth,
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surfaceRaised,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <Icon name={primaryIcon} size={20} color={theme.colors.textPrimary} />
        <AppText variant="button" style={styles.primaryLabel}>
          {primaryLabel}
        </AppText>
      </Pressable>

      <SideButton
        icon="drop"
        label="Zrzut"
        // Powód blokady MUSI być widoczny jako tekst (§6 pkt 3) — samo przygaszenie
        // zostawia pilota z pytaniem „dlaczego nie działa". STOP ma to od początku
        // („po LDG"); Zrzut dostaje swój skrót tą samą drogą.
        sublabel={dropDisabledReason != null ? 'w locie' : undefined}
        colors={blue}
        disabledReason={dropDisabledReason}
        onPress={onDrop}
      />

      <SideButton
        icon="stop"
        label="STOP"
        sublabel={stopDisabledReason != null ? 'po LDG' : undefined}
        colors={red}
        display
        disabledReason={stopDisabledReason}
        onPress={onStop}
      />
    </View>
  );
}

function SideButton({
  icon,
  label,
  sublabel,
  colors,
  display = false,
  disabledReason,
  onPress,
}: {
  icon: IconName;
  label: string;
  sublabel?: string;
  colors: { accent: string; muted: string; border: string };
  display?: boolean;
  disabledReason: string | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const disabled = disabledReason != null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityHint={disabledReason ?? undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.side,
        {
          borderRadius: 14,
          borderWidth: theme.borderWidth,
          borderColor: colors.border,
          backgroundColor: colors.muted,
          // Mockup przygasza zablokowany STOP zamiast go chować — powód jest w podpisie.
          opacity: disabled ? 0.35 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Icon name={icon} size={18} color={colors.accent} />
      <AppText
        variant={display ? 'buttonSmall' : 'mono'}
        style={display ? { color: colors.accent } : [styles.sideLabel, { color: colors.accent }]}
      >
        {label}
      </AppText>
      {sublabel != null && (
        <AppText variant="mono" style={[styles.sublabel, { color: colors.accent }]}>
          {sublabel}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: 56,
    paddingHorizontal: 12,
  },
  primaryLabel: { fontSize: 20, lineHeight: 22, letterSpacing: 2 },
  side: {
    minWidth: 76,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sideLabel: { fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
  sublabel: { fontSize: 7, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 },
});
