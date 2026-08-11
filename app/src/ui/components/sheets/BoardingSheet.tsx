/**
 * UZ Aero — BoardingSheet (mockup 05i „Załadunek", issue #21 pkt 7)
 *
 * Arkusz znacznika załadunku: skoczkowie weszli na pokład — na ziemi, po wykołowaniu
 * z pasa między lotami albo przed pierwszym startem serii. Te same liczniki co arkusz
 * zrzutu (05e), bo to ta sama lista opowiedziana chwilę wcześniej: skład zadeklarowany
 * tutaj otwiera arkusz zrzutu już WYPEŁNIONY i w locie zostaje samo potwierdzenie.
 *
 * Skład jest OPCJONALNY — zapis bez liczb odnotowuje sam fakt załadunku (zero nigdy
 * nie udaje pomiaru: suma 0 zapisuje się jako „skład niepodany", nie „zero skoczków";
 * normalizacja w `SessionCommands.boarding`). Dlatego przycisk zapisu nie ma stanu
 * zablokowanego.
 *
 * Wysokości tu NIE MA — samolot stoi na ziemi; jedyny pomiarowy wiersz arkusza zrzutu
 * nie ma tu czego pokazać.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';
import { sheetBottomPad } from '../../hooks/keyboardGeometry';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { CounterRow } from '../input/CounterRow';
import { toneColors } from '../tone';
import type { JumperCounts } from './DropSheet';

export interface BoardingSheetProps {
  visible: boolean;
  /**
   * Numer lotu NADCHODZĄCEGO — załadunek dzieje się na ziemi, więc należy do lotu,
   * który dopiero się zacznie (`logic/flightNumber.ts`).
   */
  flightNumber: number;
  /** Czas załadunku (sformatowany, UTC). */
  time: string;
  busy?: boolean;
  onConfirm: (jumpers: JumperCounts) => void;
  onCancel: () => void;
}

const EMPTY: JumperCounts = { tandem: 0, aff: 0, solo: 0 };

export function BoardingSheet({
  visible,
  flightNumber,
  time,
  busy = false,
  onConfirm,
  onCancel,
}: BoardingSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const blue = toneColors(theme, 'blue');
  const keyboardHeight = useKeyboardHeight();
  const [jumpers, setJumpers] = useState<JumperCounts>(EMPTY);

  // Każde otwarcie zaczyna od zera — poprzedni skład już poleciał (albo właśnie leci).
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
            paddingBottom: sheetBottomPad(
              theme.spacing.xxl + 2,
              insets.bottom,
              keyboardHeight,
              theme.spacing.lg,
            ),
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
              {`ZAŁADUNEK · LOT ${flightNumber}`}
            </AppText>
            <AppText variant="mono" tone="muted" style={styles.headSub}>
              {`${time} UTC`}
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

          {/* Ta sama karta sumy co w arkuszu zrzutu — to jest skład, który za chwilę
              pokaże się tam jako prefill. */}
          <View
            style={[
              styles.total,
              {
                borderRadius: theme.radius.btn,
                borderWidth: theme.borderWidth,
                borderColor: blue.border,
                backgroundColor: blue.muted,
              },
            ]}
          >
            <AppText variant="mono" style={[styles.totalLabel, { color: blue.accent }]}>
              Skoczków na pokładzie
            </AppText>
            <AppText variant="display" style={[styles.totalValue, { color: blue.accent }]}>
              {total}
            </AppText>
          </View>

          {/* Bez liczb też ma sens — mówimy to, zanim pilot zacznie szukać, czemu
              wolno zapisać zero. */}
          <AppText variant="mono" tone="muted" style={styles.note}>
            Skład możesz pominąć — zapis i tak odnotuje załadunek w logu
          </AppText>

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
              label="ZAPISZ ZAŁADUNEK"
              tone="blue"
              variant="solid"
              size="md"
              busy={busy}
              onPress={() => onConfirm(jumpers)}
              style={{ flex: 2 }}
            />
          </View>
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
  note: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
});
