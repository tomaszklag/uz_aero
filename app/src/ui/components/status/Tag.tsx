/**
 * UZ Aero — Tag
 *
 * Mała etykieta mono UPPERCASE z mockupów: `.optional-tag`, `.required-tag`,
 * `.grounded-tag`, `.pic-lock-tag`, `.step-badge`, `.role-badge`. Wszystkie mają ten sam
 * kształt — różnią się wyłącznie tonem i rozmiarem, więc to jeden komponent.
 *
 * Czym różni się od `StatusChip`: chip to **stan sesji** (pill z kropką, tekst 13 px,
 * czytany z drugiego końca kokpitu — GROUND, RUNNING, dane z cache). Tag to **przypis
 * do pozycji listy albo nagłówka** (8–11 px, prostokątny, bez kropki): „PIC: KRZ · od 07:10",
 * „opcjonalne", „1 / 3". Zlanie ich w jedno dałoby albo za duże chipy w liście samolotów,
 * albo nieczytelne statusy w kokpicie.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors, type Tone } from '../tone';

export type TagSize = 'sm' | 'md';

export interface TagProps {
  label: string;
  tone?: Tone;
  /** `sm` = przypis w wierszu listy (8 px), `md` = badge nagłówka (11 px). */
  size?: TagSize;
  /**
   * Ikona przed napisem — dla plakietek, które muszą być czytelne kątem oka
   * (stan wysyłki na karcie sesji, mockup 12). Bez niej tag zostaje samym tekstem.
   */
  icon?: IconName;
  style?: ViewStyle;
}

export function Tag({ label, tone = 'neutral', size = 'sm', icon, style }: TagProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const small = size === 'sm';

  return (
    <View
      style={[
        styles.tag,
        {
          paddingHorizontal: small ? 6 : 10,
          paddingVertical: small ? 2 : 4,
          borderRadius: small ? 4 : theme.radius.sm,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      {icon != null && <Icon name={icon} size={small ? 9 : 12} color={c.accent} />}
      <AppText
        variant="mono"
        style={{
          color: c.accent,
          fontSize: small ? 8 : 11,
          lineHeight: small ? 12 : 15,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
