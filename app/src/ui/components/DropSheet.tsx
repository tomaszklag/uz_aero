/**
 * UZ Aero — DropSheet (mockup 05e „Zrzut")
 *
 * Arkusz zapisu wyniesienia: wysokość z GPS, trzy liczniki typów skoków, suma
 * i informacja, do jakiego klienta trafi rozliczenie.
 *
 * Dlaczego arkusz nad kokpitem, a nie osobny ekran: zrzut zapisuje się **w powietrzu**,
 * między jednym wyniesieniem a drugim. Pilot nie może stracić z oczu fazy lotu ani
 * parametrów GPS — mockup dosłownie pokazuje kokpit prześwitujący nad arkuszem.
 *
 * Wysokość jest **odczytem z GPS, nie polem do wpisania** (`CLAUDE.md`: dane z pomiaru
 * mają pierwszeństwo). Pilot ustawia wyłącznie to, czego telefon nie wie — liczbę
 * skoczków w rozbiciu na typy, bo to ona jest przychodową stroną dnia.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { AppText } from './AppText';
import { ActionButton } from './ActionButton';
import { CounterRow } from './CounterRow';
import { Icon } from './Icon';
import { InlineNote } from './InlineNote';
import { toneColors } from './tone';

export interface JumperCounts {
  tandem: number;
  aff: number;
  solo: number;
}

export interface DropSheetProps {
  visible: boolean;
  /**
   * Numer LOTU, w którym dzieje się zrzut — mockup 05e ma w tytule „ZRZUT · LOT 6",
   * spójnie z podpisem fazy („Lot 6 · nad zrzutowiskiem").
   *
   * To NIE jest numer wyniesienia: w jednym locie bywa ich kilka, a numer zrzutu nadaje
   * komenda (`DropInput.dropNumber` domyślnie kolejny). Wcześniej ekran wstawiał tu
   * licznik zrzutów i pod etykietą „LOT" pokazywała się cudza liczba.
   */
  flightNumber: number;
  /** Czas zrzutu (sformatowany, UTC). */
  time: string;
  /** Wysokość z GPS; `null` = brak sygnału, wtedy zapisujemy zrzut bez niej. */
  altitudeFt: number | null;
  /** Klient z preflightu — dziedziczy go zdarzenie zrzutu (denormalizacja dla arkusza). */
  client?: string | null;
  busy?: boolean;
  onConfirm: (jumpers: JumperCounts) => void;
  onCancel: () => void;
}

const EMPTY: JumperCounts = { tandem: 0, aff: 0, solo: 0 };

export function DropSheet({
  visible,
  flightNumber,
  time,
  altitudeFt,
  client,
  busy = false,
  onConfirm,
  onCancel,
}: DropSheetProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');
  const keyboardHeight = useKeyboardHeight();
  const [jumpers, setJumpers] = useState<JumperCounts>(EMPTY);

  // Każde otwarcie zaczyna od zera — arkusz nie pamięta poprzedniego wyniesienia.
  useEffect(() => {
    if (visible) setJumpers(EMPTY);
  }, [visible]);

  const total = jumpers.tandem + jumpers.aff + jumpers.solo;
  const set = (key: keyof JumperCounts) => (value: number) =>
    setJumpers((j) => ({ ...j, [key]: value }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={[styles.overlay, { backgroundColor: theme.colors.overlay }]} onPress={onCancel} accessibilityLabel="Zamknij" />

      <View style={[styles.bottom, { paddingBottom: keyboardHeight }]}>
        <View
          style={{
            gap: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl + 2,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            borderTopWidth: theme.borderWidthStrong,
            borderTopColor: blue.border,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />

          <View style={styles.head}>
            <AppText variant="display" style={[styles.title, { color: blue.accent }]}>
              {`ZRZUT · LOT ${flightNumber}`}
            </AppText>
            <AppText variant="mono" tone="muted" style={styles.headSub}>
              {`${time} UTC`}
            </AppText>
          </View>

          {/* Wysokość z GPS — odczyt, nie pole. */}
          <View
            style={[
              styles.altRow,
              {
                borderRadius: 13,
                borderWidth: theme.borderWidth,
                borderColor: blue.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Icon name="drop" size={18} color={blue.accent} />
            <AppText
              variant="mono"
              style={{
                flex: 1,
                fontFamily: theme.fontFamily.monoBold,
                fontSize: 24,
                letterSpacing: 1,
                color: altitudeFt != null ? blue.accent : theme.colors.textMuted,
              }}
            >
              {altitudeFt != null ? `${Math.round(altitudeFt)} ft` : '— ft'}
            </AppText>
            <AppText variant="mono" tone="muted" style={styles.altTag}>
              {altitudeFt != null ? 'wysokość z GPS' : 'brak sygnału GPS'}
            </AppText>
          </View>

          <CounterRow
            label="Tandem"
            hint="z instruktorem"
            value={jumpers.tandem}
            onChange={set('tandem')}
          />
          <CounterRow label="AFF" hint="szkolenie" value={jumpers.aff} onChange={set('aff')} />
          <CounterRow
            label="Solo"
            hint="licencjonowani"
            value={jumpers.solo}
            onChange={set('solo')}
          />

          {/* `.total-row` — wypełniona karta w tonie zrzutu, nie przypis pod licznikami.
              Suma jest tym, co faktycznie trafi do rozliczenia, więc ma wagę równą
              polom, z których powstała. */}
          <View
            style={[
              styles.total,
              {
                borderRadius: 13,
                borderWidth: theme.borderWidth,
                borderColor: blue.border,
                backgroundColor: blue.muted,
              },
            ]}
          >
            <AppText variant="mono" style={[styles.totalLabel, { color: blue.accent }]}>
              Skoczków w tym wyniesieniu
            </AppText>
            <AppText variant="display" style={[styles.totalValue, { color: blue.accent }]}>
              {total}
            </AppText>
          </View>

          {client != null && client.length > 0 && (
            <AppText variant="mono" tone="muted" style={styles.client}>
              {`Rozliczenie trafi do klienta ${client} (z preflightu)`}
            </AppText>
          )}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <ActionButton
              label="ANULUJ"
              tone="neutral"
              variant="secondary"
              size="md"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <ActionButton
              label="ZAPISZ ZRZUT"
              tone="blue"
              variant="solid"
              size="md"
              busy={busy}
              // Zrzut bez skoczków nie jest wyniesieniem — blokujemy z podanym powodem.
              disabledReason={total === 0 ? 'Ustaw liczbę skoczków' : null}
              onPress={() => onConfirm(jumpers)}
              style={{ flex: 2 }}
            />
          </View>

          <InlineNote
            icon="offline"
            tone="neutral"
            text="Zapis lokalny — działa bez zasięgu, wyśle się automatycznie"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 23, lineHeight: 25, letterSpacing: 2 },
  headSub: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  altRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  altTag: { fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase' },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  totalLabel: { flexShrink: 1, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalValue: { fontSize: 30, lineHeight: 32, letterSpacing: 1 },
  client: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
});
