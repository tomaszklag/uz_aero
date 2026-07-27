/**
 * UZ Aero — ReadingSheet (mockupy 02b „Odczyt paliwa" i 02c „Odczyt motogodzin")
 *
 * Arkusz świadomej korekty odczytu: duża wartość do wpisania, pod nią wiersze
 * odniesienia (co przekazał poprzednik, jaka jest pojemność / format licznika),
 * warunkowe ostrzeżenie o rozbieżności i para akcji Anuluj / Potwierdź.
 *
 * DLACZEGO ARKUSZ, a nie edycja w miejscu: to jest moment, w którym pilot **nadpisuje
 * dane z serwera własnym odczytem z licznika**. Przekazane wartości muszą być widoczne
 * obok wpisywanej (stąd wiersze odniesienia), a rozbieżność ponad próg ma zostać
 * zauważona, zanim trafi do rejestru — nie po fakcie w banerze na dole ekranu.
 *
 * Ostrzeżenie jest **miękkie**: pilot może potwierdzić mimo rozbieżności, bo licznik
 * fizyczny jest prawdą (`CLAUDE.md`). Twarde inwarianty (np. cofnięty licznik) odrzuca
 * dopiero komenda — tutaj ich nie dublujemy.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Sheet, type SheetRow } from './Sheet';
import { toneColors, type Tone } from './tone';

export interface ReadingSheetProps {
  visible: boolean;
  /** „Odczyt paliwa" / „Odczyt motogodzin". */
  title: string;
  unit: string;
  tone?: Tone;
  /** Wartość początkowa, już sformatowana do wyświetlenia. */
  initialText: string;
  /** Wiersze odniesienia pod polem edycji. */
  rows?: SheetRow[];
  /** Tekst → liczba; `null` gdy wpis jest niepoprawny (blokuje potwierdzenie). */
  parse: (text: string) => number | null;
  /** Ostrzeżenie zależne od wpisanej wartości; `null` = brak zastrzeżeń. */
  warningFor?: (value: number) => string | null;
  /** Klawiatura: `decimal` dla litrów i MH dziesiętnych, `text` dla formatu hh:mm. */
  keyboard?: 'decimal' | 'text';
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

export function ReadingSheet({
  visible,
  title,
  unit,
  tone = 'amber',
  initialText,
  rows = [],
  parse,
  warningFor,
  keyboard = 'decimal',
  onConfirm,
  onCancel,
}: ReadingSheetProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const [text, setText] = useState(initialText);
  const input = useRef<TextInput>(null);

  // Każde otwarcie zaczyna od aktualnej wartości — arkusz nie pamięta porzuconej edycji.
  //
  // Fokus ustawiamy sami zamiast przez `autoFocus`: w `Modal` na Androidzie autofokus
  // bywa gubiony, bo pole montuje się, zanim okno modalne skończy animację wejścia.
  // Krótka zwłoka daje oknu dojść do stanu, w którym przyjmuje fokus.
  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    const id = setTimeout(() => input.current?.focus(), 150);
    return () => clearTimeout(id);
  }, [visible, initialText]);

  const parsed = parse(text);
  const warning = parsed != null ? (warningFor?.(parsed) ?? null) : null;

  return (
    <Sheet
      visible={visible}
      title={title}
      rows={rows}
      warning={
        parsed == null
          ? 'Nie rozumiem tej wartości — popraw wpis, żeby móc potwierdzić.'
          : (warning ?? undefined)
      }
      warningTone={parsed == null ? 'red' : 'amber'}
      confirmLabel="POTWIERDŹ"
      onConfirm={() => {
        if (parsed != null) onConfirm(parsed);
      }}
      onCancel={onCancel}
    >
      <View
        style={[
          styles.inputRow,
          {
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderRadius: theme.radius.lg - 2,
            borderWidth: theme.borderWidthStrong,
            borderColor: parsed == null ? toneColors(theme, 'red').border : theme.colors.borderStrong,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          keyboardType={keyboard === 'decimal' ? 'decimal-pad' : 'default'}
          selectTextOnFocus
          selectionColor={c.accent}
          accessibilityLabel={title}
          style={{
            flex: 1,
            padding: 0,
            fontFamily: theme.fontFamily.monoBold,
            fontSize: 32,
            letterSpacing: 2,
            color: tone === 'neutral' ? theme.colors.textPrimary : c.accent,
          }}
        />
        <AppText variant="mono" tone="secondary" style={styles.unit}>
          {unit}
        </AppText>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unit: { fontSize: 16 },
});
