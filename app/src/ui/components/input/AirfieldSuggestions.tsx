/**
 * UZ Aero - lista podpowiedzi lotnisk (mockup `02f-preflight-lotnisko.html`).
 *
 * Lista KART, nie natywny dropdown - twarda reguła projektu (`CLAUDE.md`). Stoi
 * w przepływie treści, a nie jako nakładka nad polem: przy podniesionej klawiaturze
 * nakładka i tak nie zmieściłaby się w widoku, a treść w przepływie zawsze daje się
 * doprzewijać (`docs/architektura-kodu.md` §2). Tapnięcie działa przy otwartej
 * klawiaturze, bo `Screen` i `Sheet` mają `keyboardShouldPersistTaps="handled"`.
 *
 * Pełna szerokość, a nie kolumna pod polem: „Zielona Góra-Babimost" w 48% szerokości
 * telefonu zostaje uciętym „Zielona Gó…", czyli akurat tą częścią, dla której ta lista
 * powstała.
 *
 * Od issue #14 mieszka w arkuszu wyboru lotniska (`sheets/AirfieldSheet.tsx`), a nie pod
 * wierszem formularza: pole trasy jest przyciskiem, a szukanie dzieje się w arkuszu.
 *
 * Komponent jest CZYSTYM UKŁADEM - wiersze przychodzą gotowe z `airfieldRow`, razem
 * z decyzją, co wchodzi w drugą linię. Kształt wiersza mieszka TUTAJ, a nie przy module
 * liczącym (lustro reguły panelu w `TrackMap.tsx`).
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { CheckIcon } from '../foundation/CheckIcon';
import { IconAction } from '../data/IconAction';
import { toneColors } from '../tone';

/** Wiersz listy podpowiedzi - gotowy do narysowania, bez logiki w komponencie. */
export interface AirfieldRow {
  readonly icao: string;
  readonly name: string;
  /** Druga linia: pas i elewacja. `null`, gdy katalog nie zna ani jednego, ani drugiego. */
  readonly meta: string | null;
}

export interface AirfieldSuggestionsProps {
  /** Nagłówek listy - mówi, CZYM jest ta lista („Wybrane", „Najbliżej Ciebie"). */
  label: string;
  rows: readonly AirfieldRow[];
  /**
   * Kod, który pilot ma już w polu - wiersz z nim dostaje zielone obramowanie i ptaszek.
   *
   * Bez tego arkusz otwarty ponownie wyglądał tak samo jak przy pierwszym wyborze:
   * lista propozycji, na której nic nie mówiło, że coś jest już wybrane (zgłoszenie
   * z urządzenia). Znacznik jest KSZTAŁTEM, nie samym kolorem - działa w słońcu,
   * w motywach jasnych i przy daltonizmie (ta sama zasada co w `CardPicker`).
   */
  selectedIcao?: string | null;
  onPick: (icao: string) => void;
  /**
   * Zdjęcie wyboru - „×" na wybranym wierszu, W MIEJSCU ptaszka (issue #62).
   *
   * Do #62 rezygnacja z trasy była osobnym linkiem „Wyczyść lotnisko (EPKK)" na dnie
   * arkusza: napis w miejscu, w którym nic innego nie stoi, opisujący wartość widoczną
   * dwa centymetry wyżej. Akcja należy do WARTOŚCI, więc stoi przy niej.
   *
   * Ptaszek ustępuje bez straty tylko tam, gdzie sekcja i tak nazywa się „Wybrane" -
   * w liście wyników znacznik zostaje, bo tam odróżnia jeden wiersz od kilku podobnych
   * (kształt, nie sam kolor: słońce, motywy jasne, daltonizm).
   */
  onClear?: (icao: string) => void;
  style?: ViewStyle;
}

export function AirfieldSuggestions({
  label,
  rows,
  selectedIcao = null,
  onPick,
  onClear,
  style,
}: AirfieldSuggestionsProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');

  if (rows.length === 0) return null;

  return (
    <View style={[{ gap: theme.spacing.sm }, style]}>
      {/* Sam nagłówek listy - bez adnotacji „katalog w telefonie" (issue #14).
          Skąd biorą się podpowiedzi, jest pytaniem PROGRAMISTY, nie pilota: dla niego
          liczy się, że lista jest i że działa; że nie zniknie bez zasięgu, przekona się
          w chwili, w której nie zniknie. */}
      <AppText variant="mono" tone="muted" style={styles.title}>
        {label}
      </AppText>

      <View style={{ gap: 6 }}>
        {rows.map((row) => {
          const selected = selectedIcao != null && row.icao === selectedIcao;

          return (
            <Pressable
              key={row.icao}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${row.icao} ${row.name}${selected ? ' - wybrane' : ''}`}
              onPress={() => onPick(row.icao)}
              style={({ pressed }) => [
                styles.row,
                {
                  borderRadius: theme.radius.md,
                  borderWidth: theme.borderWidth,
                  borderColor: selected ? green.border : theme.colors.border,
                  backgroundColor: selected ? green.muted : theme.colors.surfaceRaised,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <AppText
                variant="mono"
                style={{
                  fontFamily: theme.fontFamily.monoBold,
                  fontSize: 14,
                  letterSpacing: 2,
                  color: selected ? green.accent : theme.colors.textPrimary,
                  minWidth: 52,
                }}
              >
                {row.icao}
              </AppText>

              <View style={styles.body}>
                <AppText variant="body" tone="secondary" numberOfLines={1} style={styles.name}>
                  {row.name}
                </AppText>
                {row.meta != null && (
                  <AppText variant="mono" tone="muted" style={styles.meta}>
                    {row.meta}
                  </AppText>
                )}
              </View>

              {/* Ptaszek w kółku - ten sam znacznik wyboru co na liście samolotów (02).
                  Kształt, nie sam kolor: działa w słońcu i przy daltonizmie.

                  Z „×" (sekcja „Wybrane") ptaszek USTĘPUJE, zamiast stać obok: prawa
                  krawędź wiersza niesie dokładnie jedną rzecz, a nazwa sekcji mówi już,
                  że to jest wybrane - znacznik powtarzałby jej nagłówek. */}
              {selected && onClear != null && (
                <IconAction
                  name="clear"
                  accessibilityLabel={`Wyczyść lotnisko ${row.icao}`}
                  onPress={() => onClear(row.icao)}
                  size={15}
                />
              )}
              {selected && onClear == null && (
                <View style={[styles.check, { backgroundColor: green.accent }]}>
                  <CheckIcon size={12} color={theme.colors.bg} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 11,
    minHeight: 48, // cel dotykowy dla rękawic
    paddingVertical: 9,
  },
  body: { flex: 1, gap: 2, minWidth: 0 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: { fontSize: 12 },
  meta: { fontSize: 9, letterSpacing: 0.5 },
});
