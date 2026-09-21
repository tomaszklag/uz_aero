/**
 * Ninerdeck - ARKUSZ FILTRA MASZYN osi kalendarza (`design/21d-kalendarz-filtr.html`).
 *
 * Wybór jest PREFERENCJĄ PATRZENIA, nie danymi klubu - zatwierdzenie zapisuje go
 * lokalnie per pilot i klub. Arkusz pracuje na SZKICU: „ANULUJ" zostawia oś taką,
 * jaka była, więc odklikanie ośmiu maszyn i rozmyślenie się nie kosztuje nic.
 *
 * Jeden skrót, nie cztery: „zaznacz wszystkie" jest jedynym wyborem, który da się
 * nazwać bez wiedzy, której system nie ma. Filtr po typie albo po uprawnieniach pilota
 * wymagałby danych o tym, na czym wolno mu latać - a tych rejestr nie prowadzi.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  buildFilterRows,
  confirmLabel,
  toggleHidden,
  type FilterRowVm,
} from '../../screens/logic/aircraftFilter';
import type { CalendarBooking } from '../../screens/logic/calendarData';
import type { ReferenceAircraft } from '../../../domain';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { CheckIcon } from '../foundation/CheckIcon';
import { Sheet } from './Sheet';

export interface FleetFilterSheetProps {
  visible: boolean;
  /** CAŁA flota klubu - także maszyny właśnie ukryte. */
  aircraft: readonly ReferenceAircraft[];
  /** Zajętości oglądanej doby - stąd plakietka „w serwisie" przy maszynie. */
  bookings: readonly CalendarBooking[];
  hidden: readonly string[];
  onConfirm: (hidden: string[]) => void;
  onCancel: () => void;
}

export function FleetFilterSheet({
  visible,
  aircraft,
  bookings,
  hidden,
  onConfirm,
  onCancel,
}: FleetFilterSheetProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [draft, setDraft] = useState<string[]>([...hidden]);

  // Szkic startuje od stanu zapisanego przy KAŻDYM otwarciu - arkusz zamknięty
  // „ANULUJ" nie ma prawa wrócić z odklikanymi maszynami z poprzedniego razu.
  useEffect(() => {
    if (visible) setDraft([...hidden]);
  }, [visible, hidden]);

  const rows = buildFilterRows(aircraft, draft, bookings);
  const shown = rows.filter((r) => r.shown).length;

  return (
    <Sheet
      visible={visible}
      title="SAMOLOTY NA OSI"
      confirmLabel={confirmLabel(shown)}
      // Pusty wybór blokuje BEZ zdania: widać go z listy nad przyciskiem, w której
      // żaden wiersz nie ma ptaszka (wąski wyjątek reguły issue #55).
      confirmDisabled={shown === 0}
      onConfirm={() => onConfirm(draft)}
      onCancel={onCancel}
    >
      <Pressable
        style={s.all}
        onPress={() => setDraft([])}
        accessibilityRole="button"
        disabled={draft.length === 0}
      >
        <AppText variant="mono" style={s.allText}>
          Zaznacz wszystkie
        </AppText>
        <AppText variant="mono" style={s.allText}>
          {aircraft.length}
        </AppText>
      </Pressable>

      <ScrollView
        style={s.list}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row) => (
          <FilterRow
            key={row.aircraftId}
            row={row}
            theme={theme}
            onPress={() => setDraft((d) => toggleHidden(d, row.aircraftId))}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}

function FilterRow({
  row,
  theme,
  onPress,
}: {
  row: FilterRowVm;
  theme: Theme;
  onPress: () => void;
}) {
  const s = styles(theme);

  return (
    <Pressable
      style={[s.pick, row.shown && s.pickOn]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: row.shown }}
    >
      <View style={s.pickLeft}>
        <AppText variant="mono" style={s.pickReg}>
          {row.reg}
        </AppText>
        <AppText variant="mono" style={s.pickType}>
          {row.type}
        </AppText>
        {/* Powód wyłączenia z użytku - pilot ma wiedzieć, czemu maszyna stoi cała
            na bursztynowo, ZANIM zdejmie ją z osi „bo i tak nic na niej nie ma". */}
        {row.tag != null && (
          <AppText variant="mono" style={s.pickTag} numberOfLines={1}>
            {row.tag}
          </AppText>
        )}
      </View>
      {row.shown ? (
        <CheckIcon size={17} color={theme.colors.green} />
      ) : (
        <View style={s.circle} />
      )}
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    all: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.colors.borderStrong,
    },
    allText: { fontSize: 9, lineHeight: 12, letterSpacing: 1.5, color: t.colors.textSecondary },
    // Lista przewija się, a rząd akcji zostaje przypięty przez ramę arkusza: przy
    // kilkunastu maszynach wypchnięte akcje znaczyłyby arkusz, z którego nie da się
    // wyjść inaczej niż przewijaniem.
    list: { flexGrow: 0, flexShrink: 1 },
    listContent: { gap: 6 },
    pick: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      minHeight: 46,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    circle: {
      width: 17,
      height: 17,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: t.colors.borderStrong,
    },
    pickOn: { borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenMuted },
    pickLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 9, flexShrink: 1 },
    pickReg: { fontSize: 12, lineHeight: 15, letterSpacing: 1.5, color: t.colors.textPrimary },
    pickType: { fontSize: 8.5, lineHeight: 11, letterSpacing: 1, color: t.colors.textMuted },
    pickTag: {
      fontSize: 7,
      lineHeight: 12,
      letterSpacing: 1,
      color: t.colors.amber,
      backgroundColor: t.colors.amberMuted,
      borderWidth: 1,
      borderColor: t.colors.amberBorder,
      borderRadius: 5,
      paddingHorizontal: 6,
      paddingVertical: 2,
      flexShrink: 1,
    },
  });
