/**
 * UZ Aero — FuelStrip (`.fuel-strip` z mockupu 04)
 *
 * Pasek paliwa w kokpicie ground: ostatni odczyt po lewej, szacunek wystarczalności
 * po prawej.
 *
 * ══ DLACZEGO TO NIE JEST PRZYRZĄD ══
 * Świadomie bez paska postępu, bez skali i bez alarmów — mimo że dane by na nie
 * pozwalały. Wskaźnik ze skalą czyta się jak pomiar, a to jest SZACUNEK ze statystyki:
 * „ile zwykle wychodziło", nie „ile masz". Rezerwa jest wliczona w liczbę, a nie
 * narysowana jako czerwona strefa, bo strefa sugerowałaby, że ktoś tu pilnuje granicy.
 * Pilnuje jej pilot, patrząc na paliwomierz.
 *
 * Dlatego też szacunek ma własny, drobny podpis ze źródłem: liczba bez informacji,
 * skąd pochodzi, po kilku dniach staje się „liczbą z aplikacji" i zaczyna konkurować
 * z przyrządem.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';

export interface FuelStripProps {
  /** Sformatowany odczyt paliwa („141 L"). */
  fuel: string;
  label?: string;
  /** Zdanie szacunku („wystarczy na ~6 wyniesień do rezerwy 45 min"); `null` = brak normy. */
  endurance?: string | null;
  /** Podpis źródła szacunku — pokazywany tylko razem z `endurance`. */
  source?: string | null;
  style?: ViewStyle;
}

export function FuelStrip({
  fuel,
  label = 'Paliwo · ostatni odczyt',
  endurance,
  source,
  style,
}: FuelStripProps) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

  return (
    <View
      style={[
        styles.strip,
        {
          gap: theme.spacing.sm,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      <View style={styles.left}>
        <Icon name="refuel" size={16} color={amber.accent} />
        <View>
          <AppText variant="mono" tone="muted" style={styles.label}>
            {label}
          </AppText>
          <AppText variant="mono" style={styles.value}>
            {fuel}
          </AppText>
        </View>
      </View>

      {/* Bez normy pasek pokazuje sam odczyt — nie ma tu miejsca na „—" ani na zero,
          bo brak podpowiedzi nie jest wartością do wyświetlenia. */}
      {endurance != null && (
        <View style={styles.right}>
          <AppText variant="mono" tone="amber" numberOfLines={2} style={styles.endurance}>
            {endurance}
          </AppText>
          {source != null && (
            <AppText variant="mono" tone="muted" numberOfLines={2} style={styles.source}>
              {source}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  right: { flexShrink: 1, alignItems: 'flex-end' },
  label: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  value: { fontSize: 16, lineHeight: 20, letterSpacing: 2 },
  endurance: { fontSize: 10, letterSpacing: 0.5, textAlign: 'right' },
  source: { fontSize: 8, letterSpacing: 0.5, textAlign: 'right', marginTop: 3 },
});
