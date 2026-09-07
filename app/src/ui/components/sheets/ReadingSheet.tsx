/**
 * UZ Aero - ReadingSheet (mockupy 02b „Odczyt paliwa" i 02c „Odczyt motogodzin")
 *
 * Arkusz świadomej korekty odczytu: duża wartość do wpisania, pod nią wiersze
 * odniesienia (co przekazał poprzednik, jaka jest pojemność / format licznika),
 * warunkowe ostrzeżenie o rozbieżności i para akcji Anuluj / Potwierdź.
 *
 * DLACZEGO ARKUSZ, a nie edycja w miejscu: to jest moment, w którym pilot **nadpisuje
 * dane z serwera własnym odczytem z licznika**. Przekazane wartości muszą być widoczne
 * obok wpisywanej (stąd wiersze odniesienia), a rozbieżność ponad próg ma zostać
 * zauważona, zanim trafi do rejestru - nie po fakcie w banerze na dole ekranu.
 *
 * Ostrzeżenie jest **miękkie**: pilot może potwierdzić mimo rozbieżności, bo licznik
 * fizyczny jest prawdą (`CLAUDE.md`). Twarde inwarianty (np. cofnięty licznik) odrzuca
 * dopiero komenda - tutaj ich nie dublujemy.
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
import type { TrailRow } from '../readouts/Trail';
import { Sheet, type SheetRow } from './Sheet';
import { cursorAtEnd, selectionApplied, type SelectionRange } from './sheetSelection';
import { VALUE_FIELD } from './valueFieldMetrics';
import { toneColors, type Tone } from '../tone';

/**
 * Klawiatura per tryb wpisu. `number-pad` dla godziny: same cyfry, bez paska podpowiedzi
 * i bez znaków, których w „HH:MM" i tak nie użyjemy - dwukropek dokłada maska.
 *
 * Trybu `text` (pełna QWERTY) JUŻ NIE MA. Istniał dla licznika w formacie hh:mm, bo
 * dwukropka nie ma na klawiaturze numerycznej - ale pełna klawiatura zajmuje pół ekranu
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
  /**
   * Szlak podpowiedzi (historia odczytu: tankowania, loty, przejęcie) - rysuje go
   * RAMA między ostrzeżeniem a wierszami (uwaga z urządzenia, 2026-09-02: „podobnie
   * przenieśmy informacje o odczytach paliwa i motogodzin do popupów" - sekcje 02A
   * zostają przy samym stanie, historia mieszka tam, gdzie się z nią porównuje).
   */
  trail?: TrailRow[];
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
   * Maska w trakcie pisania - np. `maskMotoHoursInput`, która przyjmuje kropkę,
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
  trail = [],
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
   * Zaznaczenie STEROWANE przy otwarciu, nie `selectTextOnFocus` (ono odnawia
   * zaznaczenie przy każdym programowym ustawieniu sterowanego tekstu - druga wpisana
   * cyfra wymazywała pierwszą) - a pozycją jest KURSOR NA KOŃCU, nie zaznaczenie
   * całości: sterowany select-all trzymany do pierwszej cyfry przywracał się przy
   * każdym odświeżeniu pola i nie dawał postawić kursora tapnięciem (zgłoszenie
   * z urządzenia, 2026-09-02, z bliźniaczego arkusza oleju). Sterowanie oddaje się
   * polu w `onSelectionChange`, gdy doniesie zadaną pozycję - historia i reguła:
   * `sheetSelection.ts`.
   *
   * Przy masce godziny kursor wraca na koniec po każdym znaku, bo maska przestawia
   * znaki (dwukropek wjeżdża przed ostatnią cyfrę) i natywna pozycja przestaje
   * odpowiadać temu, co pilot widzi.
   */
  const [selection, setSelection] = useState<SelectionRange | undefined>(
    cursorAtEnd(initialText),
  );
  // Każde otwarcie zaczyna od aktualnej wartości - arkusz nie pamięta porzuconej edycji.
  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    setSelection(cursorAtEnd(initialText));
  }, [visible, initialText]);

  const change = useCallback(
    (raw: string) => {
      // Maska własna wygrywa; `time` niesie swoją, bo dwukropek godziny stawia arkusz.
      const apply = mask ?? (keyboard === 'time' ? maskTimeUtcInput : null);
      const next = apply ? apply(raw) : raw;
      setText(next);
      // Przy masce kursor na koniec (maska przestawia znaki, więc natywna pozycja
      // przestaje odpowiadać temu, co widać); bez maski zaznaczenie zostaje w rękach
      // pola.
      setSelection(apply ? cursorAtEnd(next) : undefined);
    },
    [keyboard, mask],
  );

  const parsed = parse(text);
  const empty = text.trim() === '';
  const warning = parsed != null ? (warningFor?.(parsed) ?? null) : null;

  /**
   * BANER MÓWI O WARTOŚCI, PRZYCISK O TYM, CZEMU NIE DA SIĘ ZAPISAĆ (uwaga
   * z urządzenia, 2026-08-29: „jak mam wpis paliwa, to po co dajesz baner «wpisz
   * wartość, żeby zapisać»? Mamy pattern, że walidacja jest na przycisku").
   *
   * Do tej pory ten arkusz wrzucał w JEDEN baner trzy różne rzeczy: puste pole,
   * wpis nieczytelny i ostrzeżenie o samej liczbie - a „POTWIERDŹ" wyglądał na
   * aktywny i po tapnięciu milczał (`onConfirm` sprawdzał `parsed != null` w środku).
   * Cichy przycisk to dokładnie to, przeciw czemu stoi §6 pkt 3.
   *
   * Granica jest odtąd ta sama, co wszędzie: baner „Zanim potwierdzisz" opisuje
   * LICZBĘ, którą pilot wpisał (różni się od szacunku, przekracza pojemność) i zapisu
   * nie wstrzymuje; blokada mieszka W PRZYCISKU, bursztynem, i tam pilot jej szuka.
   *
   * Puste pole zostaje osobnym przypadkiem od nieczytelnego (issue #60 - arkusz dolewki
   * startuje pusty, bo prefill fabrykowałby ilość).
   *
   * ══ PUSTE POLE NIE DOSTAJE ZDANIA (druga uwaga z urządzenia, 2026-08-29) ══
   * „Nie ma sensu pisać na przycisku «wpisz wartość, żeby zapisać» - wiadomo, że jak
   * pole jest wymagane, to dlatego przycisk jest disabled."
   *
   * I to jest dokładnie ten WĄSKI wyjątek, który reguła issue #55 przewiduje: blokadę
   * widać z KONTROLKI NAD PRZYCISKIEM. Pustego pola nie trzeba nazywać - pilot patrzy
   * na nie, wpisując. Wpis NIECZYTELNY zdanie zachowuje, bo czerwona ramka mówi, KTÓRE
   * pole, ale nie mówi CZEMU zapisu nie ma; sama pustka mówi jedno i drugie naraz.
   */
  const blocker = empty ? null : parsed == null ? 'Nie rozumiem tej wartości - popraw wpis' : null;

  /** Cyfry: akcent tonu (mockup 02b: `.modal-input-val` = `var(--amber)`). */
  const valueColor = tone === 'neutral' ? theme.colors.textPrimary : c.accent;

  return (
    <Sheet
      visible={visible}
      title={title}
      rows={rows}
      trail={trail}
      {...(warning != null ? { warning } : {})}
      warningTone="amber"
      confirmLabel="POTWIERDŹ"
      confirmDisabledReason={blocker}
      confirmDisabled={empty}
      onConfirm={() => onConfirm(parsed!)}
      onCancel={onCancel}
      /* Klawiatura od otwarcia - drabinka prób z `useSheetInputFocus` (issue #58
         pkt 7, druga tura: pojedynczy focus w onShow bywał nadal za wcześnie). */
      onShow={onShow}
    >
      {/* Metryka pola wspólna z `OilSheet` (`valueFieldMetrics.ts`): zmniejszona ~30%
          uwagą z urządzenia (2026-09-02), z podłogą 46 dp celu dotykowego. */}
      <View
        style={[
          styles.inputRow,
          {
            minHeight: VALUE_FIELD.minHeight,
            paddingHorizontal: VALUE_FIELD.paddingHorizontal,
            paddingVertical: VALUE_FIELD.paddingVertical,
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
          // Patrz nota przy `selection`. `onSelectionChange` wyłącznie ZWALNIA
          // sterowanie - pozycji ze zdarzenia nie wpisuje do stanu nigdy, bo zdarzenie
          // potrafi dojść z pozycją sprzed maski; dlatego porównanie z CELEM.
          selection={selection}
          onSelectionChange={(e) => {
            if (selectionApplied(selection, e.nativeEvent.selection)) {
              setSelection(undefined);
            }
          }}
          // Podkładka zaznaczenia neutralna (`colors.selection`) - akcent w tym samym
          // odcieniu co cyfry dawał jednolity prostokąt zamiast czytelnego zaznaczenia.
          selectionColor={theme.colors.selection}
          // Kursor i uchwyty w pełnym kryciu tonu - jak migający `.modal-cursor` w 02b.
          cursorColor={c.accent}
          selectionHandleColor={c.accent}
          accessibilityLabel={title}
          style={{
            flex: 1,
            padding: 0,
            fontFamily: theme.fontFamily.monoBold,
            fontSize: VALUE_FIELD.fontSize,
            letterSpacing: VALUE_FIELD.letterSpacing,
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
  unit: { fontSize: VALUE_FIELD.unitFontSize },
});
