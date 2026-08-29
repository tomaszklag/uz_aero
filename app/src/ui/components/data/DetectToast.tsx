/**
 * UZ Aero - DetectToast (autodetekcja startu / lądowania)
 *
 * Arkusz od dołu, który pojawia się, gdy GPS wykryje zdarzenie. Hierarchia jest
 * **odwrotna niż podpowiada intuicja** i wynika wprost z §3.2:
 *
 *   brak reakcji = ZAPIS.  Jedyną akcją pilota jest COFNIJ.
 *
 * Dlatego duży, wyraźny przycisk to „COFNIJ", a nie „Potwierdź" - potwierdzanie
 * dublowałoby to, co i tak nastąpi, i uczyłoby pilota, że musi reagować przy każdym
 * locie. Licznik sekund jest czytelny (nie 3-pikselowy pasek), bo to jedyna informacja
 * o tym, ile czasu zostało na reakcję.
 *
 * Komponent jest bezstanowy w kwestii odliczania - czas podaje rodzic, który i tak
 * musi wiedzieć, kiedy wysłać komendę.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { ActionButton } from './ActionButton';
import { AppText } from '../foundation/AppText';
import { toneColors } from '../tone';

export interface DetectToastProps {
  /** Nazwa wykrytego zdarzenia („Takeoff", „Landing"). */
  title: string;
  /** Kontekst detekcji („13:24 UTC · GS ≥ 60 KT"). */
  detail?: string;
  /** Sekundy pozostałe do zapisu. */
  secondsLeft: number;
  /** Etykieta cofnięcia - dopasowana do sytuacji („COFNIJ - TO PRZELOT"). */
  undoLabel?: string;
  onUndo: () => void;
  style?: ViewStyle;
}

export function DetectToast({
  title,
  detail,
  secondsLeft,
  undoLabel = 'COFNIJ',
  onUndo,
  style,
}: DetectToastProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.sheet,
        {
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          paddingBottom: theme.spacing.xl,
          borderTopLeftRadius: theme.radius.xl,
          borderTopRightRadius: theme.radius.xl,
          borderTopWidth: theme.borderWidth,
          borderColor: green.border,
          backgroundColor: theme.colors.surfaceRaised,
        },
        style,
      ]}
    >
      <View style={styles.head}>
        <View style={styles.headText}>
          <AppText variant="label" style={{ color: green.accent }}>
            WYKRYTO: {title.toUpperCase()}
          </AppText>
          {detail != null && (
            <AppText variant="body" tone="secondary">
              {detail}
            </AppText>
          )}
        </View>
        <AppText variant="param" style={{ color: green.accent }}>
          {Math.max(0, secondsLeft)}
        </AppText>
      </View>

      <ActionButton label={undoLabel} tone="amber" onPress={onUndo} />

      <AppText variant="body" tone="secondary" style={styles.auto}>
        Nic nie rób, a zapiszemy automatycznie. Cofnij tylko, jeśli GPS się pomylił.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 2 },
  auto: { textAlign: 'center' },
});
