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
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { AppText } from './AppText';
import { ActionButton } from './ActionButton';
import { Banner } from './Banner';
import type { Tone } from './tone';

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
  confirmLabel: string;
  confirmTone?: Tone;
  onConfirm: () => void;
  cancelLabel?: string;
  onCancel: () => void;
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
  children,
}: SheetProps) {
  const { theme } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      {/* Tapnięcie w tło = anuluj. Potwierdzenie wymaga celowego tapnięcia w przycisk. */}
      <Pressable style={styles.overlay} onPress={onCancel} accessibilityLabel="Zamknij" />

      {/* Klawiatura podnosi arkusz zamiast go zasłaniać — patrz `useKeyboardHeight`. */}
      <View style={[styles.bottom, { paddingBottom: keyboardHeight }]}>
        <View
          style={{
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            // Przy wysuniętej klawiaturze dolny zapas jest zbędny (i kosztuje wysokość).
            paddingBottom: keyboardHeight > 0 ? theme.spacing.lg : theme.spacing.xxxl,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            borderTopWidth: theme.borderWidthStrong,
            borderTopColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />

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
            <ActionButton
              label={confirmLabel}
              tone={confirmTone}
              variant="solid"
              size="md"
              onPress={onConfirm}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  title: { fontSize: 22, lineHeight: 24, letterSpacing: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 10, letterSpacing: 0.5 },
});
