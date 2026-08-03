/**
 * UZ Aero — NoGpsBanner (`.no-gps` / `.no-gps-link` z mockupu 05g-cockpit-no-gps)
 *
 * Baner typu STATUS (przyrząd): nie zamyka się ręcznie, znika sam z pierwszym
 * świeżym fixem. Czerwień, bo w locie niezauważony brak fixa to niezapisane
 * lądowanie (ryzyko 🔴 z §8). Dwie akcje to dwie skale problemu: chwilowa dziura
 * → arkusz 05f (jedno zdarzenie), GPS milczy dłużej → lista ręczna 08.
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
  /** Treść pod nagłówkiem — czas i wiek ostatniego fixa (`gpsLossText`). */
  text: string;
  /** Chwilowa dziura: zapis jednego zdarzenia przez arkusz 05f. */
  onManualEvent: () => void;
  /** GPS milczy dłużej: przejście do pełnej listy ręcznej (08). */
  onManualList: () => void;
}

export function NoGpsBanner({ text, onManualEvent, onManualList }: NoGpsBannerProps) {
  const { theme } = useTheme();

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: theme.borderWidth,
        borderColor: theme.colors.redBorder,
        backgroundColor: theme.colors.redMuted,
        paddingVertical: 11,
        paddingHorizontal: 13,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.red }}
        />
        <AppText
          variant="mono"
          style={{ flex: 1, fontSize: 11, fontFamily: theme.fontFamily.monoBold, color: theme.colors.red, letterSpacing: 0.5 }}
        >
          GPS: brak sygnału · autodetekcja wstrzymana
        </AppText>
      </View>
      <AppText variant="body" tone="secondary" style={{ fontSize: 11, lineHeight: 16.5 }}>
        {text}
      </AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <NoGpsLink label="Zapisz zdarzenie" icon="edit" onPress={onManualEvent} />
        <NoGpsLink label="Lista ręczna" icon="manual-log" onPress={onManualList} />
      </View>
    </View>
  );
}

/** `.no-gps-link` — pigułkowe wejścia akcji ratunkowych na banerze. Celowo prywatny:
 *  to część odpowiedzialności banera, nie samodzielny wzorzec DS. */
function NoGpsLink({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: 'edit' | 'manual-log';
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
        borderColor: theme.colors.redBorder,
        backgroundColor: pressed ? theme.colors.redMuted : theme.colors.surface,
      })}
    >
      <Icon name={icon} size={12} color={theme.colors.red} />
      <AppText variant="mono" style={{ fontSize: 10, color: theme.colors.red, letterSpacing: 0.5 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
