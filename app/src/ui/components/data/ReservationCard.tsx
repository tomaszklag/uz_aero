/**
 * Ninerdeck - KARTA WŁASNEJ REZERWACJI (`design/21-kalendarz.html`, `.res-card`).
 *
 * Oś floty odpowiada „co jest zajęte", a ta karta „co mam zaplanowane". Zielona
 * obramówka, bo to jedyna rzecz na tym ekranie, na którą pilot ma wpływ - ten sam
 * powód, dla którego własny pasek na osi jest jedynym w kolorze akcentu.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { MyBookingVm } from '../../screens/logic/calendarMine';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';

export interface ReservationCardProps {
  booking: MyBookingVm;
  onPress: () => void;
}

export function ReservationCard({ booking, onPress }: ReservationCardProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Pressable style={s.card} onPress={onPress} accessibilityRole="button">
      <View style={s.top}>
        <AppText variant="mono" style={s.hours}>
          {booking.hours}
        </AppText>
        <AppText variant="mono" style={s.reg}>
          {booking.reg}
        </AppText>
      </View>

      {/* Wiersz szczegółów niesie WYŁĄCZNIE to, co wypełnione - kropka rozdziela,
          więc pusty człon zostawiłby dwie kropki obok siebie. */}
      {booking.meta.length > 0 && (
        <View style={s.meta}>
          {booking.meta.map((text, i) => (
            <React.Fragment key={text}>
              {i > 0 && <View style={s.dot} />}
              <AppText variant="body" style={s.metaText}>
                {text}
              </AppText>
            </React.Fragment>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.greenBorder,
      borderRadius: 13,
      paddingVertical: 11,
      paddingHorizontal: 12,
      gap: 7,
    },
    top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
    hours: { fontSize: 15, lineHeight: 18, letterSpacing: 1, color: t.colors.textPrimary },
    reg: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5, color: t.colors.green },
    meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
    metaText: { fontSize: 11.5, lineHeight: 16, color: t.colors.textSecondary },
    dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: t.colors.borderStrong },
  });
