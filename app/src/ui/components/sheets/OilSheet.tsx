/**
 * UZ Aero - OilSheet (mockup 02i „Pomiar oleju", issue #60)
 *
 * Arkusz DWÓCH pól, bo pomiar i dolewka to jedna czynność przy bagnecie: zmierz →
 * jeśli mało, dolej. Stan po dolewce jest RACHUNKIEM (wiersz „Po dolewce"), nie trzecim
 * polem - inaczej niż trójka `refuel`, dzięki czemu korekta jednej liczby niczego nie
 * rozjeżdża.
 *
 * OBA pola wolno zostawić puste - zapis pustej pary CZYŚCI wcześniejszy wpis szkicu.
 * Arkusz nie egzekwuje wymagalności pomiaru (decyzja 2026-08-27: krok wymagany):
 * to robota bramki CTA (`preflightBlocker`), która mówi powód w przycisku - arkusz
 * z przymusem musiałby kłamać przy wpisie ręcznym (15), gdzie pomiaru może nie być.
 *
 * Komponent jest głupi: wiersze odniesienia, ostrzeżenie i rachunek „po dolewce"
 * przychodzą domknięciami z ekranu (wzorzec `warningFor` z `ReadingSheet`), więc progi
 * mieszkają w jednej logice (`logic/oilPreflight.ts`), a nie w kopii wewnątrz arkusza.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '../../theme';
import { useSheetInputFocus } from '../../hooks/useSheetInputFocus';
import { AppText } from '../foundation/AppText';
import { Tag } from '../status/Tag';
import { Sheet, type SheetRow } from './Sheet';
import { cursorAtEnd, selectionApplied, type SelectionRange } from './sheetSelection';
import { toneColors } from '../tone';

export interface OilSheetProps {
  visible: boolean;
  /** Wartości początkowe ze szkicu, już sformatowane; pusty tekst = nie wpisano. */
  initialLevelText: string;
  initialAddedText: string;
  /** Tekst → litry; `null` dla wpisu nieczytelnego (pusty tekst NIE przechodzi tędy). */
  parse: (text: string) => number | null;
  /** Wiersze odniesienia (oczekiwane / minimum / zbiornik) - stałe dla otwarcia. */
  rows?: SheetRow[];
  /** Rachunek „Po dolewce" dla bieżącej pary; `null` = wiersza nie ma. */
  afterRowFor: (levelL: number | null, addedL: number | null) => SheetRow | null;
  /** Ostrzeżenie dla bieżącej pary (poniżej minimum / odchył / ponad zbiornik). */
  warningFor: (levelL: number | null, addedL: number | null) => string | null;
  onConfirm: (levelL: number | null, addedL: number | null) => void;
  onCancel: () => void;
}

/** Wynik pola: pusty tekst to legalny brak wpisu, nie błąd parsowania. */
function fieldValue(text: string, parse: (t: string) => number | null) {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true as const, value: null };
  const parsed = parse(trimmed);
  return parsed != null ? { ok: true as const, value: parsed } : { ok: false as const, value: null };
}

