/**
 * UZ Aero — arkusz wyboru lotniska (krok 2 preflightu, issue #14).
 *
 * DLACZEGO ARKUSZ, A NIE POLE W FORMULARZU. Wcześniej trasa była zwykłym `TextField`,
 * a katalog lotnisk podpowiadał listą pod wierszem. Zgłoszenie z urządzenia brzmiało:
 * „trochę nie widać, że tam jest przeszukiwanie" — i to jest sedno. Pole tekstowe
 * z czterema kratkami wygląda jak miejsce na przepisanie kodu z pamięci; nic nie mówi,
 * że można wpisać „zielona" i dostać lotnisko z pasem i elewacją. Arkusz odwraca tę
 * kolejność: otwiera się z klawiaturą i listą, więc szukanie jest pierwszą rzeczą,
 * którą widać, a przepisanie kodu — nadal możliwe.
 *
 * Ten sam wzorzec, co arkusz godziny meldunku na kroku 1 (`ReadingSheet` w trybie
 * `time`): pole w formularzu jest PRZYCISKIEM z wartością, a wpisywanie dzieje się
 * w arkuszu. Dzięki temu formularz czyta się jak podsumowanie, a nie jak kartka do
 * wypełnienia.
 *
 * Katalog jest wkompilowany w aplikację, więc arkusz działa bez zasięgu — to nie jest
 * wariant offline, tylko brak sieci w tym miejscu w ogóle (patrz `AirfieldSuggestions`).
 * Kod SPOZA katalogu (przelot do EDDB) potwierdza się normalnie: lista milczy, bo
 * katalog obejmuje Polskę, a milczenie katalogu nie jest błędem pilota.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { AirfieldSuggestions } from '../input/AirfieldSuggestions';
import { Sheet } from './Sheet';
import { airfieldByIcao, searchAirfields } from '../../../domain';
import { airfieldRow } from '../input/airfieldRow';
import { icaoToStore } from './airfieldEntry';

export interface AirfieldSheetProps {
  visible: boolean;
  /** „Lotnisko skoków", „Start", „Lądowanie" — czyje pole otwieramy. */
  title: string;
  /** Wartość początkowa (ICAO albo pusto). */
  initialIcao: string;
  onConfirm: (icao: string) => void;
  onCancel: () => void;
}

/** Ile podpowiedzi mieści się w arkuszu nad klawiaturą, żeby nie trzeba było przewijać. */
const LIMIT = 6;

export function AirfieldSheet({
  visible,
  title,
  initialIcao,
  onConfirm,
  onCancel,
}: AirfieldSheetProps) {
  const { theme } = useTheme();
  const [text, setText] = useState(initialIcao);
  const input = useRef<TextInput>(null);

  // Fokus z `Modal.onShow` — dopiero wtedy okno przyjmuje klawiaturę
  // (`docs/architektura-kodu.md` §2, „Klawiatura i pola edycji").
  const focusInput = useCallback(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    if (!visible) return;
    setText(initialIcao);
    const id = setTimeout(focusInput, 150);
    return () => clearTimeout(id);
  }, [visible, initialIcao, focusInput]);

  const query = text.trim();
  /**
   * Szukamy po KAŻDYM wpisie — także po nazwie miejscowości. Kod rozpoznany zamyka
   * pytanie (lista ustępuje potwierdzeniu w wierszu wartości), ale zostaje na liście,
   * żeby dało się go potwierdzić tapnięciem zamiast szukać przycisku.
   */
  const rows = useMemo(
    () => (query.length === 0 ? [] : searchAirfields(query, { limit: LIMIT }).map(airfieldRow)),
    [query],
  );

  const known = airfieldByIcao(query.toUpperCase());
  // Do rejestru wchodzi kod, nigdy nazwa — reguła i jej powód w `airfieldEntry.ts`.
  const toStore = icaoToStore(query);
  const confirmable = toStore != null;

  return (
    <Sheet
      visible={visible}
      title={title}
      warning={
        confirmable
          ? undefined
          : rows.length > 0
            ? 'Wybierz lotnisko z listy — do rejestru wchodzi kod ICAO, nie nazwa.'
            : 'To nie jest kod ICAO. Dokończ czteroznakowy kod albo szukaj po nazwie i wybierz z listy.'
      }
      warningTone={rows.length > 0 ? 'amber' : 'red'}
      onShow={focusInput}
      confirmLabel="WYBIERZ"
      onConfirm={() => {
        if (toStore != null) onConfirm(toStore);
      }}
      onCancel={onCancel}
    >
      <View
        style={[
          styles.inputRow,
          {
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: theme.radius.lg - 2,
            borderWidth: theme.borderWidthStrong,
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          // Bez `autoCapitalize` na wersaliki: pilot szuka też po nazwie („zielona"),
          // a wielkie litery w nazwie miejscowości wyglądają jak krzyk. Kod i tak
          // podnosimy do wersalików przy potwierdzeniu.
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="EPKK albo nazwa"
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.selection}
          cursorColor={theme.colors.textPrimary}
          accessibilityLabel={title}
          style={{
            flex: 1,
            padding: 0,
            fontFamily: theme.fontFamily.monoBold,
            fontSize: 26,
            letterSpacing: 2,
            color: theme.colors.textPrimary,
          }}
        />
      </View>

      {/* Potwierdzenie rozpoznanego kodu stoi TU, w arkuszu, a nie pod formularzem:
          to jest miejsce, w którym pilot podejmuje decyzję (issue #14 pkt 1). */}
      {known != null && (
        <AppText variant="mono" tone="muted" style={styles.known}>
          {known.name}
        </AppText>
      )}

      <AirfieldSuggestions
        label="Podpowiedzi"
        rows={rows}
        onPick={(icao) => onConfirm(icao)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  known: { fontSize: 10, letterSpacing: 0.5 },
});
