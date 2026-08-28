/**
 * UZ Aero — Sheet (`.modal-overlay` / `.modal-sheet` z mockupów)
 *
 * Arkusz wysuwany od dołu: uchwyt, tytuł display, wiersze odniesienia, ostrzeżenie,
 * dwie akcje w proporcji 1:2 (anuluj węższy niż potwierdź).
 *
 * Używamy go tam, gdzie decyzja ma **konsekwencje dla innych** i wymaga świadomego
 * potwierdzenia — przejęcie samolotu odbiera poprzedniemu PIC prawo zapisu (§4.4).
 * Zwykłe formularze arkusza nie dostają: dodatkowa warstwa spowalnia pracę bez powodu.
 *
 * `Modal` z RN, nie własna nakładka — dzięki temu przycisk „wstecz" Androida zamyka
 * arkusz, a nie cały ekran.
 *
 * DOLNA KRAWĘDŹ (zgłoszenia z urządzenia, 2026-07-30 — arkusz godziny meldunku). Przyciski
 * ANULUJ / POTWIERDŹ nie mogą ani wpaść pod klawiaturę, ani wejść pod pasek nawigacji:
 * arkusza nie da się wtedy zatwierdzić, a zamknąć tylko w ciemno (tapnięcie w tło).
 * Trzeba przy tym uważać, żeby nie zapłacić za to samo dwa razy — bo pasek nawigacji
 * należy do dwóch różnych miar:
 *   1. klawiatura WYSUNIĘTA — `useKeyboardHeight` mierzy do dołu okna, czyli razem
 *      z paskiem nawigacji, nad którym klawiatura stoi (patrz `keyboardBottomOffset`).
 *      Dolny inset jest już w tej liczbie; dodany osobno dawał pas martwego powietrza
 *      między arkuszem a klawiaturą (pierwsza wersja tej poprawki);
 *   2. klawiatura ZWINIĘTA — nic nie chroni dolnej krawędzi, więc bierzemy dolny inset
 *      wprost. Stałe 32 dp nie wystarczały: pasek trzech przycisków ma ~48 dp i ucinał
 *      dolny skraj POTWIERDŹ;
 *   3. wysokość arkusza ograniczona do miejsca NAD klawiaturą, przy czym skraca się
 *      przewijana treść, nie rząd akcji — przyciski zostają widoczne zawsze.
 *
 * GÓRNA KRAWĘDŹ (zgłoszenie z urządzenia, 2026-08-14 — arkusz korekty zdarzenia). Arkusz
 * z dużą treścią dobijał do samej góry telefonu i przestawał wyglądać jak wstawka NAD
 * ekranem: bez pasa przyciemnionego tła czytał się jak nowy ekran, a jedyną poszlaką
 * został uchwyt, którego nikt nie szuka. Sufit zostawia więc `SHEET_TOP_GAP` ponad
 * bezpiecznym obszarem — reguła jest w `sheetMaxHeight`, wspólna dla WSZYSTKICH arkuszy,
 * bo to własność komponentu, nie pojedynczego ekranu.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { Banner } from '../status/Banner';
import { SheetSurface } from './SheetSurface';
import { toneColors, type Tone } from '../tone';

export interface SheetRow {
  label: string;
  value: string;
  /**
   * Ton WARTOŚCI (issue #60: „Po dolewce · 9,2 L" zielone od minimum w górę).
   * Kolor niesie werdykt o liczbie, nie ozdobę — bez tonu wiersz zostaje neutralny.
   */
  tone?: Tone;
}

