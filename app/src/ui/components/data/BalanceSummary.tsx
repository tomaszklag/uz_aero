/**
 * UZ Aero - PODSUMOWANIE RACHUNKU: suma, werdykt i arkusz szczegółów pod nim.
 *
 * Wyjęte z `BalanceCard` (uwaga z urządzenia, 2026-08-29: „trochę dublujemy to, co jest
 * w inputach - nie możesz dodać tylko tego podsumowania do sekcji PALIWO?").
 *
 * ══ PO CO OSOBNY KOMPONENT ══
 * Bo rachunek pojawia się w DWÓCH sytuacjach, które różnią się tym, co pilot ma już
 * przed oczami:
 *  • **ekran rozliczenia (10)** pokazuje sesję ZAPISANĄ - liczb składowych nie ma nigdzie
 *    indziej, więc karta rozpisuje działanie wiersz po wierszu (`BalanceCard`);
 *  • **krok 4 wpisu ręcznego** ma te liczby w POLACH, w które pilot właśnie je wpisał.
 *    Powtórzenie ich w karcie obok było dosłownym dublem - do sekcji wchodzi więc samo
 *    podsumowanie: wynik, werdykt i arkusz „jak to policzone".
 *
 * Rozpisane działanie NIE GINIE w tym drugim przypadku - mieszka w arkuszu pod
 * plakietką, czyli tam, gdzie pada pytanie „dlaczego tak". To ta sama zasada, którą
 * issue #40 zastosowało na ekranie 10: karta odpowiada „czy dobrze", arkusz „dlaczego".
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Banner } from '../status/Banner';
import { Tag } from '../status/Tag';
import { Sheet } from '../sheets/Sheet';
import { toneColors, type Tone } from '../tone';

export interface BalanceSummaryVerdict {
  label: string;
  tone: Tone;
}

export interface BalanceSummaryDetails {
  title: string;
  summary: string;
  rows: { label: string; value: string }[];
  note: string;
}

export interface BalanceSummaryProps {
  /** „Zużyte" / „Przyrost" - nazwa wielkości, nie zdanie. */
  totalLabel: string;
  totalValue: string;
  totalTone?: Tone;
  verdict?: BalanceSummaryVerdict | null;
  /** Szczegóły normy pod plakietką; bez nich plakietka jest sama i nie reaguje. */
  details?: BalanceSummaryDetails | null;
  /**
   * Adnotacja wieku normy (§4.8) - pokazywana W ARKUSZU, przy liczbach, których dotyczy.
   * Wołający podaje gotowy element, bo tylko on wie, kiedy cache się odświeżył.
   */
  freshness?: React.ReactNode;
  /**
   * Dlaczego werdyktu nie ma; wyklucza się z `verdict`. Od issue #69 przychodzi
   * wyłącznie przy zerowym biegu silnika - inne braki nie niosą zdania.
   */
  naNote?: string | null;
  style?: ViewStyle;
}

export function BalanceSummary({
  totalLabel,
  totalValue,
  totalTone = 'amber',
  verdict,
  details,
  freshness,
  naNote,
  style,
}: BalanceSummaryProps) {
  const { theme } = useTheme();
  const total = toneColors(theme, totalTone);
  const [open, setOpen] = useState(false);

  return (
    <View style={style}>
      <View style={[styles.total, { borderTopColor: theme.colors.borderStrong }]}>
        <AppText variant="mono" tone="muted" style={styles.totalKey}>
          {totalLabel.toUpperCase()}
        </AppText>
        <AppText
          variant="display"
          style={[
            styles.totalValue,
            { color: totalTone === 'neutral' ? theme.colors.textPrimary : total.accent },
          ]}
        >
          {totalValue}
        </AppText>
      </View>

      {verdict != null && (
        <Pressable
          accessibilityRole={details != null ? 'button' : undefined}
          accessibilityLabel={details != null ? `${verdict.label} - szczegóły normy` : verdict.label}
          disabled={details == null}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.verdict,
            { borderTopColor: theme.colors.border },
            pressed ? { backgroundColor: theme.colors.surfaceHover } : null,
          ]}
        >
          <Tag label={verdict.label} tone={verdict.tone} size="md" />
          {/* Znak „są szczegóły" - bez niego plakietka wygląda na sam napis i nikt jej
              nie dotknie. Ikona, nie napis: słowo w tym wierszu przekrzykiwałoby werdykt,
              który jest tu jedyną treścią. */}
          {details != null && <Icon name="info" size={14} color={theme.colors.textMuted} />}
        </Pressable>
      )}

      {naNote != null && (
        <View style={[styles.verdict, { borderTopColor: theme.colors.border }]}>
          <AppText variant="mono" tone="muted" style={styles.naNote}>
            {naNote}
          </AppText>
        </View>
      )}

      {details != null && (
        <Sheet
          visible={open}
          title={details.title}
          rows={details.rows}
          cancelLabel="ZAMKNIJ"
          onCancel={() => setOpen(false)}
          footer={
            <AppText variant="mono" tone="muted" style={styles.sheetNote}>
              {details.note}
            </AppText>
          }
        >
          <Banner
            kind="status"
            tone={verdict?.tone ?? 'neutral'}
            icon={verdict?.tone === 'green' ? 'check' : 'warning'}
            text={details.summary}
          />
          {freshness}
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  total: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
  },
  totalKey: { fontSize: 8, letterSpacing: 2 },
  totalValue: { fontSize: 26, letterSpacing: 1.5, lineHeight: 26 },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    // Cały wiersz jest celem dotknięcia (audyt dostępności): plakietka ma 9 px czcionki.
    minHeight: 44,
    borderTopWidth: 1,
  },
  naNote: { fontSize: 9, letterSpacing: 0.5, lineHeight: 14 },
  sheetNote: { fontSize: 9, letterSpacing: 0.4, lineHeight: 14 },
});
