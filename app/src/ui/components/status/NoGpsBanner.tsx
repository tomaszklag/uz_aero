/**
 * UZ Aero — NoGpsBanner (`.no-gps` / `.no-gps-link` z mockupu 05g-cockpit-no-gps)
 *
 * Baner typu STATUS (przyrząd): nie zamyka się ręcznie, znika sam z pierwszym
 * świeżym fixem. Czerwień, bo w locie niezauważony brak fixa to niezapisane
 * lądowanie (ryzyko 🔴 z §8). Dwie akcje to dwie skale problemu: chwilowa dziura
 * → arkusz 05f (jedno zdarzenie), GPS milczy dłużej → lista ręczna 08.
 *
 * Ton `amber` (decyzja UX 2026-08-04, doprecyzowanie 05g): zimny rozruch odbiornika
 * po START ENGINE to nie awaria — czerwień w pierwszej sekundzie każdego cyklu
 * uczyłaby pilota ignorować czerwień. Amber = „szukam nieba", czerwień = „fixy
 * były i umilkły" albo „brak uprawnienia".
 *
 * Degradacja CZUJNIKA to osobna oś od sieci — baner może wisieć obok zielonego
 * SyncChipa i to nie jest sprzeczność.
 */

import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface NoGpsBannerProps {
  /** Nagłówek mono — domyślnie utrata sygnału (05g). */
  title?: string;
  /** Treść pod nagłówkiem — czas i wiek ostatniego fixa (`gpsLossText`). */
  text: string;
  /** `red` = utrata/uprawnienia (05g), `amber` = rozruch odbiornika. */
  tone?: 'red' | 'amber';
  /** Chwilowa dziura: zapis jednego zdarzenia przez arkusz 05f. */
  onManualEvent: () => void;
  /** GPS milczy dłużej: przejście do pełnej listy ręcznej (08). */
  onManualList: () => void;
}

export function NoGpsBanner({
  title = 'GPS: brak sygnału · autodetekcja wstrzymana',
  text,
  tone = 'red',
  onManualEvent,
  onManualList,
}: NoGpsBannerProps) {
  const { theme } = useTheme();
  const accent = tone === 'amber' ? theme.colors.amber : theme.colors.red;
  const border = tone === 'amber' ? theme.colors.amberBorder : theme.colors.redBorder;
  const muted = tone === 'amber' ? theme.colors.amberMuted : theme.colors.redMuted;

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: theme.borderWidth,
        borderColor: border,
        backgroundColor: muted,
        paddingVertical: 11,
        paddingHorizontal: 13,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
        <AppText
          variant="mono"
          style={{ flex: 1, fontSize: 11, fontFamily: theme.fontFamily.monoBold, color: accent, letterSpacing: 0.5 }}
        >
          {title}
        </AppText>
      </View>
      <AppText variant="body" tone="secondary" style={{ fontSize: 11, lineHeight: 16.5 }}>
        {text}
      </AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <NoGpsLink label="Zapisz zdarzenie" icon="edit" accent={accent} border={border} muted={muted} onPress={onManualEvent} />
        <NoGpsLink label="Lista ręczna" icon="manual-log" accent={accent} border={border} muted={muted} onPress={onManualList} />
      </View>
    </View>
  );
}

/** `.no-gps-link` — pigułkowe wejścia akcji ratunkowych na banerze. Celowo prywatny:
 *  to część odpowiedzialności banera, nie samodzielny wzorzec DS. */
function NoGpsLink({
  label,
  icon,
  accent,
  border,
  muted,
  onPress,
}: {
  label: string;
  icon: 'edit' | 'manual-log';
  accent: string;
  border: string;
  muted: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 11,
        borderRadius: theme.radius.sm,
        borderWidth: theme.borderWidth,
        borderColor: border,
        backgroundColor: pressed ? muted : theme.colors.surface,
      })}
    >
      <Icon name={icon} size={12} color={accent} />
      <AppText variant="mono" style={{ fontSize: 10, color: accent, letterSpacing: 0.5 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
