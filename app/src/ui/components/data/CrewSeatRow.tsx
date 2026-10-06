/**
 * Ninerdeck - CrewSeatRow (`.seat` z makiet 28, 28A, 28C): fotel i kto w nim siedzi.
 *
 * Karta „Załoga" mówi o FOTELACH, nie o adresatach (pkt 18): który fotel proponuje się
 * Tobie, kto już siedzi w drugim i który jest jeszcze „szukany". Do kogo jeszcze poszło
 * zlecenie, należy do prowadzących.
 *
 * Fotel zaproponowany Tobie (`you`) to JEDYNY wiersz karty z kolorem, bo jedyny, o który
 * ekran pyta: błękitna krawędź po lewej, lekki błękit pod treścią i plakietka. Fotel
 * szukany pisze „szukany" w kolorze podpisu i nic więcej - o ten fotel ekran nie pyta.
 *
 * `seat: null` = wiersz „Ty" bez fotela przy terminie do potwierdzenia (28A, ramka 3):
 * kolumna etykiet zostaje pusta, bo żaden fotel nie jest Twój - mówi to plakietka.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Tag } from '../status/Tag';

export interface CrewSeatRowProps {
  /** „Dowódca"; `null` = bez fotela (termin do potwierdzenia). */
  seat: string | null;
  /** „Ty", „Barbara Nowak", „szukany". */
  value: string;
  you?: boolean;
  sought?: boolean;
  /** „Proponowany fotel" / „Termin do potwierdzenia". */
  tag?: string | null;
  divider?: boolean;
}

export function CrewSeatRow({ seat, value, you = false, sought = false, tag = null, divider = false }: CrewSeatRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={[s.row, divider && s.divider]}>
      {/* Gradient z makiety (błękit gasnący w prawo) bez modułu natywnego: płaska warstwa
          przygaszonego błękitu pod treścią i krawędź 3 px - ta sama rola, jeden ton. */}
      {you && <View pointerEvents="none" style={s.tint} />}
      {you && <View pointerEvents="none" style={s.edge} />}

      <AppText variant="mono" style={s.seat}>
        {seat ?? ''}
      </AppText>
      <AppText variant="body" style={[s.value, sought && s.sought, you && s.you]}>
        {value}
      </AppText>
      {tag != null && <Tag label={tag} tone="blue" />}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 13,
    },
    divider: { borderBottomWidth: t.borderWidth, borderBottomColor: t.colors.border },
    tint: { ...StyleSheet.absoluteFillObject, backgroundColor: t.colors.blueMuted, opacity: 0.6 },
    edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: t.colors.blue },
    seat: {
      width: 96,
      fontSize: 8.5,
      lineHeight: 12,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: t.colors.textMuted,
    },
    value: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 17.5, color: t.colors.textPrimary },
    sought: { color: t.colors.textMuted },
    you: { fontFamily: t.fontFamily.bodySemiBold },
  });
