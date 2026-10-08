/**
 * Ninerdeck - EditedLine (`.edited` z makiet 28A, 28C): stopka karty „Zlecenie".
 *
 * Mówi, CO się zmieniło i kiedy - BEZ nazwiska zmieniającego (pkt 31): kto, widzą
 * prowadzący w historii zmian (32). Zmiana inna niż termin nie prosi o nową odpowiedź,
 * więc linijka nie ma koloru ostrzeżenia; zmianę terminu (28C) mówi innym słowem
 * („Termin zmieniony"), bo ta jedna zaczyna odpowiedzi od nowa.
 *
 * Ołówek jest tu GLIFEM „zmieniono", nie akcją - nic w tej linii nie jest celem dotknięcia.
 * Pogrubione człony (`strong`) to nazwy zmienionych pól i nowa wartość terminu.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface EditedLineProps {
  parts: readonly { text: string; strong?: boolean }[];
}

export function EditedLine({ parts }: EditedLineProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.line}>
      <Icon name="edited" size={11} color={theme.colors.textMuted} />
      <AppText variant="mono" style={[s.text, s.block]}>
        {parts.map((part, i) => (
          <AppText key={i} variant="mono" style={[s.text, part.strong === true && s.strong]}>
            {part.text}
          </AppText>
        ))}
      </AppText>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    line: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 13 },
    // Układ (`flexShrink`) dostaje tylko zewnętrzny tekst - człony w środku są przęsłami.
    block: { flexShrink: 1 },
    text: { fontSize: 9, lineHeight: 13, letterSpacing: 0.5, color: t.colors.textSecondary },
    strong: { fontFamily: t.fontFamily.monoMedium, color: t.colors.textPrimary },
  });
