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
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';
import { sheetBottomPad } from '../../hooks/keyboardGeometry';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { Banner } from '../status/Banner';
import type { Tone } from '../tone';

export interface SheetRow {
  label: string;
  value: string;
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
   * Strefa destrukcyjna POD rzędem akcji (issue #43, arkusz `10g`).
   *
   * Osobne miejsce, a nie kolejny przycisk w rzędzie: „tego zrzutu nie było" to inna
   * decyzja niż poprawka wartości i nie może być o jeden nieuważny kciuk od „Zapisz".
   * Ta sama zasada, którą `CorrectionSheet` realizuje separatorem i konturem czerwieni.
   */
  destructive?: React.ReactNode;
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
  footer,
  destructive,
  children,
}: SheetProps) {
  const { theme } = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const typing = keyboardHeight > 0;

  /**
   * Sufit wysokości arkusza: miejsce nad klawiaturą, minus pasek statusu (arkusz nie ma
   * prawa go zasłonić) i odrobina powietrza, żeby było widać, że pod nim jest ekran.
   * Dolna granica trzyma sens układu, gdyby pomiary przyszły niespójne.
   */
  const maxHeight = Math.max(
    240,
    windowHeight - keyboardHeight - insets.top - theme.spacing.xxl,
  );

  // Zapas pod rzędem akcji — reguła wspólna dla wszystkich arkuszy (`sheetBottomPad`).
  const bottomPad = sheetBottomPad(
    theme.spacing.xxxl,
    insets.bottom,
    keyboardHeight,
    theme.spacing.lg,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      {/* Tapnięcie w tło = anuluj. Potwierdzenie wymaga celowego tapnięcia w przycisk. */}
      <Pressable style={[styles.overlay, { backgroundColor: theme.colors.overlay }]} onPress={onCancel} accessibilityLabel="Zamknij" />

      {/* Klawiatura podnosi arkusz zamiast go zasłaniać — patrz `useKeyboardHeight`. */}
      <View style={[styles.bottom, { paddingBottom: keyboardHeight }]}>
        <View
          style={{
            maxHeight,
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            paddingBottom: bottomPad,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            borderTopWidth: theme.borderWidthStrong,
            borderTopColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />

          {/* Treść przewijana, akcje poza nią: gdy miejsca nad klawiaturą jest mało,
              skraca się to, co pilot może doczytać przewinięciem, a nie to, czym arkusz
              się zamyka. `flexShrink` bez `flexGrow` — krótka treść nie rozciąga arkusza. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ gap: theme.spacing.md }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* `.modal-title` — mniejszy niż tytuł ekranu: arkusz jest wstawką, nie ekranem. */}
            <AppText variant="display" style={styles.title}>
              {title}
            </AppText>

            {/* Treść własna arkusza idzie zaraz pod tytułem — w mockupach 02b/02c to pole
                edycji, a wiersze odniesienia stoją POD nim jako kontekst dla wpisywanej
                wartości. */}
            {children}

            {rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <AppText variant="mono" tone="muted" style={styles.rowLabel}>
                  {row.label}
                </AppText>
                <AppText variant="mono" tone="secondary" style={styles.rowLabel}>
                  {row.value}
                </AppText>
              </View>
            ))}

            {warning != null && (
              <Banner kind="status" tone={warningTone} title="Zanim potwierdzisz" text={warning} />
            )}
          </ScrollView>

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

          {destructive != null && (
            <>
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              {destructive}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  // Bez `flexGrow`: arkusz ma być tak wysoki jak treść, dopóki mieści się w suficie.
  scroll: { flexGrow: 0, flexShrink: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  title: { fontSize: 22, lineHeight: 24, letterSpacing: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 10, letterSpacing: 0.5 },
  separator: { height: 1, marginTop: 3, marginBottom: 1 },
});
