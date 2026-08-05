/**
 * UZ Aero — podpowiedzi lotnisk pod wierszem trasy (mockup `02f-preflight-lotnisko.html`).
 *
 * Lista KART, nie natywny dropdown — twarda reguła projektu (`CLAUDE.md`). Stoi
 * w przepływie treści pod całym wierszem trasy, a nie jako nakładka nad polem: przy
 * podniesionej klawiaturze nakładka i tak nie zmieściłaby się w widoku, a treść
 * w przepływie zawsze daje się doprzewijać (ekran kurczy się o klawiaturę,
 * `docs/architektura-kodu.md` §2). Tapnięcie działa przy otwartej klawiaturze, bo
 * `Screen` ma `keyboardShouldPersistTaps="handled"`.
 *
 * Pełna szerokość, a nie kolumna pod polem: „Zielona Góra-Babimost" w 48% szerokości
 * telefonu zostaje uciętym „Zielona Gó…", czyli akurat tą częścią, dla której ta lista
 * powstała.
 *
 * Komponent jest CZYSTYM UKŁADEM — wiersze przychodzą gotowe z `airfieldRow`
 * (`ui/screens/logic/routeSuggestions.ts`), razem z decyzją, co wchodzi w drugą linię.
 * Kształt wiersza mieszka TUTAJ, a nie przy module liczącym, bo kierunek zależności
 * biegnie od ekranu do komponentu i tylko tak (lustro reguły panelu w `TrackMap.tsx`).
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';

/** Wiersz listy podpowiedzi — gotowy do narysowania, bez logiki w komponencie. */
export interface AirfieldRow {
  readonly icao: string;
  readonly name: string;
  /** Druga linia: pas i elewacja. `null`, gdy katalog nie zna ani jednego, ani drugiego. */
  readonly meta: string | null;
}

export interface AirfieldSuggestionsProps {
  /** Nagłówek listy — mówi, do KTÓREGO pola należy („Start ICAO — podpowiedzi"). */
  label: string;
  rows: readonly AirfieldRow[];
  onPick: (icao: string) => void;
  style?: ViewStyle;
}

export function AirfieldSuggestions({ label, rows, onPick, style }: AirfieldSuggestionsProps) {
  const { theme } = useTheme();

  if (rows.length === 0) return null;

  return (
    <View style={[{ gap: theme.spacing.sm }, style]}>
      <View style={styles.head}>
        <AppText variant="mono" tone="muted" style={styles.title}>
          {label}
        </AppText>
        {/* Skąd te dane: katalog jest w telefonie, więc lista działa bez zasięgu.
            To nie jest wariant offline — dla tego komponentu sieci po prostu nie ma. */}
        <AppText variant="mono" tone="muted" style={styles.source}>
          katalog w telefonie
        </AppText>
      </View>

      <View style={{ gap: 6 }}>
        {rows.map((row) => (
          <Pressable
            key={row.icao}
            accessibilityRole="button"
            accessibilityLabel={`${row.icao} ${row.name}`}
            onPress={() => onPick(row.icao)}
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
            <AppText
              variant="mono"
              style={{
                fontFamily: theme.fontFamily.monoBold,
                fontSize: 14,
                letterSpacing: 2,
                color: theme.colors.textPrimary,
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
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  source: { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 11,
    minHeight: 48, // cel dotykowy dla rękawic
    paddingVertical: 9,
  },
  body: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontSize: 12 },
  meta: { fontSize: 9, letterSpacing: 0.5 },
});
