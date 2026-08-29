/**
 * UZ Aero - GaugeHero (`.fob-indicator` z mockupu 06)
 *
 * Karta-przyrząd na całą szerokość: etykieta, JEDNA wielka liczba z jednostką, pasek
 * poziomu z podziałką i podpis mówiący, skąd ta liczba pochodzi. Cyfry mają 64 px, bo
 * to jedyna wartość, od której zależy sens całego ekranu - pilot ma ją odczytać bez
 * schylania się nad telefonem.
 *
 * Czym różni się od `Readout` (02a): tam wartość przychodzi Z SERWERA i wymaga adnotacji
 * świeżości (`live` / `cache` / `brak`, §4.8). Tutaj wartość jest **danymi sesji** -
 * liczy się ją lokalnie ze strumienia zdarzeń, więc jest zawsze świeża i wariantów
 * offline mieć nie może (`CLAUDE.md`, offline-first pkt 1). Dlatego GaugeHero nie ma
 * i nie powinien mieć propa `freshness`.
 *
 * `onCorrect` jest opcjonalne, ale zwykle potrzebne: licznik fizyczny bije naszą rachubę
 * (`CLAUDE.md`), więc pilot musi móc nadpisać wyliczoną wartość odczytem z paliwomierza.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { ScaleBar } from './ScaleBar';
import { toneColors, type Tone } from '../tone';

export interface GaugeHeroProps {
  /** Etykieta nad wartością, np. „FOB przed tankowaniem". */
  label: string;
  /** Sformatowana wartość główna (sama liczba - jednostka idzie osobno). */
  value: string;
  unit: string;
  tone?: Tone;
  /** Wypełnienie 0–1; `null` = nie ma do czego odnieść (nieznana pojemność). */
  ratio?: number | null;
  /** Podpisy podziałki pod paskiem. */
  scale?: string[];
  /** Podpis pod paskiem - skąd ta wartość pochodzi. */
  caption?: string;
  /** Korekta wartości odczytem z licznika. Bez niej karta jest czystym odczytem. */
  onCorrect?: () => void;
  correctLabel?: string;
  style?: ViewStyle;
}

export function GaugeHero({
  label,
  value,
  unit,
  tone = 'amber',
  ratio = null,
  scale = [],
  caption,
  onCorrect,
  correctLabel = 'Koryguj z licznika',
  style,
}: GaugeHeroProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      style={[
        styles.card,
        {
          gap: 4,
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.xl,
          paddingBottom: theme.spacing.lg,
          borderRadius: 20,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <AppText variant="mono" style={[styles.label, { color: c.accent }]}>
        {label}
      </AppText>

      <View style={styles.valueRow}>
        <AppText
          variant="mono"
          numberOfLines={1}
          style={{
            fontFamily: theme.fontFamily.monoBold,
            fontSize: 64,
            lineHeight: 66,
            letterSpacing: -2,
            color: c.accent,
          }}
        >
          {value}
        </AppText>
        <AppText variant="mono" style={[styles.unit, { color: c.accent }]}>
          {unit}
        </AppText>
      </View>

      {ratio != null && (
        <ScaleBar ratio={ratio} tone={tone} scale={scale} height={8} style={styles.bar} />
      )}

      {caption != null && (
        <AppText variant="mono" tone="muted" style={styles.caption}>
          {caption}
        </AppText>
      )}

      {onCorrect != null && (
        // Cel dotykowy 44 px - ten sam próg dla rękawic co w `ActionButton` i `Readout`.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${correctLabel}: ${label}`}
          onPress={onCorrect}
          style={({ pressed }) => [
            styles.correct,
            {
              minHeight: 44,
              marginTop: 6,
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radius.sm,
              borderWidth: theme.borderWidth,
              borderColor: c.border,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Icon name="edit" size={11} color={c.accent} />
          <AppText variant="mono" style={[styles.correctLabel, { color: c.accent }]}>
            {correctLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center' },
  // Krycie 0,7 / 0,6 z mockupu: etykieta i jednostka mają ustąpić samej liczbie.
  label: { fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', opacity: 0.7 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  unit: { fontSize: 28, lineHeight: 32, letterSpacing: 0, opacity: 0.6 },
  bar: { marginTop: 10 },
  caption: { fontSize: 10, letterSpacing: 0.5, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  correct: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  correctLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
});
