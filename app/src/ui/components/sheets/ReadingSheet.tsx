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

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { maskTimeUtcInput } from '../../format';
import { useTheme } from '../../theme';
import { useSheetInputFocus } from '../../hooks/useSheetInputFocus';
import { AppText } from '../foundation/AppText';
import { Sheet, type SheetRow } from './Sheet';
import { toneColors, type Tone } from '../tone';

/**
 * Klawiatura per tryb wpisu. `number-pad` dla godziny: same cyfry, bez paska podpowiedzi
 * i bez znaków, których w „HH:MM" i tak nie użyjemy — dwukropek dokłada maska.
 *
 * Trybu `text` (pełna QWERTY) JUŻ NIE MA. Istniał dla licznika w formacie hh:mm, bo
 * dwukropka nie ma na klawiaturze numerycznej — ale pełna klawiatura zajmuje pół ekranu
 * i podsuwa podpowiedzi słownikowe pod liczbę z tarczy. Dziś separator dokłada maska
 * (`maskMotoHoursInput`), więc wystarcza `decimal-pad` (zgłoszenie z urządzenia,
 * 2026-08-14).
 */
const KEYBOARD_TYPE = {
  decimal: 'decimal-pad',
  time: 'number-pad',
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
   * Klawiatura: `decimal` dla litrów i motogodzin (w OBU formatach licznika),
   * `time` dla godzin „HH:MM" (cyfry + `maskTimeUtcInput`).
   */
  keyboard?: 'decimal' | 'time';
  /**
   * Maska w trakcie pisania — np. `maskMotoHoursInput`, która przyjmuje kropkę,
   * przecinek i dwukropek jako TEN SAM separator i zamienia go na właściwy dla formatu
   * licznika. Dzięki niej pole obsługuje się klawiaturą numeryczną, choć zapis hh:mm
   * wymaga znaku, którego na niej nie ma.
   */
  mask?: (text: string) => string;
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
  mask,
  onConfirm,
  onCancel,
}: ReadingSheetProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const [text, setText] = useState(initialText);
  const { inputRef, onShow } = useSheetInputFocus();
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
  // Każde otwarcie zaczyna od aktualnej wartości — arkusz nie pamięta porzuconej edycji.
  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    // Cała wartość zaznaczona: pierwszy wpis nadpisuje odczyt, zamiast dopisywać się.
    setSelection({ start: 0, end: initialText.length });
  }, [visible, initialText]);

  const change = useCallback(
    (raw: string) => {
      // Maska własna wygrywa; `time` niesie swoją, bo dwukropek godziny stawia arkusz.
      const apply = mask ?? (keyboard === 'time' ? maskTimeUtcInput : null);
      const next = apply ? apply(raw) : raw;
      setText(next);
      // Zaznaczenie z otwarcia jest już zużyte: albo kursor na koniec (maska przestawia
      // znaki, więc natywna pozycja przestaje odpowiadać temu, co widać), albo
      // z powrotem w ręce pola.
      setSelection(apply ? { start: next.length, end: next.length } : undefined);
    },
    [keyboard, mask],
  );

  const parsed = parse(text);
  // Puste pole to nie jest wpis nieczytelny (issue #60 — arkusz dolewki startuje pusty,
  // bo prefill fabrykowałby ilość): zamiast czerwonego „nie rozumiem" bursztynowe
  // wezwanie, a przycisk zostaje bez akcji z podanym powodem (§6 pkt 3).
  const empty = text.trim() === '';
  const warning = parsed != null ? (warningFor?.(parsed) ?? null) : null;

  /** Cyfry: akcent tonu (mockup 02b: `.modal-input-val` = `var(--amber)`). */
  const valueColor = tone === 'neutral' ? theme.colors.textPrimary : c.accent;

  return (
    <Sheet
      visible={visible}
      title={title}
      rows={rows}
      warning={
        empty
          ? 'Wpisz wartość, żeby zapisać.'
          : parsed == null
            ? 'Nie rozumiem tej wartości — popraw wpis, żeby móc potwierdzić.'
            : (warning ?? undefined)
      }
      warningTone={parsed != null ? 'amber' : empty ? 'amber' : 'red'}
      confirmLabel="POTWIERDŹ"
      onConfirm={() => {
        if (parsed != null) onConfirm(parsed);
      }}
      onCancel={onCancel}
      /* Klawiatura od otwarcia — drabinka prób z `useSheetInputFocus` (issue #58
         pkt 7, druga tura: pojedynczy focus w onShow bywał nadal za wcześnie). */
      onShow={onShow}
    >
      <View
        style={[
          styles.inputRow,
          {
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderRadius: theme.radius.lg - 2,
            borderWidth: theme.borderWidthStrong,
            borderColor:
              parsed == null && !empty
                ? toneColors(theme, 'red').border
                : theme.colors.borderStrong,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
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
