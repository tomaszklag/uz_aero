/**
 * UZ Aero - FreshnessNote (`.fresh-note` z mockupu 02a)
 *
 * Adnotacja wieku danych z serwera. §4.8 i `CLAUDE.md` dzielą takie wartości na trzy stany:
 *
 *  • `live`  - dane na żywo, **bez żadnej adnotacji** (cisza to informacja: jest świeżo);
 *  • `cache` - z ostatniej synchronizacji: „Ostatnie pobrane · 21 JUN 17:30", amber;
 *  • `brak`  - nie mamy nic: „Brak danych - wpisz z licznika", amber.
 *
 * Komponent istnieje po to, żeby tej reguły nie dało się zapomnieć: każde miejsce
 * pokazujące wartość z serwera przyjmuje `state` i samo wyświetla właściwą adnotację,
 * zamiast improwizować własny tekst na każdym ekranie.
 *
 * Uwaga z mockupu: świeżość i łączność to **dwie różne osie**. `brak` zdarza się też
 * online (nowy samolot we flocie), dlatego ten komponent nie mówi nic o sieci -
 * od tego jest `SyncChip`.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors } from '../tone';

/**
 * Czwarty stan - `manual` - nie jest stanem świeżości danych serwera, tylko jego
 * ZAPRZECZENIEM: wartość pochodzi z licznika w samolocie, a nie z sieci.
 *
 * Bez niego ekran kłamał: po ręcznej korekcie w stanie `cache` obok liczby wpisanej
 * przez pilota nadal stało „Ostatnie pobrane · 21 JUN 17:30", a po wpisaniu odczytu
 * w stanie `brak` wartość dostawała `live`, czyli „na żywo z serwera".
 *
 * Adnotacja jest zielona, bo `CLAUDE.md` stawia licznik fizyczny WYŻEJ niż serwer -
 * to potwierdzenie, nie ostrzeżenie.
 */
export type Freshness = 'live' | 'cache' | 'brak' | 'manual';

export interface FreshnessNoteProps {
  state: Freshness;
  /** Czas ostatniej synchronizacji - pokazywany przy `cache`. */
  syncedAt?: string | null;
  style?: ViewStyle;
}

/*
 * Napisy są STAŁE, nie parametry: własne odmiany (`missingLabel`, `manualLabel`) miała
 * wyłącznie sekcja oleju, a ta od 2026-09-02 adnotacji nie nosi wcale (pomiar pilota
 * nie ma czego poświadczać, a podpowiedź mieszka w arkuszu ze swoim stemplem).
 * Parametr bez drugiego użytkownika to zaproszenie do rozjazdu słownika.
 */
export function FreshnessNote({ state, syncedAt, style }: FreshnessNoteProps) {
  const { theme } = useTheme();

  if (state === 'live') return null;

  const manual = state === 'manual';
  const c = toneColors(theme, manual ? 'green' : 'amber');

  const label = manual
    ? 'Twój odczyt z licznika'
    : state === 'cache'
      ? syncedAt != null
        ? `Ostatnie pobrane · ${syncedAt}`
        : 'Ostatnie pobrane · z cache'
      : 'Brak danych - wpisz z licznika';

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.dot, { backgroundColor: c.accent }]} />
      <AppText variant="mono" style={[styles.label, { color: c.accent }]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5, flexShrink: 0 },
  label: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
});
