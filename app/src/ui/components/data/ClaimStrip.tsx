/**
 * UZ Aero — ClaimStrip (`.claim-strip` z mockupów 04 / 04A / 04B).
 *
 * Pasek sesji samolotu: ikona, czyja maszyna i od kiedy, licznik wzlotów, a po prawej
 * wyjście albo stan. Zastąpił `DutyStrip` — powód jest modelowy, nie wizualny: czas
 * służby należy do PILOTA i mieszka na 01, a kokpit opisuje SAMOLOT (§3.6a).
 *
 * Klikalny wariant jest **jedyną drogą powrotną z kokpitu do ekranu domowego**, więc
 * `onPress` decyduje o roli całego paska: z nim to nawigacja (04/04A), bez niego —
 * przyrząd do odczytania (04B, cudza sesja).
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';

export interface ClaimStripProps {
  /** Górna linia: „SP-AXA · Twój od 08:04". */
  label: string;
  /** Dolna linia: „2 wzloty" albo „jeszcze żadnego wzlotu". */
  legs: string;
  /** Prawa strona: „Mój dzień →" albo „zajęty". */
  trailing: string;
  /** Podany → pasek jest nawigacją; pominięty → samym odczytem. */
  onPress?: () => void;
  style?: ViewStyle;
}

export function ClaimStrip({ label, legs, trailing, onPress, style }: ClaimStripProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');

  const body = (
    <>
      <View style={styles.left}>
        <Icon name="aircraft" size={16} color={blue.accent} />
        <View style={styles.text}>
          <AppText variant="mono" tone="muted" style={styles.label}>
            {label}
          </AppText>
          <AppText variant="mono" style={styles.value}>
            {legs}
          </AppText>
        </View>
      </View>

      <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.trailing}>
        {trailing}
      </AppText>
    </>
  );

  const frame = (pressed: boolean): ViewStyle => ({
    gap: theme.spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: theme.borderWidth,
    borderColor: pressed ? theme.colors.greenBorder : theme.colors.border,
    backgroundColor: theme.colors.surface,
  });

  if (onPress == null) {
    return <View style={[styles.strip, frame(false), style]}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} · ${legs} — przejdź do „Mój dzień"`}
      onPress={onPress}
      style={({ pressed }) => [styles.strip, frame(pressed), style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Wysokość bierze się z paddingu i dwóch linii tekstu — razem ~52 px, czyli powyżej
  // progu 44 px dla celu dotykowego (`CLAUDE.md`), mimo że pasek nie wygląda jak przycisk.
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Etykieta bywa długa („SP-FGK · KRZ od 07:10 UTC") — musi mieć się gdzie skurczyć,
  // zamiast wypychać prawą stronę poza ekran.
  text: { flexShrink: 1 },
  label: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  value: { fontSize: 16, lineHeight: 20, letterSpacing: 2 },
  trailing: { flexShrink: 0, fontSize: 10, letterSpacing: 0.5 },
});
