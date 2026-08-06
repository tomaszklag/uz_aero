/**
 * UZ Aero — arkusz wpisu tekstowego z podpowiedziami (oznaczenie klienta, notatka dnia).
 *
 * Ten sam ruch, co przy trasie (issue #14): pole w formularzu jest PRZYCISKIEM
 * z wartością, a wpisywanie dzieje się w arkuszu, który otwiera się razem z klawiaturą.
 * Zysk jest tu jednak inny niż przy lotnisku — nie chodzi o to, żeby było widać
 * przeszukiwanie, tylko o to, żeby pilot NIE MUSIAŁ przepisywać tego samego
 * z pamięci: nad polem stoi lista wartości, których klub i on sam używali ostatnio.
 *
 * PODPOWIEDZI SĄ TYLKO ONLINE — i to jest decyzja, nie brak. Bez zasięgu arkusz działa
 * dokładnie tak jak wcześniej działało pole tekstowe: wpisujesz i potwierdzasz. Lista
 * to wygoda, nie warunek pracy (`CLAUDE.md`: „brak sieci NIGDY nie blokuje pracy pilota"),
 * dlatego jej brak mówi jedno spokojne zdanie zamiast ostrzeżenia — i dlatego nie
 * trzymamy jej w cache, którego i tak nie mielibyśmy jak unieważnić.
 *
 * Tryb `multiline` obsługuje notatkę dnia: to jedyne pole w preflightcie, w którym pilot
 * pisze zdania, a nie kod.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Sheet } from './Sheet';

/** Wiersz listy podpowiedzi: wartość + kontekst („skoki · 5 CZE"). */
export interface TextSuggestion {
  value: string;
  meta: string | null;
}

export interface TextEntrySheetProps {
  visible: boolean;
  title: string;
  initialText: string;
  placeholder?: string;
  /** Notatka dnia — pole na kilka linii zamiast jednej. */
  multiline?: boolean;
  maxLength?: number;
  /** Ostatnio używane wartości; `null` = nie udało się ich pobrać (offline). */
  suggestions: readonly TextSuggestion[] | null;
  suggestionsLabel?: string;
  /** Pusty tekst = wyczyszczenie pola (wołający dostaje `''`). */
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

export function TextEntrySheet({
  visible,
  title,
  initialText,
  placeholder,
  multiline = false,
  maxLength = 200,
  suggestions,
  suggestionsLabel = 'Ostatnio używane',
  onConfirm,
  onCancel,
}: TextEntrySheetProps) {
  const { theme } = useTheme();
  const [text, setText] = useState(initialText);
  const input = useRef<TextInput>(null);

  // Fokus z `Modal.onShow` — patrz `docs/architektura-kodu.md` §2.
  const focusInput = useCallback(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    const id = setTimeout(focusInput, 150);
    return () => clearTimeout(id);
  }, [visible, initialText, focusInput]);

  return (
    <Sheet
      visible={visible}
      title={title}
      onShow={focusInput}
      confirmLabel="ZAPISZ"
      onConfirm={() => onConfirm(text.trim())}
      onCancel={onCancel}
    >
      <TextInput
        ref={input}
        value={text}
        onChangeText={setText}
        multiline={multiline}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={theme.colors.selection}
        cursorColor={theme.colors.textPrimary}
        accessibilityLabel={title}
        // Notatka bywa kilkuzdaniowa, ale arkusz ma sufit wysokości i własne przewijanie
        // (`Sheet`), więc pole rośnie do rozsądnej granicy, a nie w nieskończoność.
        style={{
          minHeight: multiline ? 108 : 48,
          maxHeight: multiline ? 168 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidthStrong,
          borderColor: theme.colors.borderStrong,
          backgroundColor: theme.colors.surface,
          color: theme.colors.textPrimary,
          fontFamily: theme.fontFamily.body,
          fontSize: 15,
          lineHeight: 21,
        }}
      />

      {suggestions == null ? (
        // Brak sieci nie jest tu awarią i nie zasługuje na amber: pole działa bez zmian,
        // tylko bez listy. Jedno zdanie, żeby pilot nie szukał podpowiedzi, których nie ma.
        <AppText variant="mono" tone="muted" style={styles.note}>
          Podpowiedzi wymagają połączenia — wpisz wartość ręcznie
        </AppText>
      ) : suggestions.length === 0 ? null : (
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="mono" tone="muted" style={styles.label}>
            {suggestionsLabel}
          </AppText>
          <View style={{ gap: 6 }}>
            {suggestions.map((row) => (
              <Pressable
                key={row.value}
                accessibilityRole="button"
                accessibilityLabel={row.value}
                onPress={() => onConfirm(row.value)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderRadius: theme.radius.md,
                    borderWidth: theme.borderWidth,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceRaised,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <AppText variant="body" tone="secondary" numberOfLines={2} style={styles.value}>
                  {row.value}
                </AppText>
                {row.meta != null && (
                  <AppText variant="mono" tone="muted" style={styles.meta}>
                    {row.meta}
                  </AppText>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  note: { fontSize: 9, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48, // cel dotykowy dla rękawic
  },
  value: { flex: 1, fontSize: 13 },
  meta: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 },
});
