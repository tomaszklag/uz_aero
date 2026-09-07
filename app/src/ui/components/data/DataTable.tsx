/**
 * UZ Aero - DataTable (`.data-table` z mockupu 10)
 *
 * Tabela wierszy danych: nagłówek kolumn, wiersze rozdzielone włosową linią, opcjonalny
 * **cel korekty** na końcu każdego wiersza.
 *
 * Dlaczego tabela, a nie lista kart: lista lotów jest jedynym miejscem, w którym pilot
 * porównuje sześć rekordów tej samej struktury i szuka tego jednego z błędnym czasem.
 * Kolumny ustawiają cyfry jedna pod drugą - w kartach ta sama informacja rozpłynęłaby się
 * po ekranie i błąd trzeba by czytać, zamiast go zobaczyć.
 *
 * Dwie rzeczy nie są ozdobnikiem:
 *  • **Cel korekty ≥ 44 px** - ten sam próg co w `SessionAxis` w trybie edycji. GPS klasy konsumenckiej
 *    gwarantuje fałszywe detekcje (§8), więc naprawa błędu nie może być trudniejsza niż
 *    jego popełnienie. To wniosek z audytu, nie preferencja.
 *  • **Powód blokady jako widoczny tekst** - gdy korekta jest niedostępna, ołówki gasną,
 *    a pod tabelą staje jedno zdanie „dlaczego". Nigdy cichy błąd (§6 pkt 3); jedno
 *    zdanie pod tabelą, a nie sześć powtórzeń przy wierszach.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { toneColors, type Tone } from '../tone';

export interface DataColumn {
  label: string;
  /** Stała szerokość (px). Bez niej kolumna dzieli pozostałe miejsce po równo. */
  width?: number;
}

export interface DataCell {
  text: string;
  /** Z tonem komórka staje się chipem (AUTO / RĘCZNIE), bez - zwykłym tekstem. */
  chip?: Tone;
  /** Przygaszona kolumna porządkowa („#"). */
  muted?: boolean;
  /**
   * Zamienia komórkę w cel dotykowy (mockup 14: numer lotu otwiera ślad).
   *
   * Świadomie na KOMÓRCE, a nie na całym wierszu: wiersz lotu ma już jeden cel -
   * ołówek korekty - i drugi, obejmujący całą szerokość, przechwytywałby dotknięcia
   * przeznaczone dla niego. Podkreślenie pod tekstem mówi, że tu się klika.
   */
  onPress?: () => void;
  /** Etykieta dostępności celu z `onPress` („ślad lotu 3"). */
  pressLabel?: string;
}

export interface DataTableRow {
  id: string;
  cells: DataCell[];
  /** Opis wiersza do etykiety dostępności celu korekty („lot 1, start 08:25 UTC"). */
  label?: string;
}

export interface DataTableProps {
  columns: DataColumn[];
  rows: DataTableRow[];
  /** Otwiera korektę wiersza (04c). Bez tego kolumny akcji w ogóle nie ma. */
  onCorrect?: (id: string) => void;
  /** Blokuje korektę - ołówki gasną, powód pokazujemy pod tabelą. */
  correctDisabledReason?: string | null;
  emptyText?: string;
  style?: ViewStyle;
}

/** Szerokość celu korekty - 46 px trzyma dotyk powyżej progu 44 px dla rękawic. */
const CORRECT_WIDTH = 46;