export function OilSheet({
  visible,
  initialLevelText,
  initialAddedText,
  parse,
  rows = [],
  afterRowFor,
  warningFor,
  onConfirm,
  onCancel,
}: OilSheetProps) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

  const [levelText, setLevelText] = useState(initialLevelText);
  const [addedText, setAddedText] = useState(initialAddedText);
  /* Klawiatura razem z arkuszem - drabinka `useSheetInputFocus`, jak w każdym arkuszu
     z polem wpisu. Goły `autoFocus` (stan do 2026-09-02) odpalał się przy montowaniu,
     zanim okno modala istniało - fokus bywał bez klawiatury (`hooks/keyboardFocus.ts`). */
  const { inputRef, onShow } = useSheetInputFocus();
  /**
   * Zaznaczenie STEROWANE przy otwarciu (nie `selectTextOnFocus` - ono odnawia
   * zaznaczenie przy każdym programowym ustawieniu sterowanego tekstu i druga cyfra
   * wymazywała pierwszą) - a pozycją jest KURSOR NA KOŃCU, nie zaznaczenie całości:
   * sterowany select-all trzymany do pierwszej cyfry przywracał się przy każdym
   * odświeżeniu pola i nie dawał postawić kursora tapnięciem (zgłoszenie z urządzenia,
   * 2026-09-02 - właśnie z tego arkusza). Historia i reguła: `sheetSelection.ts`.
   */
  const [levelSelection, setLevelSelection] = useState<SelectionRange | undefined>(
    cursorAtEnd(initialLevelText),
  );

  // Każde otwarcie zaczyna od wartości ze szkicu - arkusz nie pamięta porzuconej edycji.
  useEffect(() => {
    if (!visible) return;
    setLevelText(initialLevelText);
    setAddedText(initialAddedText);
    setLevelSelection(cursorAtEnd(initialLevelText));
  }, [visible, initialLevelText, initialAddedText]);

  const changeLevel = useCallback((raw: string) => {
    setLevelText(raw);
    setLevelSelection(undefined);
  }, []);

  const level = fieldValue(levelText, parse);
  const added = fieldValue(addedText, parse);
  const invalid = !level.ok || !added.ok;

  const afterRow = !invalid ? afterRowFor(level.value, added.value) : null;
  const warning = !invalid ? warningFor(level.value, added.value) : null;

  const inputFrame = (bad: boolean) => ({
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.lg - 2,
    borderWidth: theme.borderWidthStrong,
    borderColor: bad ? toneColors(theme, 'red').border : theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  });

  const inputText = {
    flex: 1,
    padding: 0,
    fontFamily: theme.fontFamily.monoBold,
    fontSize: 30,
    letterSpacing: 2,
  } as const;

  /* Baner mówi o WARTOŚCI, przycisk o tym, czemu nie da się zapisać (uwaga z urządzenia,
     2026-08-29 - pełne uzasadnienie przy `blocker` w `ReadingSheet`). Wpis nieczytelny
     jest blokadą, więc jego zdanie stoi w przycisku; „Zanim potwierdzisz" zostaje dla
     poziomu, który wygląda podejrzanie, ale zapisać się da. Czerwień znika z banera
     razem z tym przypadkiem - nieczytelny wpis znaczy już czerwona ramka POLA, a to
     ona wskazuje, KTÓRE z dwóch pól poprawić. */
  return (
    <Sheet
      visible={visible}
      title="Pomiar oleju"
      rows={afterRow != null ? [...rows, afterRow] : rows}
      {...(warning != null ? { warning } : {})}
      warningTone="amber"
      confirmLabel="ZAPISZ"
      confirmDisabledReason={invalid ? 'Nie rozumiem tej wartości - popraw wpis' : null}
      onConfirm={() => onConfirm(level.value, added.value)}
      onCancel={onCancel}
      onShow={onShow}
    >
      <AppText variant="mono" tone="muted" style={styles.fieldLabel}>
        Bagnet - poziom zmierzony
      </AppText>
      <View style={[styles.inputRow, inputFrame(!level.ok)]}>
        <TextInput
          ref={inputRef}
          value={levelText}
          onChangeText={changeLevel}
          keyboardType="decimal-pad"
          selection={levelSelection}
          // Wyłącznie ZWALNIA sterowanie zaznaczeniem (nigdy nie wpisuje pozycji
          // ze zdarzenia) - patrz nota przy `levelSelection`.
          onSelectionChange={(e) => {
            if (selectionApplied(levelSelection, e.nativeEvent.selection)) {
              setLevelSelection(undefined);
            }
          }}
          selectionColor={theme.colors.selection}
          cursorColor={amber.accent}
          selectionHandleColor={amber.accent}
          accessibilityLabel="Pomiar oleju - poziom z bagnetu"
          style={[inputText, { color: amber.accent }]}
        />
        <AppText variant="mono" tone="secondary" style={styles.unit}>
          L
        </AppText>
      </View>

      {/* OPCJONALNOŚĆ MÓWI PIGUŁKA, NIE DOKLEJONE SŁOWO (uwaga z urządzenia,
          2026-08-29). „Dolano · opcjonalnie" czytało się jak część NAZWY pola, choć
          jest jego WŁAŚCIWOŚCIĄ - a właściwość pola ma w tym systemie jeden kształt:
          plakietka w linii etykiety, ta sama, co „opcjonalne" przy Dualu i przy
          kręgach. */}
      <View style={styles.fieldHead}>
        <AppText variant="mono" tone="muted" style={styles.fieldLabel}>
          Dolano
        </AppText>
        <Tag label="opcjonalne" />
      </View>
      <View style={[styles.inputRow, inputFrame(!added.ok)]}>
        <TextInput
          value={addedText}
          onChangeText={setAddedText}
          keyboardType="decimal-pad"
          selectionColor={theme.colors.selection}
          cursorColor={theme.colors.textPrimary}
          selectionHandleColor={theme.colors.textPrimary}
          accessibilityLabel="Pomiar oleju - ile dolano"
          style={[inputText, { color: theme.colors.textPrimary }]}
        />
        <AppText variant="mono" tone="secondary" style={styles.unit}>
          L
        </AppText>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  // Etykieta po lewej, plakietka właściwości po prawej - jak w komponencie `Field`.
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: -6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unit: { fontSize: 16 },
});
