/**
 * Ninerdeck - OrderCrewRow (`.cseat` z makiet 32A, 32B): fotel w karcie „Załoga" prowadzącego.
 *
 * Karta „Załoga" odpowiada na „co już mam", a lista adresatów pod nią - na „z czego
 * jeszcze wybieram". Osoba przydzielona PRZECHODZI z listy tutaj: stojąca w obu
 * miejscach byłaby jedną osobą policzoną dwa razy. Przy niej zostaje rozmowa i menu ⋯
 * z „COFNIJ PRZYDZIAŁ" (32D), bo przydział da się cofnąć (pkt 14).
 *
 * „Leci" w zieleni, reszta podpisu w tonie podpisu: fotel jest obsadzony, czyli w normie -
 * cała linia w kolorze konkurowałaby z „Może lecieć" na liście niżej. Pusty fotel pisze
 * „Szukany" błękitem z krawędzią po lewej - to samo, co fotel zaproponowany adresatowi
 * (28): jedyny wiersz karty, o który ekran pyta. Gradient z makiety bez modułu natywnego
 * to płaska warstwa przygaszonego błękitu.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import type { CrewSeatVm, StatusPart } from '../../screens/logic/orderLeaderCard';
import { AppText } from '../foundation/AppText';
import { IconAction } from './IconAction';

export interface OrderCrewRowProps {
  seat: CrewSeatVm;
  divider?: boolean;
  onThread?: () => void;
  onMenu?: () => void;
}

export function OrderCrewRow({ seat, divider = false, onThread, onMenu }: OrderCrewRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const open = seat.name == null;
  const who = seat.name ?? '';

  return (
    <View style={[s.row, divider && s.divider]}>
      {open && <View pointerEvents="none" style={s.tint} />}
      {open && <View pointerEvents="none" style={s.edge} />}

      <AppText variant="mono" style={s.label}>
        {seat.label}
      </AppText>
      <View style={s.main}>
        {open ? (
          <AppText variant="body" style={s.open}>
            Szukany
          </AppText>
        ) : (
          <AppText variant="body" style={s.name}>
            {seat.name}
            {seat.code != null && (
              <AppText variant="mono" style={s.code}>
                {`  ${seat.code}`}
              </AppText>
            )}
          </AppText>
        )}
        {seat.status.length > 0 && (
          <AppText variant="mono" style={s.status}>
            {seat.status.map((part, i) => (
              <AppText key={i} variant="mono" style={[s.status, toneOf(part, theme)]}>
                {part.text}
              </AppText>
            ))}
          </AppText>
        )}
      </View>

      <View style={s.actions}>
        {seat.thread != null && onThread != null && (
          <IconAction name="message" accessibilityLabel={`Rozmowa · ${who}`} dot={seat.unread} onPress={onThread} />
        )}
        {seat.menu && onMenu != null && <IconAction name="overflow" accessibilityLabel={`Więcej · ${who}`} onPress={onMenu} />}
      </View>
    </View>
  );
}

const toneOf = (part: StatusPart, theme: Theme) => (part.tone === 'ok' ? { color: theme.colors.green } : null);

const styles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 58,
      paddingVertical: 10,
      paddingLeft: 13,
      paddingRight: 8,
    },
    divider: { borderBottomWidth: t.borderWidth, borderBottomColor: t.colors.border },
    tint: { ...StyleSheet.absoluteFillObject, backgroundColor: t.colors.blueMuted, opacity: 0.6 },
    edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: t.colors.blue },
    label: { width: 86, fontSize: 8.5, lineHeight: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: t.colors.textMuted },
    main: { flex: 1, minWidth: 0, gap: 3 },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    name: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 13, lineHeight: 17, color: t.colors.textPrimary },
    open: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 13, lineHeight: 17, color: t.colors.blue },
    code: { fontSize: 9, letterSpacing: 0.5, color: t.colors.textMuted },
    status: { fontSize: 9.5, lineHeight: 13, letterSpacing: 0.3, color: t.colors.textSecondary },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  });