export function DataTable({
  columns,
  rows,
  onCorrect,
  correctDisabledReason = null,
  emptyText = 'Brak danych.',
  style,
}: DataTableProps) {
  const { theme } = useTheme();
  const correctable = onCorrect != null;
  const disabled = correctDisabledReason != null;

  if (rows.length === 0) {
    return (
      <View style={[{ padding: theme.spacing.md, alignItems: 'center' }, style]}>
        <AppText variant="body" tone="muted">
          {emptyText}
        </AppText>
      </View>
    );
  }

  const cellStyle = (index: number): ViewStyle => {
    const width = columns[index]?.width;
    return width != null ? { width, flexShrink: 0 } : { flex: 1 };
  };

  return (
    <View style={style}>
      <View
        style={[
          styles.row,
          { borderBottomWidth: theme.borderWidth, borderBottomColor: theme.colors.border },
        ]}
      >
        {columns.map((column, index) => (
          <View key={column.label} style={[styles.headCell, cellStyle(index)]}>
            <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.headLabel}>
              {column.label}
            </AppText>
          </View>
        ))}
        {correctable && <View style={styles.correctSlot} />}
      </View>

      {rows.map((row, rowIndex) => (
        <View
          key={row.id}
          style={[
            styles.row,
            {
              borderBottomWidth: rowIndex === rows.length - 1 ? 0 : theme.borderWidth,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          {row.cells.map((cell, index) => {
            const chip = cell.chip != null ? toneColors(theme, cell.chip) : null;

            return (
              <View key={columns[index]?.label ?? index} style={[styles.bodyCell, cellStyle(index)]}>
                {chip != null ? (
                  <View
                    style={[
                      styles.chip,
                      { backgroundColor: chip.muted, borderColor: chip.border, borderWidth: theme.borderWidth },
                    ]}
                  >
                    <AppText variant="mono" numberOfLines={1} style={[styles.chipLabel, { color: chip.accent }]}>
                      {cell.text}
                    </AppText>
                  </View>
                ) : cell.onPress != null ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={cell.pressLabel ?? cell.text}
                    onPress={cell.onPress}
                    // Cel dotykowy 44 px także wtedy, gdy tekstem jest jedna cyfra.
                    style={({ pressed }) => [styles.pressCell, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <AppText variant="mono" numberOfLines={1} style={styles.value}>
                      {cell.text}
                    </AppText>
                    <View style={[styles.pressUnderline, { backgroundColor: theme.colors.green }]} />
                  </Pressable>
                ) : (
                  <AppText
                    variant="mono"
                    tone={cell.muted === true ? 'muted' : 'primary'}
                    numberOfLines={1}
                    style={styles.value}
                  >
                    {cell.text}
                  </AppText>
                )}
              </View>
            );
          })}

          {correctable && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              accessibilityLabel={`Korekta: ${row.label ?? row.cells.map((c) => c.text).join(' ')}`}
              disabled={disabled}
              onPress={() => onCorrect?.(row.id)}
              style={({ pressed }) => [
                styles.correctSlot,
                {
                  opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.correctBox,
                  {
                    borderRadius: theme.radius.sm,
                    borderWidth: theme.borderWidth,
                    borderColor: theme.colors.borderStrong,
                  },
                ]}
              >
                <Icon name="edit" size={15} color={theme.colors.textSecondary} />
              </View>
            </Pressable>
          )}
        </View>
      ))}

      {/* Powód blokady - widoczny tekst pod tabelą (§6 pkt 3). */}
      {correctable && disabled && (
        <View
          style={{
            paddingHorizontal: theme.spacing.sm,
            paddingBottom: theme.spacing.sm,
            paddingTop: 6,
          }}
        >
          <AppText variant="label" tone="amber" style={styles.reason}>
            {correctDisabledReason}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wcięcie od krawędzi karty - `.data-table th/td { padding: … 8px }`.
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8 },
  headCell: { paddingHorizontal: 4, paddingVertical: 8 },
  headLabel: { fontSize: 8, lineHeight: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  bodyCell: { paddingHorizontal: 4, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  value: { fontSize: 11, lineHeight: 15, letterSpacing: 0.5 },
  // Cel dotykowy komórki-przycisku (numer lotu → ślad): pełna wysokość wiersza,
  // żeby dotknięcie nie wymagało trafiania w jedną cyfrę.
  pressCell: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-start', gap: 2 },
  pressUnderline: { width: 12, height: 1.5, borderRadius: 1, opacity: 0.5 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  chipLabel: { fontSize: 8, lineHeight: 12, letterSpacing: 1 },
  correctSlot: {
    width: CORRECT_WIDTH,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  correctBox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  reason: { textAlign: 'center' },
});
