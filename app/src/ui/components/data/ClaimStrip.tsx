/**
 * UZ Aero — ClaimStrip (`.claim-strip` z mockupu 04B).
 *
 * Pasek sesji CUDZEGO samolotu: ikona, czyja maszyna i od kiedy, licznik lotów, a po
 * prawej stan („zajęty"). Zastąpił `DutyStrip` — powód jest modelowy, nie wizualny: czas
 * pracy pilota jest wielkością PILOTA i mieszka na 01, a kokpit opisuje SAMOLOT (§3.6a).
 *
 * PRZYRZĄD, NIE NAWIGACJA (decyzja 2026-08-10). Do tej pory istniał też wariant klikalny
 * — w kokpicie WŁASNEJ maszyny prowadził na „Mój dzień" i był jedyną drogą powrotną.
 * Zniknął razem z tą drogą: pilot, który trzyma samolot, wychodzi z kokpitu wyłącznie
 * przez zdanie maszyny (09B). Trzy pytania paska są dziś zadawane tylko o CZYJŚ samolot,
 * przed decyzją o przejęciu, i nie prowadzą nigdzie dalej.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';

export interface ClaimStripProps {
  /** Górna linia: „SP-FGK · KRZ od 07:10 UTC". */
  label: string;
  /** Dolna linia: „2 loty" albo „jeszcze żadnego lotu". */
  flights: string;
  /** Prawa strona: stan maszyny — „zajęty". */
  trailing: string;
  style?: ViewStyle;
}

export function ClaimStrip({ label, flights, trailing, style }: ClaimStripProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');

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
        <Icon name="aircraft" size={16} color={blue.accent} />
        <View style={styles.text}>
          <AppText variant="mono" tone="muted" style={styles.label}>
            {label}
          </AppText>
          <AppText variant="mono" style={styles.value}>
            {flights}
          </AppText>
        </View>
      </View>

      <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.trailing}>
        {trailing}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // `flexShrink` MUSI stać także tutaj, nie tylko na `text`: dziecko nie skurczy się,
  // dopóki jego rodzic rośnie bez ograniczeń. Bez tego długa wartość („jeszcze żadnego
  // lotu" przy 16 px i tracking 2) wypychała prawą kolumnę poza krawędź telefonu —
  // złapane na urządzeniu 2026-08-10.
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  // Etykieta bywa długa („SP-FGK · KRZ od 07:10 UTC") — musi mieć się gdzie skurczyć,
  // zamiast wypychać prawą stronę poza ekran.
  text: { flexShrink: 1 },
  label: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  value: { fontSize: 16, lineHeight: 20, letterSpacing: 2 },
  trailing: { flexShrink: 0, fontSize: 10, letterSpacing: 0.5 },
});
