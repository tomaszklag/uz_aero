/**
 * Ninerdeck - OrderStrip (`.order-strip` z makiet 29, 29A, 29B): zlecenie nad rozmową.
 *
 * Rozmowa jest ZAWSZE o jednym zleceniu, więc jego skrót stoi przypięty nad wiadomościami
 * i prowadzi do karty - bez niego „mogę dopiero o 14" nie miałoby punktu odniesienia po
 * przewinięciu. Termin czasem klubu, jak w kalendarzu; druga linia mówi, na jaki fotel
 * (adresat) albo przez co zlecenie trafiło do tej osoby (autor, czytelnik).
 *
 * Błękitna ramka, bo to zlecenie - rzecz, która się dzieje (wzorzec hero 28). Gradient
 * z makiety bez modułu natywnego zostaje samą ramką.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';

export interface OrderStripProps {
  /** „SP-AXA · sob 3 PAŹ · 10:00-12:00". */
  top: string;
  /** „Przelot EPKK → EPRJ · Twój fotel: dowódca". */
  sub: string | null;
  onPress: () => void;
}

export function OrderStrip({ top, sub, onPress }: OrderStripProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub == null ? `Zlecenie ${top}` : `Zlecenie ${top}, ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [s.strip, pressed && { opacity: 0.7 }]}
    >
      <View style={s.main}>
        <AppText variant="mono" style={s.top} numberOfLines={1}>
          {top}
        </AppText>
        {sub != null && (
          <AppText variant="mono" style={s.sub} numberOfLines={2}>
            {sub}
          </AppText>
        )}
      </View>
      <AppText variant="mono" style={s.go}>
        ›
      </AppText>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    strip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
      marginHorizontal: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: t.radius.md,
      borderWidth: t.borderWidth,
      borderColor: t.colors.blueBorder,
      backgroundColor: t.colors.surface,
    },
    main: { flex: 1, minWidth: 0, gap: 2 },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    top: { fontFamily: t.fontFamily.monoBold, fontSize: 11.5, lineHeight: 15, letterSpacing: 1, color: t.colors.textPrimary },
    sub: { fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.colors.textMuted },
    go: { width: 14, fontSize: 15, textAlign: 'center', color: t.colors.textMuted },
  });
