/**
 * Ninerdeck - AnswerBlock (`.answer` z makiet 28A, 28C): „Twoja odpowiedź".
 *
 * Po odpowiedzi karta zlecenia nie zamyka się bez słowa - zniknięcie pytania wyglądałoby
 * tak samo przy zapisie i przy awarii (reguła „każda akcja zostawia ślad"). Odpowiedź
 * stoi W PIERWSZEJ OSOBIE, bo to cytat Twojego przycisku, a nie status dla innych.
 *
 * Trzy tony:
 *  - `ok`  - „Mogę lecieć" w zieleni z ptaszkiem: odpowiedź, na którą osoba zlecająca czeka;
 *  - `no`  - „Nie mogę" bez koloru: odmowa nikomu niczego nie zabiera;
 *  - `old` - odpowiedź z POPRZEDNIEGO terminu, przekreślona (28C). Nie znika, tylko
 *            przestaje się liczyć - „nie mogę w sobotę o 9" nie mówi nic o sobocie o 10.
 * Powód stoi w cudzysłowie i BEZ przekreślenia: to zdanie, które dalej jest prawdą.
 * Kursywy z makiety nie ma - na Androidzie krój bez wariantu italic podmienia się na
 * systemowy (uwaga przy `CrewCard`); cytat niosą cudzysłowy.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface AnswerBlockProps {
  /** „Mogę lecieć" / „Nie mogę". */
  value: string;
  tone: 'ok' | 'no' | 'old';
  /** „Zgłoszone 21:52 · fotel przydziela Marta Zięba" / „wczoraj 19:14 · poprzedni termin". */
  sub: string;
  /** Powód odmowy - zdanie człowieka, w cudzysłowie. */
  quote?: string | null;
}

export function AnswerBlock({ value, tone, sub, quote = null }: AnswerBlockProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.answer}>
      <View style={s.valueRow}>
        {tone === 'ok' && <Icon name="check" size={14} color={theme.colors.green} />}
        <AppText variant="body" style={[s.value, tone === 'ok' && s.ok, tone === 'old' && s.old]}>
          {value}
        </AppText>
      </View>
      <AppText variant="mono" style={s.sub}>
        {sub}
      </AppText>
      {quote != null && quote.trim() !== '' && (
        <AppText variant="body" style={s.quote}>
          „{quote.trim()}"
        </AppText>
      )}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    answer: { gap: 4, paddingVertical: 12, paddingHorizontal: 13 },
    valueRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    value: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 14, lineHeight: 19, color: t.colors.textPrimary },
    ok: { color: t.colors.green },
    old: {
      fontFamily: t.fontFamily.bodyMedium,
      color: t.colors.textMuted,
      textDecorationLine: 'line-through',
      textDecorationColor: t.colors.textMuted,
    },
    sub: { fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.colors.textMuted },
    quote: { fontSize: 11.5, lineHeight: 17, color: t.colors.textSecondary },
  });