export interface SheetProps {
  visible: boolean;
  title: string;
  /** Wiersze „klucz — wartość" nad ostrzeżeniem (np. aktywny PIC, ostatni sync). */
  rows?: SheetRow[];
  /** Treść ostrzeżenia — co dokładnie się stanie po potwierdzeniu. */
  warning?: string;
  warningTone?: Tone;
  /**
   * Napis akcji potwierdzającej. **Opcjonalny**: arkusz wyszukiwarki (`AirfieldSheet`)
   * kończy się w chwili wyboru pozycji z listy, więc nie ma czego potwierdzać —
   * przycisk „WYBIERZ" obok wybranego już wiersza pytałby o zgodę na to, co pilot
   * właśnie zrobił. Bez tego pola zostaje sam rząd z „ANULUJ".
   */
  confirmLabel?: string;
  confirmTone?: Tone;
  onConfirm?: () => void;
  cancelLabel?: string;
  onCancel: () => void;
  /** Okno modala już istnieje — arkusz z polem wpisu robi tu `focus()` (patrz `SheetSurface`). */
  onShow?: () => void;
  /**
   * Treść PRZYPIĘTA nad rzędem akcji, poza obszarem przewijania.
   *
   * Powstała dla wyszukiwarki lotnisk (zgłoszenie z urządzenia): arkusz jest przyklejony
   * do dolnej krawędzi i rośnie w górę, więc każdy wynik dokładany do listy przesuwał pole
   * wpisu — pisało się do celu, który skacze pod palcem. Element w stopce ma stałą odległość
   * od dołu: lista rośnie i kurczy się NAD nim, a pole zostaje tam, gdzie pilot je zostawił.
   */
  footer?: React.ReactNode;
  /**
   * Akcja w linii TYTUŁU, po prawej — dziś wyłącznie kosz (unieważnienie zdarzenia).
   *
   * Od 2026-08-14 to jest miejsce akcji destrukcyjnej: pełnowymiarowy czerwony przycisk
   * pod rzędem akcji miał być „daleko od Zapisz", a wychodził na najgłośniejszy element
   * arkusza — choć intencją wchodzącego w korektę jest poprawka, nie kasowanie
   * (uwaga z urządzenia). Ikona jest dostępna, nie eksponowana.
   */
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
}

export function Sheet({
  visible,
  title,
  rows = [],
  warning,
  warningTone = 'amber',
  confirmLabel,
  confirmTone = 'green',
  onConfirm,
  cancelLabel = 'ANULUJ',
  onCancel,
  onShow,
  footer,
  headerAction,
  children,
}: SheetProps) {
  const { theme } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  return (
    <SheetSurface
      visible={visible}
      onCancel={onCancel}
      onShow={onShow}
      keyboardHeight={keyboardHeight}
      designPad={theme.spacing.xxxl}
      /* Treść przewijana, akcje poza nią: gdy miejsca jest mało, skraca się to, co pilot
         może doczytać przewinięciem, a nie to, czym arkusz się zamyka. */
      pinned={
        <>
          {footer}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {/* Mockup: `.modal-actions` = siatka 1 : 2 z mniejszymi napisami niż CTA ekranu. */}
            <ActionButton
              label={cancelLabel}
              tone="neutral"
              variant="secondary"
              size="md"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            {confirmLabel != null && onConfirm != null && (
              <ActionButton
                label={confirmLabel}
                tone={confirmTone}
                variant="solid"
                size="md"
                onPress={onConfirm}
                style={{ flex: 2 }}
              />
            )}
          </View>

        </>
      }
    >
      {/* `.modal-title` — mniejszy niż tytuł ekranu: arkusz jest wstawką, nie ekranem.
          Akcja destrukcyjna (kosz) stoi w tej samej linii, po prawej — patrz `headerAction`. */}
      <View style={styles.titleRow}>
        <AppText variant="display" style={styles.title}>
          {title}
        </AppText>
        {headerAction}
      </View>

      {/* Treść własna arkusza idzie zaraz pod tytułem — w mockupach 02b/02c to pole
          edycji, a wiersze odniesienia stoją POD nim jako kontekst dla wpisywanej
          wartości. */}
      {children}

      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <AppText variant="mono" tone="muted" style={styles.rowLabel}>
            {row.label}
          </AppText>
          <AppText
            variant="mono"
            tone="secondary"
            style={[
              styles.rowLabel,
              row.tone != null ? { color: toneColors(theme, row.tone).accent } : null,
            ]}
          >
            {row.value}
          </AppText>
        </View>
      ))}

      {warning != null && (
        <Banner kind="status" tone={warningTone} title="Zanim potwierdzisz" text={warning} />
      )}
    </SheetSurface>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: -8 },
  title: { flex: 1, fontSize: 22, lineHeight: 24, letterSpacing: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 10, letterSpacing: 0.5 },
});
