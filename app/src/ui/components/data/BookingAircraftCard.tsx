/**
 * Ninerdeck - KARTA SAMOLOTU przy zakładaniu rezerwacji (`design/22`, `.ac-card`).
 *
 * Pasek zajętości stoi W KARCIE: wybór i skutek wyboru w jednym miejscu. Pilot nie
 * przełącza się między listą a kalendarzem, żeby dowiedzieć się, czy to, co właśnie
 * wskazał, jest w ogóle wolne.
 *
 * ══ MASZYNA WYŁĄCZONA Z UŻYTKU ZOSTAJE NA LIŚCIE ══
 * Karta jest przygaszona i bez celu dotknięcia, plakietka mówi POWÓD, a pasek pokazuje
 * zakres - razem odpowiadają, czemu nie da się jej wybrać, bez ani jednego zdania
 * o blokadzie. Schowana byłaby odpowiedzią ukrytą przed kimś, kto właśnie pyta „czemu
 * nie ma czym latać".
 *
 * Paski przychodzą GOTOWE z `buildFleetGrid` - te same procenty, którymi rysuje się oś
 * zakładki Kalendarz. Drugi rachunek pozycji znaczyłby dwie skale dla jednej doby.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CalendarBar } from '../../screens/logic/calendarGrid';
import type { AircraftOptionVm } from '../../screens/logic/aircraftAvailability';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { CheckIcon } from '../foundation/CheckIcon';

export interface BookingAircraftCardProps {
  option: AircraftOptionVm;
  bars: readonly CalendarBar[];
  selected: boolean;
  onPress: () => void;
}

export function BookingAircraftCard({
  option,
  bars,
  selected,
  onPress,
}: BookingAircraftCardProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const off = option.blocked != null;

  return (
    <Pressable
      style={[s.card, selected && s.cardOn, off && s.cardOff]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: off }}
    >
      <View style={s.top}>
        <View style={s.left}>
          <AppText variant="mono" style={s.reg}>
            {option.reg}
          </AppText>
          <AppText variant="mono" style={s.type}>
            {option.type}
          </AppText>
        </View>
        {option.blocked != null ? (
          <AppText variant="mono" style={s.tag} numberOfLines={1}>
            {option.blocked.reason}
          </AppText>
        ) : selected ? (
          <CheckIcon size={17} color={theme.colors.green} />
        ) : null}
      </View>

      <View style={s.track}>
        {bars.map((bar) => (
          <View
            key={bar.bookingId}
            style={[
              s.busy,
              { left: `${bar.leftPct}%`, width: `${bar.widthPct}%` },
              bar.tone === 'block' ? s.busyBlock : null,
            ]}
          />
        ))}
      </View>

      <AppText variant="mono" style={off ? s.freeOff : s.free} numberOfLines={1}>
        {option.blocked?.until ?? option.free ?? 'brak wolnych godzin'}
      </AppText>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      borderRadius: 13,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 7,
    },
    cardOn: { borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenMuted },
    // Przygaszenie mówi „nie do wyboru"; powód mówi plakietka, a zakres - pasek.
    cardOff: { opacity: 0.55 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    left: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
    reg: { fontSize: 12, lineHeight: 15, letterSpacing: 1.5, color: t.colors.textPrimary },
    type: { fontSize: 8.5, lineHeight: 11, letterSpacing: 1, color: t.colors.textMuted },
    tag: {
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
    // Pasek jest OBRAZKIEM, nie kontrolką: wyboru dokonuje się całą kartą, więc
    // nie ma tu 30 dp rytmu celu dotykowego z osi kalendarza.
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: t.colors.surfaceRaised,
      overflow: 'hidden',
    },
    busy: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      borderRadius: 3,
      backgroundColor: t.colors.surfaceHover,
      borderWidth: 1,
      borderColor: t.colors.borderStrong,
    },
    busyBlock: { backgroundColor: t.colors.amberMuted, borderColor: t.colors.amberBorder },
    free: { fontSize: 8.5, lineHeight: 12, letterSpacing: 0.5, color: t.colors.textMuted },
    freeOff: { fontSize: 8.5, lineHeight: 12, letterSpacing: 0.5, color: t.colors.amber },
  });
