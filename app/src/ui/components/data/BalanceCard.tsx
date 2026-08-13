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
 *
 * ══ SZCZEGÓŁY NORMY POD TAPNIĘCIEM (issue #40 pkt 7 i 8) ══
 * Do issue #40 pod każdym rachunkiem stało pasmo („Oczekiwane po tej sesji: 23 – 35 L")
 * i rozpisane działanie drobnym monospace'em. Przy normalnej sesji nie mówiły nic ponad
 * to, co mówi jedno słowo „w normie". Zostaje więc sama plakietka, a liczby przenoszą się
 * do arkusza (`design/10c-norma-detale.html`) — dla tego, kto zapyta „dlaczego tak".
 * Celem dotknięcia jest CAŁY wiersz: plakietka ma dziewięciopunktową czcionkę i sama
 * w sobie byłaby celem poniżej progu dostępności.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Card } from '../layout/Card';
import { Banner } from '../status/Banner';
import { Sheet } from '../sheets/Sheet';
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
  label: string;
  tone: Tone;
}

/** Treść arkusza normy — otwieranego plakietką werdyktu. */
export interface BalanceCardDetails {
  /** „NORMA PALIWA". */
  title: string;
  /** Zdanie streszczające werdykt, nad wierszami. */
  summary: string;
  rows: { label: string; value: string }[];
  /** „Jak to liczymy: …" — pod wierszami, drobnym monospace. */
  note: string;
}

export interface BalanceCardProps {
  title: string;
  rows: BalanceCardRow[];
  totalLabel: string;
  totalValue: string;
  totalTone?: Tone;
  verdict?: BalanceCardVerdict | null;
  /** Szczegóły normy pod plakietką; bez nich plakietka jest sama i nie reaguje. */
  details?: BalanceCardDetails | null;
  /**
   * Adnotacja wieku normy (§4.8) — pokazywana W ARKUSZU, przy liczbach, których dotyczy.
   * Ekran podaje gotowy `FreshnessNote`, bo tylko on wie, kiedy cache się odświeżył.
   * Stan `live` nie rysuje nic, więc online arkusz zostaje bez adnotacji.
   */
  freshness?: React.ReactNode;
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
  details,
  freshness,
  naNote,
  style,
}: BalanceCardProps) {
  const { theme } = useTheme();
  const total = toneColors(theme, totalTone);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
        <Pressable
          accessibilityRole={details != null ? 'button' : undefined}
          accessibilityLabel={
            details != null ? `${verdict.label} — szczegóły normy` : verdict.label
          }
          disabled={details == null}
          onPress={() => setDetailsOpen(true)}
          style={({ pressed }) => [
            styles.verdict,
            { borderTopColor: theme.colors.border },
            pressed ? { backgroundColor: theme.colors.surfaceHover } : null,
          ]}
        >
          <Tag label={verdict.label} tone={verdict.tone} size="md" />
          {/* Znak „są szczegóły" — bez niego plakietka wygląda na sam napis i nikt jej
              nie dotknie. Ikona, nie napis: słowo w tym wierszu przekrzykiwałoby werdykt,
              który jest tu jedyną treścią. */}
          {details != null && (
            <Icon name="info" size={14} color={theme.colors.textMuted} />
          )}
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
          visible={detailsOpen}
          title={details.title}
          rows={details.rows}
          cancelLabel="ZAMKNIJ"
          onCancel={() => setDetailsOpen(false)}
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
    // Cały wiersz jest celem dotknięcia (audyt dostępności): plakietka ma 9 px czcionki.
    minHeight: 44,
    borderTopWidth: 1,
  },
  naNote: { fontSize: 9, letterSpacing: 0.5, lineHeight: 14 },
  sheetNote: { fontSize: 9, letterSpacing: 0.4, lineHeight: 14 },
});
