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
  /**
   * `muted` - przypis pod pasem akcji (26, 28); `summary` - zdanie o skutku NAD
   * przyciskiem, czytane w chwili wysyłania (`.summary`, 31B); `info` - podpis
   * o zleceniu przy osobie (`.seat-hint`, 31B): błękit informacji, nie ostrzeżenie.
   */
  tone?: 'muted' | 'summary' | 'info';
}

export function FootNote({ icon, parts, tone = 'muted' }: FootNoteProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const text = tone === 'muted' ? s.text : tone === 'summary' ? s.summary : s.info;
  const strong = tone === 'muted' ? s.strong : tone === 'summary' ? s.summaryStrong : s.infoStrong;

  return (
    <View style={[s.note, tone !== 'muted' && s.tight]}>
      <Icon name={icon} size={13} color={tone === 'info' ? theme.colors.blue : theme.colors.textMuted} style={s.icon} />
      <AppText variant="body" style={[text, s.block]}>
        {parts.map((part, i) => (
          <AppText key={i} variant="body" style={[text, part.strong === true && strong]}>
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
    tight: { gap: 7, paddingTop: 1, paddingHorizontal: 2 },
    icon: { marginTop: 2 },
    // Układ (`flex`) dostaje tylko zewnętrzny tekst - człony w środku są przęsłami.
    block: { flex: 1 },
    text: { fontSize: 10.5, lineHeight: 15.5, color: t.colors.textMuted },
    strong: { fontFamily: t.fontFamily.bodySemiBold, color: t.colors.textSecondary },
    summary: { fontSize: 11, lineHeight: 16.5, color: t.colors.textSecondary },
    summaryStrong: { fontFamily: t.fontFamily.bodySemiBold, color: t.colors.textPrimary },
    info: { fontSize: 11, lineHeight: 16, color: t.colors.blue },
    infoStrong: { fontFamily: t.fontFamily.bodySemiBold, color: t.colors.blue },
  });
