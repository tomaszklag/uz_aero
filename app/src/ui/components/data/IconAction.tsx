/**
 * Ninerdeck - DROBNA AKCJA IKONĄ (issue #43, uwaga z urządzenia 2026-08-14).
 *
 * ══ PO CO ══
 * Bo nie każda akcja zasługuje na przycisk. Unieważnienie zdarzenia stało w arkuszu
 * korekty jako pełnowymiarowy czerwony przycisk pod separatorem - i wyglądało jak
 * akcja główna ekranu, choć intencją wchodzącego w korektę jest POPRAWKA, nie
 * kasowanie. Zgłoszenie brzmiało wprost: „krzyczy… raczej moją intencją nie jest
 * wejście i usunięcie".
 *
 * Ikona w nagłówku arkusza mówi to samo ciszej: jest, gdy jej potrzeba, i nie
 * konkuruje z „ZAPISZ" o pierwsze spojrzenie.
 *
 * ══ DLACZEGO NIE ZWYKŁY `Pressable` W MIEJSCU UŻYCIA ══
 * Bo próg dotknięcia (44 dp) i zachowanie po tapnięciu mają być takie same wszędzie,
 * a ikona rysowana „na oko" w trzech arkuszach rozjedzie się przy pierwszej zmianie.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors, type Tone } from '../tone';

export interface IconActionProps {
  name: IconName;
  /** Do czytnika ekranu - ikona nie niesie napisu, więc etykieta jest obowiązkowa. */
  accessibilityLabel: string;
  onPress: () => void;
  tone?: Tone;
  size?: number;
  disabled?: boolean;
  /**
   * Błękitna kropka w rogu - nowa wiadomość w rozmowie (`.rcp-icon .dot`, karta
   * prowadzącego 32). Zapala się tylko z treścią: pusta ikona przy każdym wierszu
   * byłaby szumem, a kropka przy każdym - też.
   */
  dot?: boolean;
}

export function IconAction({
  name,
  accessibilityLabel,
  onPress,
  tone = 'neutral',
  size = 16,
  disabled = false,
  dot = false,
}: IconActionProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      /* 36 dp rysunku + 4 dp zapasu = próg 44 dp dla rękawic. Docblock obiecywał ten
         zapas od issue #43, ale `hitSlop` nigdy nie było w kodzie - złapane przy
         issue #62, gdy ikona trafiła do 48-dp wiersza listy. */
      hitSlop={4}
      style={({ pressed }) => [
        styles.btn,
        {
          borderRadius: theme.radius.md,
          backgroundColor: pressed ? c.muted : 'transparent',
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <Icon name={name} size={size} color={tone === 'neutral' ? theme.colors.textMuted : c.accent} />
      {dot && (
        <View
          pointerEvents="none"
          style={[styles.dot, { backgroundColor: theme.colors.blue, borderColor: theme.colors.surface }]}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 36 dp rysunku + `hitSlop` do progu rękawic: pełne 44 dp kwadratu obok tytułu
  // wyglądałoby jak przycisk, a to ma być ikona.
  btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  // Kropka 7 px z pierścieniem 2 px w kolorze karty - w RN pierścień jest obramowaniem.
  dot: { position: 'absolute', top: 5, right: 5, width: 11, height: 11, borderRadius: 5.5, borderWidth: 2 },
});
