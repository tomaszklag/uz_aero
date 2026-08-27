/**
 * UZ Aero — kalendarz miesięczny (arkusz daty lotu 15E, issue #58).
 *
 * Zastąpił stepper ±1 dzień z wpisem z klawiatury — zgłoszenie z urządzenia brzmiało
 * wprost: „powinien być date-picker z kalendarzem". Siatka odpowiada na pytanie
 * „którego to było?" jednym tapnięciem, a dwa najczęstsze dni i tak mają skróty
 * w arkuszu („Dzisiaj" / „Wczoraj" — zostają NAD kalendarzem, bo to one obsługują
 * niemal każdy wpis).
 *
 * Zasady siatki:
 *  • tydzień od PONIEDZIAŁKU, doby to północe UTC (`calendarMonth.ts` — tam testy);
 *  • dni przyszłe (za `max`) są wygaszone i nie reagują — lot w przyszłości to nonsens;
 *  • dzisiejsza doba ma obwódkę także niewybrana: kalendarz bez „dziś" nie mówi,
 *    gdzie jest teraz;
 *  • dni sąsiednich miesięcy nie rysujemy wcale — tapnięcie w nie zmieniałoby dobę
 *    i miesiąc naraz, a puste pole niczego nie obiecuje;
 *  • strzałka „nowszy miesiąc" gaśnie na miesiącu `max` — dalej są same dni,
 *    których nie wolno wybrać.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { EpochMillis } from '../../../domain';
import { dateUtcLong, monthYearUtc } from '../../format';
import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';
import { addMonthsUtc, calendarWeeks, monthStartUtc } from './calendarMonth';

/** Nagłówki kolumn — poniedziałek pierwszy, jak w każdym polskim kalendarzu. */
const WEEKDAYS = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];

export interface CalendarGridProps {
  /** Wybrana doba (północ UTC). */
  value: EpochMillis;
  /** Ostatnia doba do wybrania (północ UTC) — dni za nią są wygaszone. */
  max: EpochMillis;
  /** Doba „dziś" (północ UTC) — znacznik obwódki, zwykle to samo co `max`. */
  today: EpochMillis;
  onChange: (day: EpochMillis) => void;
}

export function CalendarGrid({ value, max, today, onChange }: CalendarGridProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');

  // Przeglądany miesiąc żyje osobno od wyboru (kartkowanie nie wybiera), ale nowy
  // wybór — także skrótem „Dzisiaj" spoza siatki — przewraca kartkę na swój miesiąc.
  const [month, setMonth] = useState(() => monthStartUtc(value));
  useEffect(() => {
    setMonth(monthStartUtc(value));
  }, [value]);

  const nextDisabled = addMonthsUtc(month, 1) > monthStartUtc(max);

  const navButton = (dir: -1 | 1, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir === -1 ? 'Poprzedni miesiąc' : 'Następny miesiąc'}
      disabled={disabled}
      onPress={() => setMonth(addMonthsUtc(month, dir))}
      style={({ pressed }) => [
        styles.nav,
        {
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.borderStrong,
          backgroundColor: theme.colors.surface,
          opacity: pressed ? 0.7 : disabled ? 0.35 : 1,
        },
      ]}
    >
      <Icon
        name={dir === -1 ? 'back' : 'more'}
        size={15}
        color={disabled ? theme.colors.textMuted : theme.colors.textPrimary}
      />
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {navButton(-1, false)}
        <AppText variant="mono" style={[styles.month, { color: theme.colors.textPrimary }]}>
          {monthYearUtc(month)}
        </AppText>
        {navButton(1, nextDisabled)}
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((label) => (
          <AppText key={label} variant="mono" tone="muted" style={styles.weekday}>
            {label}
          </AppText>
        ))}
      </View>

      {calendarWeeks(month).map((week, w) => (
        <View key={w} style={styles.weekRow}>
          {week.map((day, i) => {
            if (day == null) return <View key={`blank-${i}`} style={styles.cell} />;
            const selected = day === value;
            const disabled = day > max;
            const isToday = day === today;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={dateUtcLong(day)}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onChange(day)}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    borderRadius: theme.radius.md,
                    borderWidth: theme.borderWidth,
                    borderColor: selected
                      ? green.border
                      : isToday
                        ? theme.colors.borderStrong
                        : 'transparent',
                    backgroundColor: selected ? green.muted : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <AppText
                  variant="mono"
                  style={[
                    styles.day,
                    {
                      color: disabled
                        ? theme.colors.textPlaceholder
                        : selected
                          ? green.accent
                          : theme.colors.textPrimary,
                      fontFamily: selected ? theme.fontFamily.monoBold : theme.fontFamily.mono,
                    },
                  ]}
                >
                  {String(new Date(day).getUTCDate())}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  nav: { minWidth: 44, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, textAlign: 'center', fontSize: 13, letterSpacing: 1.5 },
  weekRow: { flexDirection: 'row', gap: 2 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 9, letterSpacing: 1 },
  // 40 dp wysokości — cel dotykowy; szerokość dzieli wiersz po równo.
  cell: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 13, letterSpacing: 0.5 },
});
