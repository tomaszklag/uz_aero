/**
 * Ninerdeck - FootNote (`.foot-note` z makiet 26, 28, 28A, 28C): jedno zdanie o SKUTKU
 * tapnięcia, pod pasem akcji i raz.
 *
 * Przypis do przycisków, nie baner: bez tła i bez ramki, mniejszym stopniem. Mówi, co
 * się stanie po tapnięciu („Po przyjęciu lot jest Twoją rezerwacją…"), zanim pilot
 * uzna, że już leci - a nie jak zbudowana jest aplikacja (kategoria przypisów, którą
 * issue #43 i #72 wyrzuciły z ekranów).
 *
 * Pogrubiony człon (`strong`) niesie sedno zdania - jeden na przypis.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';

export interface FootNoteProps {
  icon: IconName;
  parts: readonly { text: string; strong?: boolean }[];
}

export function FootNote({ icon, parts }: FootNoteProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.note}>
      <Icon name={icon} size={13} color={theme.colors.textMuted} style={s.icon} />
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
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 2, paddingHorizontal: 4 },
    icon: { marginTop: 2 },
    // Układ (`flex`) dostaje tylko zewnętrzny tekst - człony w środku są przęsłami.
    block: { flex: 1 },
    text: { fontSize: 10.5, lineHeight: 15.5, color: t.colors.textMuted },
    strong: { fontFamily: t.fontFamily.bodySemiBold, color: t.colors.textSecondary },
  });
