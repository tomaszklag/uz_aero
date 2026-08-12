/**
 * UZ Aero — BalanceCard (karta rachunku z mockupu `10-statystyki.html`).
 *
 * Rachunek jednej wielkości: przesłanki („odczyt przy przejęciu", „dolane"), kreska,
 * wynik dużą cyfrą, a pod nim oczekiwanie i werdykt. Ten sam komponent obsługuje paliwo
 * i motogodziny — o to chodziło w issue #38 pkt 5: podobne zagadnienia mają wyglądać
 * podobnie, a nie każde inaczej, zależnie od kolejności powstawania.
 *
 * ══ CZYM RÓŻNI SIĘ OD `CalcBox` (06) ══
 * `CalcBox` jest tonowanym pudełkiem WEWNĄTRZ formularza i mówi „to zapiszesz za chwilę"
 * — jego wynik jest szacunkiem sprzed zapisu. Tutaj rachunek opisuje fakt już zapisany
 * i stoi jako pełnoprawna sekcja ekranu, więc ma nagłówek karty, wynik w skali nagłówka
 * i wiersz werdyktu, którego tamten nie ma.
 *
 * ══ WERDYKT ALBO POWÓD JEGO BRAKU — NIGDY CISZA ══
 * Gdy nie ma z czym porównać (silnik nie pracował, brak odczytu, samolot bez normy),
 * karta pisze o tym zdaniem. Pusty pasek albo kreska wyglądałyby jak awaria aplikacji
 * (§6 pkt 3), a przy liczbach z licznika to najgorsze możliwe wrażenie.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Card } from '../layout/Card';
import { Tag } from '../status/Tag';
import { toneColors, type Tone } from '../tone';

export interface BalanceCardRow {
  id: string;
  /** Znak działania przed etykietą; pusty dla pierwszej przesłanki. */
  op: '' | '+' | '−';
  label: string;
  value: string;
}

export interface BalanceCardVerdict {
  /** Pasmo, z którego wynika werdykt („26 – 32 L"). */
  band: string;
  label: string;
  tone: Tone;
}

export interface BalanceCardProps {
  title: string;
  rows: BalanceCardRow[];
  totalLabel: string;
  totalValue: string;
  totalTone?: Tone;
  verdict?: BalanceCardVerdict | null;
  /** Skąd wzięło się pasmo — drobny monospace pod werdyktem. */
  note?: string | null;
  /** Ton przypisu: `amber` sygnalizuje daną z cache (§4.8). */
  noteTone?: Tone;
  /** Dlaczego werdyktu nie ma; wyklucza się z `verdict`. */
  naNote?: string | null;
  style?: ViewStyle;
}

export function BalanceCard({
  title,
  rows,
  totalLabel,
  totalValue,
  totalTone = 'amber',
  verdict,
  note,
  noteTone = 'neutral',
  naNote,
  style,
}: BalanceCardProps) {
  const { theme } = useTheme();
  const total = toneColors(theme, totalTone);

  return (
    <Card title={title} flush style={style}>
      {rows.map((row) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.key}>
            {/* Stała szerokość znaku działania — bez niej etykiety w kolejnych wierszach
                zaczynają się w różnych miejscach i rachunek przestaje wyglądać jak rachunek. */}
            <AppText variant="mono" tone="muted" style={styles.op}>
              {row.op}
            </AppText>
            <AppText variant="mono" tone="secondary" style={styles.label}>
              {row.label}
            </AppText>
          </View>
          <AppText variant="mono" style={styles.value}>
            {row.value}
          </AppText>
        </View>
      ))}

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
        <View style={[styles.verdict, { borderTopColor: theme.colors.border }]}>
          <View style={styles.verdictBand}>
            <AppText variant="mono" tone="muted" style={styles.verdictKey}>
              OCZEKIWANE PO TEJ SESJI
            </AppText>
            <AppText variant="mono" style={styles.verdictValue}>
              {verdict.band}
            </AppText>
          </View>
          <Tag label={verdict.label} tone={verdict.tone} size="md" />
        </View>
      )}

      {naNote != null && (
        <View style={[styles.verdict, { borderTopColor: theme.colors.border }]}>
          <AppText variant="mono" tone="muted" style={styles.naNote}>
            {naNote}
          </AppText>
        </View>
      )}

      {note != null && (
        <AppText
          variant="mono"
          tone={noteTone === 'amber' ? 'amber' : 'muted'}
          style={styles.note}
        >
          {note}
        </AppText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  key: { flexDirection: 'row', alignItems: 'baseline', flex: 1, minWidth: 0 },
  op: { width: 12, fontSize: 9.5 },
  label: { fontSize: 9.5, letterSpacing: 0.5, flexShrink: 1 },
  value: { fontSize: 12 },
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
    borderTopWidth: 1,
  },
  verdictBand: { gap: 2, flex: 1, minWidth: 0 },
  verdictKey: { fontSize: 8, letterSpacing: 1.5 },
  verdictValue: { fontSize: 11 },
  naNote: { fontSize: 9, letterSpacing: 0.5, lineHeight: 14 },
  note: { fontSize: 8, letterSpacing: 0.4, lineHeight: 12, paddingHorizontal: 12, paddingBottom: 10 },
});
