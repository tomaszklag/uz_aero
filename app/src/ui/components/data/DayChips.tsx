/**
 * Ninerdeck - PASEK DNI kalendarza (`design/21-kalendarz.html`, `.days`).
 *
 * Wybór doby, którą pokazuje oś floty. Zaznaczenie jest ODWRÓCONE (jasne tło, ciemny
 * napis) - ten sam wzorzec, co aktywna pozycja kolumny w panelu: mówi „tu jesteś",
 * a nie „to jest w normie". Kropka pod dniem znaczy własną rezerwację i nic więcej.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { DayChipVm } from '../../screens/logic/calendarDays';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';

export interface DayChipsProps {
  days: readonly DayChipVm[];
  onSelect: (date: string) => void;
}

export function DayChips({ days, onSelect }: DayChipsProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.strip}
      // Pasek dni przewija się w bok, a ekran pod nim w pionie - bez tego szybki ruch
      // kciukiem po chipach łapałby przewijanie pionowe i dni stałyby w miejscu.
      directionalLockEnabled
    >
      {days.map((day) => (
        <Pressable
          key={day.date}
          onPress={() => onSelect(day.date)}
          accessibilityRole="button"
          accessibilityState={{ selected: day.selected }}
          style={[s.chip, day.selected && s.chipOn, !day.selected && day.today && s.chipToday]}
        >
          <AppText variant="mono" style={[s.dow, day.selected && s.onText]}>
            {day.dow}
          </AppText>
          <AppText variant="display" style={[s.day, day.selected && s.onText]}>
            {day.day}
          </AppText>
          {/* Kropka zajmuje miejsce ZAWSZE - znikając, przesuwałaby cyfrę dnia
              o cztery piksele i pasek drgałby przy każdej zmianie doby. */}
          <View style={[s.dot, day.mine && (day.selected ? s.dotOn : s.dotMine)]} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    strip: { flexDirection: 'row', gap: 7, paddingBottom: 2 },
    chip: {
      alignItems: 'center',
      gap: 2,
      minWidth: 46,
      paddingVertical: 7,
      paddingHorizontal: 8,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    chipOn: { backgroundColor: t.colors.textPrimary, borderColor: t.colors.textPrimary },
    // Doba bieżąca niewybrana - sama obramówka, bez tła: to przypomnienie, gdzie jest
    // „dzisiaj", a nie drugi stan wybrania.
    chipToday: { borderColor: t.colors.borderStrong },
    dow: { fontSize: 8, lineHeight: 10, letterSpacing: 1.5, color: t.colors.textSecondary },
    day: { fontSize: 17, lineHeight: 18, letterSpacing: 1, color: t.colors.textSecondary },
    onText: { color: t.colors.bg },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
    dotMine: { backgroundColor: t.colors.green },
    dotOn: { backgroundColor: t.colors.bg },
  });
