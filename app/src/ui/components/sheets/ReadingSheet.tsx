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
 *
 * Ten sam arkusz obsługuje GODZINY duty (meldunek na 02, zakończenie na 09) w trybie
 * `keyboard="time"`: tam „odniesieniem" jest bieżąca godzina i dzień lotny, a wpisywana
 * wartość to cztery cyfry, które maska składa w „HH:MM".
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { maskTimeUtcInput } from '../../format';
import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Sheet, type SheetRow } from './Sheet';
import { toneColors, type Tone } from '../tone';

/**
 * Klawiatura per tryb wpisu. `number-pad` dla godziny: same cyfry, bez paska podpowiedzi
 * i bez znaków, których w „HH:MM" i tak nie użyjemy — dwukropek dokłada maska.
 */
const KEYBOARD_TYPE = {
  decimal: 'decimal-pad',
  time: 'number-pad',
  text: 'default',
} as const;

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
  /**
   * Klawiatura: `decimal` dla litrów i MH dziesiętnych, `time` dla godzin „HH:MM"
   * (cyfry + maska, patrz `maskTimeUtcInput`), `text` dla licznika w formacie hh:mm,
   * gdzie liczba cyfr godzin jest dowolna i dwukropek stawia pilot.
   */
  keyboard?: 'decimal' | 'text' | 'time';
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
  /**
   * Zaznaczenie STEROWANE przy otwarciu, nie `selectTextOnFocus`.
   *
   * Android z `selectAllOnFocus` odnawia zaznaczenie przy każdym programowym ustawieniu
   * tekstu — a wartość tego pola jest sterowana, więc każdy znak przechodzi przez JS
   * i wraca do widoku. Skutek na urządzeniu: pierwsza wpisana cyfra znów była zaznaczona
   * i druga ją wymazywała; dopiero trzecia trafiała tam, gdzie pilot celował.
   *
   * Dlatego zaznaczamy całość sami — jeden raz, przy otwarciu — a potem oddajemy kursor
   * (`undefined` = pole nim rządzi). Wyjątek: przy masce godziny dosuwamy kursor na koniec,
   * bo maska przestawia znaki (dwukropek wjeżdża przed ostatnią cyfrę) i natywna pozycja
   * przestaje odpowiadać temu, co pilot widzi.
   */
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>({
    start: 0,
    end: initialText.length,
  });
  const input = useRef<TextInput>(null);

  // Każde otwarcie zaczyna od aktualnej wartości — arkusz nie pamięta porzuconej edycji.
  //
  // Fokus ustawiamy sami zamiast przez `autoFocus`: w `Modal` na Androidzie autofokus
  // bywa gubiony, bo pole montuje się, zanim okno modalne skończy animację wejścia.
  // Krótka zwłoka daje oknu dojść do stanu, w którym przyjmuje fokus.
  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    // Cała wartość zaznaczona: pierwszy wpis nadpisuje odczyt, zamiast dopisywać się.
    setSelection({ start: 0, end: initialText.length });
    const id = setTimeout(() => input.current?.focus(), 150);
    return () => clearTimeout(id);
  }, [visible, initialText]);

  const change = useCallback(
    (raw: string) => {
      const masked = keyboard === 'time';
      const next = masked ? maskTimeUtcInput(raw) : raw;
      setText(next);
      // Zaznaczenie z otwarcia jest już zużyte: albo kursor na koniec (maska), albo
      // z powrotem w ręce pola.
      setSelection(masked ? { start: next.length, end: next.length } : undefined);
    },
    [keyboard],
  );

  const parsed = parse(text);
  const warning = parsed != null ? (warningFor?.(parsed) ?? null) : null;

  /** Cyfry: akcent tonu (mockup 02b: `.modal-input-val` = `var(--amber)`). */
  const valueColor = tone === 'neutral' ? theme.colors.textPrimary : c.accent;

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
          onChangeText={change}
          keyboardType={KEYBOARD_TYPE[keyboard]}
          // Patrz nota przy `selection`. Bez `onSelectionChange` z rozmysłem: kursor
          // postawiony palcem zostaje, gdzie pilot go postawił, bo tapnięcie nie
          // przerysowuje pola — a sterowana pozycja nie zależy od kolejności zdarzeń.
          selection={selection}
          // Podkładka zaznaczenia neutralna (`colors.selection`) — akcent w tym samym
          // odcieniu co cyfry dawał jednolity prostokąt zamiast czytelnego zaznaczenia.
          selectionColor={theme.colors.selection}
          // Kursor i uchwyty w pełnym kryciu tonu — jak migający `.modal-cursor` w 02b.
          cursorColor={c.accent}
          selectionHandleColor={c.accent}
          accessibilityLabel={title}
          style={{
            flex: 1,
            padding: 0,
            fontFamily: theme.fontFamily.monoBold,
            fontSize: 32,
            letterSpacing: 2,
            color: valueColor,
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
