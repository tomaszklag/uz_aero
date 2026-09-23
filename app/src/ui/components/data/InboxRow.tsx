/**
 * Ninerdeck - InboxRow (`.n` z makiety 25, 3.1.0, epik R-I).
 *
 * Wiersz skrzynki: ikona w tonie rodzaju, treść (tytuł, termin, powód, plakietka sprawy)
 * i wiek po prawej. Dwa znaki stanu i oba celowo różne:
 *  - NOWE od ostatniego wejścia to KRAWĘDŹ przy brzegu (zielona linia + mocniejszy
 *    obrys), nie wyróżnione tło - wiersz ma zostać wierszem, a tło niosłoby stan
 *    mocniej niż samą treść;
 *  - DO DECYZJI to plakietka przy treści - jedyna zielona rzecz w tej liście i dlatego
 *    widoczna; świeci wyłącznie tam, gdzie coś od pilota ZALEŻY (reguła SyncChipa).
 * Przeczytane BLEDNIE, ale nie znika: skrzynka jest też miejscem, w którym sprawdza
 * się, co ktoś odpowiedział trzy dni temu.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import type { InboxRowVm, InboxTone } from '../../screens/logic/inbox';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { Tag } from '../status/Tag';
import { toneColors, type Tone } from '../tone';

export interface InboxRowProps {
  row: InboxRowVm;
  onPress?: () => void;
}

const ICON: Record<InboxTone, IconName> = {
  ask: 'clock',
  ok: 'check',
  no: 'clear',
  warn: 'warning',
  info: 'info',
};

const TONE: Record<InboxTone, Tone> = {
  ask: 'blue',
  ok: 'green',
  no: 'red',
  warn: 'amber',
  info: 'neutral',
};

export function InboxRow({ row, onPress }: InboxRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const c = toneColors(theme, TONE[row.tone]);

  return (
    <Pressable
      accessibilityRole={onPress == null ? undefined : 'button'}
      accessibilityLabel={`${row.title}${row.sub == null ? '' : `, ${row.sub}`}, ${row.when}`}
      disabled={onPress == null}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        row.isNew && s.rowNew,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {row.isNew && <View style={s.edge} />}

      <View style={[s.icon, { borderColor: c.border, backgroundColor: c.muted }]}>
        <Icon name={ICON[row.tone]} size={15} color={c.accent} />
      </View>

      <View style={s.body}>
        <AppText variant="body" style={[s.title, !row.isNew && s.titleRead]}>
          {row.title}
        </AppText>
        {row.sub != null && (
          <AppText variant="mono" style={s.sub}>
            {row.sub}
          </AppText>
        )}
        {row.reason != null && (
          <AppText variant="body" style={s.reason}>
            {row.reason}
          </AppText>
        )}
        {row.todo && <Tag label="Do decyzji" tone="green" size="sm" />}
      </View>

      <AppText variant="mono" style={s.when}>
        {row.when}
      </AppText>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingTop: 11,
      paddingBottom: 11,
      paddingLeft: 11,
      paddingRight: 12,
      borderRadius: 12,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      overflow: 'hidden',
    },
    rowNew: { borderColor: t.colors.borderStrong },
    edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, backgroundColor: t.colors.green },
    icon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      flexShrink: 0,
    },
    body: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },
    title: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: t.colors.textPrimary },
    titleRead: { fontWeight: '500', color: t.colors.textSecondary },
    // Odstęp mniejszy niż w innych podpisach mono: termin to znak, data i para godzin,
    // czyli najdłuższy napis w tej liście - przy 1 px łamał się na dwie linie.
    sub: { fontSize: 9.5, lineHeight: 13, letterSpacing: 0.5, textTransform: 'uppercase', color: t.colors.textMuted },
    reason: { fontSize: 11, lineHeight: 16.5, color: t.colors.textSecondary },
    when: { fontSize: 9, lineHeight: 12, letterSpacing: 1, color: t.colors.textMuted, paddingTop: 2, flexShrink: 0 },
  });
