/**
 * UZ Aero - ResultBar (`.result-row` z mockupu 06)
 *
 * Samodzielny pasek WYNIKU: po lewej etykieta i rachunek, który do niego doprowadził,
 * po prawej jedna duża liczba na tonowanym tle. To nie jest kolejne pole formularza -
 * to odpowiedź na pytanie „co dokładnie zapiszę", policzona z tego, co pilot ustawił.
 *
 * Dlaczego rachunek jest widoczny, a nie tylko wynik: `refuel` zapisuje TRZY liczby
 * (przed / dolano / po) i domena odrzuca zdarzenie, gdy się nie sumują (`FUEL_ARITHMETIC`,
 * §3.4). Pokazanie „112 + 48 = 160 L" pozwala pilotowi wyłapać zły odczyt zanim komenda
 * go odrzuci - i zrozumieć komunikat, gdyby jednak odrzuciła.
 *
 * Czym różni się od `ResultRow` z `Field.tsx`: tamten jest STOPKĄ sekcji formularza -
 * cienka linia i wartość 18 px, wewnątrz karty, pod polami, z których wynika. Ten stoi
 * MIĘDZY sekcjami jako osobny element o własnym tle i tonie, bo w mockupie 06 wynik
 * jest równorzędny ze wskaźnikiem FOB, a nie przypisem do pola.
 *
 * Ton DOMYŚLNIE bursztynowy (uwaga z urządzenia, 2026-09-03: „stan po tankowaniu
 * powinien być na żółtym tle - zielony jest do czegoś innego"): to nadal liczba
 * o PALIWIE, a zieleń jest w tej aplikacji akcentem głównym (silnik, CTA) i robiła
 * z wyniku rachunku osobny komunikat „OK". Czerwień zostaje dla wyniku łamiącego limit.
 *
 * Czym różni się od komórki `ParamGrid`: parametr to przyrząd czytany kątem oka
 * (etykieta nad wartością, stałe miejsce w siatce). Tu wartość ma sens wyłącznie razem
 * z rachunkiem obok, więc oba stoją w jednym wierszu i dzielą jedno tło.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { ScaleBar } from '../readouts/ScaleBar';
import { TINTED_TRACK, toneColors, type Tone } from '../tone';

export interface ResultBarProps {
  /** Nazwa wyniku, np. „Stan po tankowaniu". */
  label: string;
  /** Wynik gotowy do wyświetlenia, razem z jednostką („160 L"). */
  value: string;
  /** Rachunek prowadzący do wartości („112 + 48 = 160 L · 48% pojemności"). */
  formula?: string | null;
  /**
   * Miarka pod wynikiem (uwaga z urządzenia, 2026-09-03): stan zastany przygaszonym
   * odcinkiem 0→`baseRatio`, dolewka pełnym akcentem do `ratio` - trzy liczby
   * z rachunku widziane na tle pojemności. Brak = sam wiersz, jak dotąd.
   */
  gauge?: { ratio: number; baseRatio?: number | null; scale?: string[] } | null;
  /** Ton wyniku - `red`, gdy łamie limit; poza tym ton medium (paliwo = amber). */
  tone?: Tone;
  style?: ViewStyle;
}

export function ResultBar({ label, value, formula, gauge, tone = 'amber', style }: ResultBarProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}${formula != null ? `. ${formula}` : ''}`}
      style={[
        {
          gap: 8,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: 14,
          borderRadius: theme.radius.btn,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <View style={[styles.row, { gap: theme.spacing.md }]}>
        <View style={styles.left}>
          {/* Krycie 0,8 / 0,6 z mockupu: etykieta i rachunek ustępują samej liczbie. */}
          <AppText variant="mono" style={[styles.label, { color: c.accent }]}>
            {label}
          </AppText>
          {formula != null && (
            <AppText variant="mono" style={[styles.formula, { color: c.accent }]}>
              {formula}
            </AppText>
          )}
        </View>

        <AppText
          variant="mono"
          numberOfLines={1}
          style={{
            fontFamily: theme.fontFamily.monoBold,
            fontSize: 28,
            lineHeight: 32,
            letterSpacing: -0.5,
            color: c.accent,
          }}
        >
          {value}
        </AppText>
      </View>

      {gauge != null && (
        // Ciemna rynienka jak przy FOB: pasek leży na tonowanej karcie, więc rynienka
        // z surfaceRaised zlewała bursztyn z bursztynem (uwaga z urządzenia, 2026-09-03).
        <ScaleBar
          ratio={gauge.ratio}
          baseRatio={gauge.baseRatio}
          trackColor={TINTED_TRACK}
          tone={tone}
          scale={gauge.scale ?? []}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexShrink: 1, gap: 2 },
  label: { fontSize: 10, letterSpacing: 1.5, lineHeight: 14, textTransform: 'uppercase', opacity: 0.8 },
  formula: { fontSize: 10, letterSpacing: 0.5, lineHeight: 14, opacity: 0.6 },
});
