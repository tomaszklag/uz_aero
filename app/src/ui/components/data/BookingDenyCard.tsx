/**
 * Ninerdeck - KARTA ODMOWY ZAPISU REZERWACJI (`design/22c`, `.deny`).
 *
 * Bursztyn, nie czerwień: nic się nie zepsuło i nic nie przepadło - termin zajął ktoś
 * inny, a formularz stoi wypełniony i czeka na inną godzinę. Czerwień w tej aplikacji
 * znaczy stan, z którego nie ma wyjścia bez decyzji (`SYNC STOI`, usunięcie wpisu).
 *
 * WIERSZ „NAJBLIŻSZE WOLNE" JEST DROGĄ WYJŚCIA, nie ozdobą: odmowa bez niego kazałaby
 * pilotowi szukać godziny samemu, choć sugestia dla tej samej długości slotu i tak
 * stoi na ekranie. Bez propozycji wiersza po prostu nie ma - pusty obiecywałby skrót,
 * którego nie ma (dzień bywa pełny).
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BookingDenyVm } from '../../screens/logic/bookingDeny';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface BookingDenyFix {
  /** „Najbliższe wolne 2 h" - etykieta mówi, CZEGO dotyczy skrót. */
  label: string;
  /** „13:00 → 15:00" czasem klubu. */
  hours: string;
  onPress: () => void;
}

export interface BookingDenyCardProps {
  deny: BookingDenyVm;
  fix?: BookingDenyFix;
}

export function BookingDenyCard({ deny, fix }: BookingDenyCardProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Icon name="warning" size={14} color={theme.colors.amber} />
        <AppText variant="mono" style={s.title}>
          {deny.title}
        </AppText>
      </View>

      <AppText style={s.body}>{deny.body}</AppText>

      {fix != null && (
        <Pressable style={s.fix} onPress={fix.onPress} accessibilityRole="button">
          <AppText variant="mono" style={s.fixLabel}>
            {fix.label}
          </AppText>
          <AppText variant="mono" style={s.fixValue}>
            {fix.hours}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    card: {
      gap: 9,
      padding: 13,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: t.colors.amberBorder,
      backgroundColor: t.colors.amberMuted,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: {
      fontSize: 9,
      lineHeight: 12,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: t.colors.amber,
    },
    body: { fontSize: 12, lineHeight: 18, color: t.colors.textSecondary },
    fix: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: t.colors.amberBorder,
      // Ciemna rynienka na tonowanej karcie - ta sama reguła, co przy miarce
      // tankowania: bursztyn na bursztynie zlewa się w jedno.
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    fixLabel: {
      fontSize: 9,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: t.colors.textMuted,
    },
    fixValue: { fontSize: 13, fontWeight: '700', letterSpacing: 1, color: t.colors.amber },
  });
