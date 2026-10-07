/**
 * Ninerdeck - ThreadRow (`.thread-row` z makiet 28–28C, 23F): wejście w rozmowę.
 *
 * Wątek jest drogą do NEGOCJACJI („mogę dopiero o 14"), a nie akcją główną ekranu - tą
 * jest odpowiedź. Dlatego to wiersz karty z szewronem, a nie trzeci przycisk w pasie
 * akcji. Bez wiadomości mówi, do kogo napiszesz; stan pusty nie dostaje zdania.
 *
 * Kropka na ikonie i błękitny podpis WYŁĄCZNIE przy nowej wiadomości - ten sam znak,
 * co przy wierszu listy (30) i przy adresacie na 32. Treści wiadomości wiersz nie
 * powtarza: od tego jest rozmowa.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface ThreadRowProps {
  /** „Napisz wiadomość" / „Rozmowa · Marta Zięba". */
  title: string;
  /** „Marta Zięba · zleca" / „1 nowa wiadomość · 07:31" / „do odczytu". */
  sub: string;
  unread?: boolean;
  onPress: () => void;
}

export function ThreadRow({ title, sub, unread = false, onPress }: ThreadRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
    >
      <View style={s.icon}>
        <Icon name="message" size={15} color={theme.colors.textSecondary} />
        {unread && <View style={s.dot} />}
      </View>
      <View style={s.body}>
        <AppText variant="body" style={s.title}>
          {title}
        </AppText>
        <AppText variant="mono" style={[s.sub, unread && s.subNew]}>
          {sub}
        </AppText>
      </View>
      <AppText variant="mono" style={s.go}>
        ›
      </AppText>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 13 },
    pressed: { backgroundColor: t.colors.surfaceRaised },
    icon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.surfaceRaised,
    },
    // Kropka 8 px z pierścieniem w kolorze karty (`box-shadow: 0 0 0 2px` w makiecie) -
    // w RN pierścień jest obramowaniem, więc całość ma 12 px i stoi o 2 px dalej.
    dot: {
      position: 'absolute',
      top: -5,
      right: -5,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: t.colors.surface,
      backgroundColor: t.colors.blue,
    },
    body: { flex: 1, minWidth: 0, gap: 2 },
    title: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 13, lineHeight: 17, color: t.colors.textPrimary },
    sub: { fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.colors.textMuted },
    subNew: { color: t.colors.blue },
    go: { width: 14, fontSize: 15, textAlign: 'center', color: t.colors.textMuted },
  });
