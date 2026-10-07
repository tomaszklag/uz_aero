/**
 * Ninerdeck - ReadOnlyNote (`.readonly` z makiety 29B): zdanie ZAMIAST pola wiadomości.
 *
 * Pisze wyłącznie autor zlecenia (pkt 20), więc pola tu nie ma - wyszarzone obiecywałoby
 * akcję, której reguły nie dopuszczą (zasada z 10B i 02G). W jego miejscu stoi JEDNO zdanie:
 * kto prowadzi rozmowę albo dlaczego nie da się już pisać. Stopka ma tło i krawędź stopki
 * z polem, żeby było widać, że to miejsce, w którym u uczestników stoi pole.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface ReadOnlyNoteProps {
  parts: readonly { text: string; strong?: boolean }[];
}

export function ReadOnlyNote({ parts }: ReadOnlyNoteProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.note}>
      <Icon name="readers" size={15} color={theme.colors.textMuted} />
      <AppText variant="body" style={[s.text, s.block]}>
        {parts.map((part, i) => (
          <AppText key={i} variant="body" style={[s.text, part.strong === true && s.strong]}>
            {part.text}
          </AppText>
        ))}
      </AppText>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    note: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingTop: 14,
      paddingHorizontal: 16,
      paddingBottom: 14,
      borderTopWidth: t.borderWidth,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.bg,
    },
    // Układ (`flex`) dostaje tylko zewnętrzny tekst - człony w środku są przęsłami.
    block: { flex: 1 },
    text: { fontSize: 11.5, lineHeight: 17, color: t.colors.textSecondary },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    strong: { fontFamily: t.fontFamily.bodySemiBold, color: t.colors.textPrimary },
  });
