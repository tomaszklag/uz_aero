/**
 * UZ Aero — ActionGrid (`.action-grid` z mockupu 04)
 *
 * Siatka 2×2 akcji naziemnych: tankowanie, zmiana załogi, lista ręczna, zakończenie dnia.
 *
 * Każda karta niesie **podpis ze stanem** („Ostatnie: 112 L → 160 L", „PIC: TMK · DUAL: AKO").
 * To nie ozdoba: dzięki niemu pilot widzi, czy akcja jest potrzebna, bez wchodzenia
 * w ekran i wracania. Kafelek bez podpisu zmuszałby do nawigowania „na próbę".
 *
 * Ton koduje wagę: amber = zmienia paliwo, red = kończy dzień (nieodwracalne),
 * neutral = reszta. „Zakończ dzień" jest czerwony celowo — to jedyna akcja z tej siatki,
 * po której nie ma powrotu do latania.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tone';

export interface ActionCardSpec {
  id: string;
  icon: IconName;
  label: string;
  /** Podpis ze stanem — co pilot zobaczy po wejściu. */
  sub?: string;
  tone?: Tone;
  onPress: () => void;
  /** Blokada z podanym powodem — nigdy wyszarzenie bez wyjaśnienia (§6 pkt 3). */
  disabledReason?: string;
}

export interface ActionGridProps {
  actions: ActionCardSpec[];
  style?: ViewStyle;
}

export function ActionGrid({ actions, style }: ActionGridProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.grid, style]}>
      {actions.map((action) => {
        const c = toneColors(theme, action.tone ?? 'neutral');
        const disabled = action.disabledReason != null;

        return (
          <Pressable
            key={action.id}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            accessibilityHint={action.disabledReason}
            disabled={disabled}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.card,
              {
                gap: 10,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: theme.radius.btn,
                borderWidth: theme.borderWidth,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.iconBox,
                {
                  borderWidth: theme.borderWidth,
                  borderColor: action.tone == null ? theme.colors.border : c.border,
                  backgroundColor:
                    action.tone == null ? theme.colors.surfaceRaised : c.muted,
                },
              ]}
            >
              <Icon
                name={action.icon}
                size={18}
                color={action.tone == null ? theme.colors.textSecondary : c.accent}
              />
            </View>

            <View style={styles.texts}>
              <AppText
                variant="mono"
                numberOfLines={1}
                style={{ fontFamily: theme.fontFamily.monoBold, fontSize: 11, letterSpacing: 0.5 }}
              >
                {action.label}
              </AppText>
              {(action.disabledReason ?? action.sub) != null && (
                <AppText
                  variant="body"
                  tone={disabled ? 'amber' : 'muted'}
                  numberOfLines={2}
                  style={styles.sub}
                >
                  {action.disabledReason ?? action.sub}
                </AppText>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Dwie kolumny: 50% minus połowa odstępu.
  card: { width: '47.8%', flexGrow: 1, minHeight: 96 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  texts: { gap: 2 },
  sub: { fontSize: 10, lineHeight: 13 },
});
