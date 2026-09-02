/**
 * UZ Aero - BalanceCard (karta rachunku z mockupu `10-statystyki.html`).
 *
 * Rachunek jednej wielkości: przesłanki („odczyt przy przejęciu", „dolane"), kreska,
 * wynik dużą cyfrą, a pod nim oczekiwanie i werdykt. Ten sam komponent obsługuje paliwo
 * i motogodziny - o to chodziło w issue #38 pkt 5: podobne zagadnienia mają wyglądać
 * podobnie, a nie każde inaczej, zależnie od kolejności powstawania.
 *
 * ══ CZYM RÓŻNI SIĘ OD `CalcBox` (06) ══
 * `CalcBox` jest tonowanym pudełkiem WEWNĄTRZ formularza i mówi „to zapiszesz za chwilę"
 * - jego wynik jest szacunkiem sprzed zapisu. Tutaj rachunek opisuje fakt już zapisany
 * i stoi jako pełnoprawna sekcja ekranu, więc ma nagłówek karty, wynik w skali nagłówka
 * i wiersz werdyktu, którego tamten nie ma.
 *
 * ══ BRAK WERDYKTU MILCZY - POZA ZEROWYM BIEGIEM (issue #69) ══
 * Karta bez werdyktu kończy się na sumie: brak normy to zwykły stan młodej maszyny,
 * a brakujący odczyt widać kreską w wierszu rachunku - zdanie pod spodem mówiło to
 * drugi raz. Jedyny `naNote` to zerowy bieg silnika (09C): tam zgodne odczyty bez
 * słowa wyglądałyby na brak danych, a są informacją (mockup `10a`).
 *
 * ══ SZCZEGÓŁY NORMY POD TAPNIĘCIEM (issue #40 pkt 7 i 8) ══
 * Do issue #40 pod każdym rachunkiem stało pasmo („Oczekiwane po tej sesji: 23 – 35 L")
 * i rozpisane działanie drobnym monospace'em. Przy normalnej sesji nie mówiły nic ponad
 * to, co mówi jedno słowo „w normie". Zostaje więc sama plakietka, a liczby przenoszą się
 * do arkusza (`design/10c-norma-detale.html`) - dla tego, kto zapyta „dlaczego tak".
 * Celem dotknięcia jest CAŁY wiersz: plakietka ma dziewięciopunktową czcionkę i sama
 * w sobie byłaby celem poniżej progu dostępności.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Card } from '../layout/Card';
import { BalanceSummary } from './BalanceSummary';
import type { Tone } from '../tone';

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

/** Treść arkusza normy - otwieranego plakietką werdyktu. */
export interface BalanceCardDetails {
  /** „NORMA PALIWA". */
  title: string;
  /** Zdanie streszczające werdykt, nad wierszami. */
  summary: string;
  rows: { label: string; value: string }[];
  /** „Jak to liczymy: …" - pod wierszami, drobnym monospace. */
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
   * Adnotacja wieku normy (§4.8) - pokazywana W ARKUSZU, przy liczbach, których dotyczy.
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

  return (
    <Card title={title} flush style={style}>
      {rows.map((row) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.key}>
            {/* Stała szerokość znaku działania - bez niej etykiety w kolejnych wierszach
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

      {/* Suma, werdykt i arkusz szczegółów mieszkają w `BalanceSummary` - ten sam
          komponent nosi je w karcie wpisu ręcznego, gdzie wierszy działania NIE MA,
          bo składowe stoją w polach nad nim (uwaga z urządzenia, 2026-08-29). */}
      <BalanceSummary
        totalLabel={totalLabel}
        totalValue={totalValue}
        totalTone={totalTone}
        verdict={verdict}
        details={details}
        freshness={freshness}
        naNote={naNote}
      />
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
});
