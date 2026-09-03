/**
 * UZ Aero - GaugeHero (`.fob-indicator` z mockupu 06)
 *
 * Karta-przyrząd na całą szerokość: etykieta, JEDNA wielka liczba z jednostką
 * i podpis mówiący, skąd ta liczba pochodzi. Cyfry mają 64 px, bo to jedyna wartość,
 * od której zależy sens całego ekranu - pilot ma ją odczytać bez schylania się nad
 * telefonem.
 *
 * PASKA POZIOMU JUŻ NIE MA (uwaga z urządzenia, 2026-09-03: „skoro mam miarkę na
 * stanie po tankowaniu, usuń miarki przy FOB i dolewce") - jedną oś pojemności
 * mierzy odtąd wyłącznie miarka wyniku, a trzy paski mówiły to samo trzy razy.
 *
 * Karta jest NEUTRALNA, nie bursztynowa (ta sama tura): to pole ODCZYTU wymaganego
 * od pilota, a nie ostrzeżenie - bursztyn zostaje na dolewce i wyniku. `value: null`
 * rysuje pusty stan „- -" placeholderem (wzorzec sekcji oleju z 02A): pole
 * niewypełnione MA wyglądać na niewypełnione, a sugestię niesie podpis pod spodem.
 *
 * Czym różni się od `Readout` (02a): tam wartość przychodzi Z SERWERA i wymaga
 * adnotacji świeżości (`live` / `cache` / `brak`, §4.8). Tutaj wartość jest danymi
 * sesji albo wpisem pilota, więc `freshness` nie ma czego opisywać.
 *
 * `onCorrect` jest opcjonalne, ale zwykle potrzebne: licznik fizyczny bije naszą
 * rachubę (`CLAUDE.md`), więc pilot musi móc wpisać odczyt z paliwomierza.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { IconAction } from '../data/IconAction';
import { toneColors, type Tone } from '../tone';

export interface GaugeHeroProps {
  /** Etykieta nad wartością, np. „FOB przed tankowaniem". */
  label: string;
  /** Sformatowana wartość główna; `null` = stan pusty „- -" (pomiar do wpisania). */
  value: string | null;
  /** Jednostka za wartością - w stanie pustym nie rysuje się (nie ma czego mierzyć). */
  unit: string;
  tone?: Tone;
  /** Podpis pod wartością - skąd ta liczba pochodzi albo sugestia, ile powinno być. */
  caption?: string;
  /**
   * Wpisanie/korekta wartości odczytem z licznika. Bez niej karta jest czystym
   * odczytem. Wejściem jest OŁÓWEK W ROGU karty (uwagi z urządzenia, 2026-09-02,
   * dwie tury: bursztynowy napis pod wielką liczbą czytał się jak główna akcja
   * ekranu tankowania, a wyciszona pigułka nadal była „duża i w miejscu, które
   * sugeruje klikanie" - wyśrodkowana kontrolka pod herosem to pozycja CTA
   * niezależnie od koloru). Ołówek to ustalona affordancja poprawiania (issue #43);
   * `correctLabel` zostaje etykietą dla czytnika ekranu.
   */
  onCorrect?: () => void;
  correctLabel?: string;
  style?: ViewStyle;
}

export function GaugeHero({
  label,
  value,
  unit,
  tone = 'neutral',
  caption,
  onCorrect,
  correctLabel = 'Zmień odczyt',
  style,
}: GaugeHeroProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const empty = value == null;

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
            color: empty
              ? theme.colors.textPlaceholder
              : tone === 'neutral'
                ? theme.colors.textPrimary
                : c.accent,
          }}
        >
          {value ?? '- -'}
        </AppText>
        {!empty && (
          <AppText variant="mono" style={[styles.unit, { color: c.accent }]}>
            {unit}
          </AppText>
        )}
      </View>

      {caption != null && (
        <AppText variant="mono" tone="muted" style={styles.caption}>
          {caption}
        </AppText>
      )}

      {onCorrect != null && (
        // Ołówek w stałym rogu, nie kontrolka pod liczbą - patrz nota przy `onCorrect`.
        <View style={styles.corner}>
          <IconAction
            name="edit"
            accessibilityLabel={`${correctLabel}: ${label}`}
            onPress={onCorrect}
          />
        </View>
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
  caption: { fontSize: 10, letterSpacing: 0.5, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  corner: { position: 'absolute', top: 8, right: 8 },
});
