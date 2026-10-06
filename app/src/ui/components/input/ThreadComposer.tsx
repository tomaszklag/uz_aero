/**
 * Ninerdeck - ThreadComposer (`.composer` z makiet 29, 29A): pole wiadomości w rozmowie.
 *
 * ══ ZDANIE O JAWNOŚCI STOI NAD POLEM NA STAŁE (pkt 19) ══
 * To skutek dla piszącego - to, co tu napisze, przeczyta też koordynator lotów - a nie
 * opis budowy aplikacji. Ta sama kategoria, co „zapis zostaje w rejestrze i widzi go
 * administrator" przy usuwaniu lotu (10L).
 *
 * ══ POLE I WYŚLIJ TO JEDNA KONTROLKA (issue #55) ══
 * WYŚLIJ przy pustym polu jest wygaszony BEZ zdania - puste pole widać tuż obok. Bez
 * połączenia (29A) powód stoi W ŚRODKU pola, bursztynem, krojem powodu z przycisków: kwadrat
 * WYŚLIJ ma 44 px i zdania w nim nie da się zmieścić, a napis doklejony pod stopką skakałby
 * razem ze stanem. Pole nie przyjmuje wtedy wpisu - kolejki wiadomości na później nie ma
 * (§2.2) - ale szkic wpisany wcześniej zostaje przygaszony, z powodem pod nim. Odmowa
 * serwera (rozmowa zamknięta, wiadomość za długa) stoi w tym samym miejscu.
 */

import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface ThreadComposerProps {
  /** „Rozmowę widzą też koordynatorzy lotów klubu." */
  visibility: string;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Wysyłka w toku - WYŚLIJ czeka na odpowiedź. */
  sending: boolean;
  /** Bez połączenia - pole nie przyjmuje wpisu, powód stoi w nim (29A). */
  offlineReason: string | null;
  /** Odmowa ostatniej wysyłki - pod wpisem, w tym samym polu. */
  refusal: string | null;
  maxLength: number;
}

export function ThreadComposer({
  visibility,
  value,
  onChangeText,
  onSend,
  sending,
  offlineReason,
  refusal,
  maxLength,
}: ThreadComposerProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const off = offlineReason != null;
  const reason = offlineReason ?? refusal;
  const canSend = !off && !sending && value.trim() !== '';

  return (
    <View style={s.composer}>
      <View style={s.visibility}>
        <Icon name="readers" size={12} color={theme.colors.textMuted} />
        <AppText variant="body" style={s.visibilityText}>
          {visibility}
        </AppText>
      </View>

      <View style={s.row}>
        <View style={[s.field, off && s.fieldOff]}>
          {off && value.trim() === '' ? null : (
            <TextInput
              value={value}
              onChangeText={onChangeText}
              editable={!off}
              multiline
              maxLength={maxLength}
              placeholder="Napisz wiadomość…"
              placeholderTextColor={theme.colors.textPlaceholder}
              selectionColor={theme.colors.selection}
              cursorColor={theme.colors.textPrimary}
              accessibilityLabel="Wiadomość"
              style={[s.input, off && s.inputOff]}
            />
          )}
          {reason != null && (
            <View style={s.reasonRow}>
              {off && <Icon name="offline" size={13} color={theme.colors.amber} />}
              <AppText variant="mono" style={s.reason}>
                {reason}
              </AppText>
            </View>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wyślij"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={onSend}
          style={({ pressed }) => [s.send, canSend ? s.sendOn : s.sendOff, pressed && canSend && { opacity: 0.8 }]}
        >
          <Icon name="send" size={17} color={canSend ? theme.colors.bg : theme.colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    composer: {
      gap: 7,
      paddingTop: 8,
      paddingHorizontal: 12,
      paddingBottom: 10,
      borderTopWidth: t.borderWidth,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.bg,
    },
    visibility: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
    visibilityText: { flex: 1, fontSize: 10, lineHeight: 14, color: t.colors.textMuted },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    field: {
      flex: 1,
      minHeight: 44,
      justifyContent: 'center',
      gap: 4,
      borderRadius: t.radius.btn,
      borderWidth: t.borderWidth,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.surfaceRaised,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    // Wyłączenie niosą kolory (tło karty, zwykła ramka), nie przezroczystość -
    // bursztyn powodu pod opacity przestaje być ostrzeżeniem.
    fieldOff: { borderColor: t.colors.border, backgroundColor: t.colors.surface },
    input: { maxHeight: 120, paddingVertical: 4, fontFamily: t.fontFamily.body, fontSize: 13, lineHeight: 18, color: t.colors.textPrimary },
    inputOff: { color: t.colors.textMuted },
    reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    reason: { flexShrink: 1, fontSize: 9, lineHeight: 13.5, letterSpacing: 1, textTransform: 'uppercase', color: t.colors.amber },
    send: { width: 44, height: 44, borderRadius: t.radius.btn, alignItems: 'center', justifyContent: 'center', borderWidth: t.borderWidth },
    sendOn: { borderColor: t.colors.green, backgroundColor: t.colors.green },
    sendOff: { borderColor: t.colors.border, backgroundColor: t.colors.surface, opacity: 0.6 },
  });
