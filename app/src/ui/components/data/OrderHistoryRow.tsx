/**
 * Ninerdeck - OrderHistoryRow (`.hist-row` z makiet 32, 32B): wpis historii zmian zlecenia.
 *
 * Zlecenie prowadzą wszyscy z „Cudzymi rezerwacjami" NARAZ (pkt 20), więc „kto przestawił
 * maszynę" nie ma innej odpowiedzi niż ta lista. Chwila w stałej kolumnie po lewej, nazwa
 * zmiany pogrubiona, powód jako cytat, a nazwisko pod spodem - patrzy prowadzący, więc
 * nazwisko stoi (adresat widzi tę samą zmianę BEZ nazwiska, pkt 31). Wpis zegara
 * (wygaśnięcie) nazwiska nie ma - zrobił to czas, nie człowiek.
 *
 * Czerwień niesie wyłącznie odwołanie - jedyny wpis, który coś skasował.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import type { HistoryRowVm } from '../../screens/logic/orderHistory';
import { AppText } from '../foundation/AppText';

export interface OrderHistoryRowProps {
  row: HistoryRowVm;
  divider?: boolean;
}

export function OrderHistoryRow({ row, divider = false }: OrderHistoryRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={[s.row, divider && s.divider]}>
      <AppText variant="mono" style={s.when}>
        {row.when}
      </AppText>
      <View style={s.body}>
        <AppText variant="body" style={s.what}>
          {row.what.map((part, i) => (
            <AppText key={i} variant="body" style={[s.what, part.strong === true && (row.void ? s.void : s.strong)]}>
              {part.text}
            </AppText>
          ))}
        </AppText>
        {row.reason != null && (
          <AppText variant="body" style={s.reason}>
            „{row.reason}"
          </AppText>
        )}
        {row.who != null && (
          <AppText variant="mono" style={s.who}>
            {row.who}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, paddingVertical: 9, paddingHorizontal: 13 },
    divider: { borderBottomWidth: t.borderWidth, borderBottomColor: t.colors.border },
    when: { width: 62, paddingTop: 1, fontSize: 9, lineHeight: 13, letterSpacing: 0.5, color: t.colors.textMuted },
    body: { flex: 1, minWidth: 0, gap: 1 },
    what: { fontSize: 12, lineHeight: 17, color: t.colors.textSecondary },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    strong: { fontFamily: t.fontFamily.bodySemiBold, color: t.colors.textPrimary },
    void: { fontFamily: t.fontFamily.bodySemiBold, color: t.colors.red },
    reason: { fontSize: 12, lineHeight: 17, color: t.colors.textPrimary },
    who: { fontSize: 9, lineHeight: 13, color: t.colors.textMuted },
  });
