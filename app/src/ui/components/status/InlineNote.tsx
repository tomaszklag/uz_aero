/**
 * UZ Aero — InlineNote (`.certified-row` / `.none-box` z mockupu 02a)
 *
 * Zwięzła adnotacja w kolorowym pudełku: ikona + jedna–trzy linie tekstu mono 10 px.
 *
 * Czym różni się od `Banner`: baner ma tytuł, tekst body 14 px i miejsce w taksonomii
 * (`status` / `warning` / `edu`) — to komunikat o stanie ekranu. `InlineNote` jest
 * przypisem do sąsiadującej wartości („Odczyty powyżej przekazał J. Kowalski…").
 * Użycie banera w tej roli rozpychałoby ekran i podnosiło rangę informacji ponad to,
 * co niesie.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors, type Tone } from '../tone';

export interface InlineNoteProps {
  icon: IconName;
  /**
   * Treść. Znak nowej linii dzieli ją na AKAPITY: każdy dostaje własną linię i odstęp
   * większy niż interlinia, a pierwszy — pogrubienie (odpowiednik `<b>` z mockupu).
   *
   * Powód: przypis urósł z jednego zdania do wyjaśnienia „czyje to liczby · z kiedy ·
   * co z nimi zrobić" i w jednym bloku mono 10 px zlewał się w ścianę tekstu, przez
   * którą trzeba było się przedzierać, żeby znaleźć godzinę (zgłoszenie z urządzenia).
   * Podział robi wołający — on wie, gdzie kończy się myśl.
   */
  text: string;
  tone?: Tone;
  style?: ViewStyle;
}

export function InlineNote({ icon, text, tone = 'green', style }: InlineNoteProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const paragraphs = text.split('\n').filter((line) => line.trim().length > 0);

  return (
    <View
      style={[
        styles.box,
        {
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: theme.radius.sm,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <Icon name={icon} size={13} color={c.accent} style={styles.icon} />
      <View style={styles.body}>
        {paragraphs.map((paragraph, index) => (
          <AppText
            key={paragraph}
            variant="mono"
            style={{
              fontSize: 10,
              lineHeight: 15,
              color: c.accent,
              // Wiodący akapit pogrubiony tylko wtedy, gdy JEST co prowadzić —
              // jednozdaniowe przypisy zostają takie, jak były.
              ...(index === 0 && paragraphs.length > 1
                ? { fontFamily: theme.fontFamily.monoBold }
                : null),
            }}
          >
            {paragraph}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start' },
  icon: { marginTop: 1 },
  // Odstęp między akapitami większy niż interlinia — inaczej podział nie byłby widoczny.
  body: { flex: 1, gap: 5 },
});
