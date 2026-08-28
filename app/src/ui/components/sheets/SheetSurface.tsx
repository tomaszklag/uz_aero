/**
 * UZ Aero — RAMA ARKUSZA wysuwanego od dołu (`.modal-overlay` + `.modal-sheet`).
 *
 * ══ PO CO OSOBNY KOMPONENT ══
 * Bo arkuszy jest osiem, a rama była kopiowana: `Modal`, przyciemnione tło z tapnięciem
 * „anuluj", kontener przyklejony do dołu, panel z promieniem 24 i akcentowaną krawędzią
 * górną. Kopia numer siedem gubiła zwykle to samo — SUFIT WYSOKOŚCI. Arkusz korekty
 * zdarzenia z kompletem wierszy odniesienia dobijał przez to do samej góry telefonu
 * i przestawał wyglądać jak wstawka NAD ekranem: bez pasa przyciemnionego tła czytał się
 * jak nowy ekran, a jedyną poszlaką zostawał uchwyt, którego nikt nie szuka
 * (zgłoszenie z urządzenia, 2026-08-14).
 *
 * ══ CO RAMA GWARANTUJE KAŻDEMU ARKUSZOWI ══
 *  • **widać ekran pod spodem** — sufit `sheetMaxHeight` zostawia `SHEET_TOP_GAP` ponad
 *    bezpiecznym obszarem, więc arkusz nigdy nie dobija do krawędzi;
 *  • **treść się przewija, a akcje zostają** — gdy zabraknie miejsca, skraca się to, co
 *    pilot może doczytać przewinięciem, a nie to, czym arkusz się zamyka. Rząd akcji idzie
 *    do `pinned`, poza obszar przewijania;
 *  • **dolna krawędź nie wpada pod klawiaturę ani pod pasek nawigacji** (`sheetBottomPad`);
 *  • **„wstecz" Androida zamyka arkusz, nie ekran** — `Modal` z RN, nie własna nakładka.
 *
 * Rama NIE zna treści: tytuł, pola i przyciski należą do konkretnego arkusza. Zmienne
 * zostają tylko te, które mockupy naprawdę różnicują — odstęp wewnętrzny, zapas dolny
 * z projektu i kolor akcentu górnej krawędzi.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';
import { sheetBottomPad, sheetMaxHeight } from '../../hooks/keyboardGeometry';

export interface SheetSurfaceProps {
  visible: boolean;
  /** Tapnięcie w tło i „wstecz" Androida. Potwierdzenie wymaga celowego przycisku. */
  onCancel: () => void;
  /**
   * Chwila, w której okno modala JUŻ ISTNIEJE (issue #58 pkt 7 i 8). Arkusz z polem
   * wpisu startuje stąd drabinkę fokusu `useSheetInputFocus` — nie pojedyncze
   * `focus()` i nie `autoFocus`: oba zawiodły, historia w `hooks/keyboardFocus.ts`.
   */
  onShow?: () => void;
  /** Odstęp między elementami arkusza — mockupy dają 12–16 dp. */
  gap?: number;
  paddingHorizontal?: number;
  paddingTop?: number;
  /** Zapas dolny Z MOCKUPU; nad paskiem nawigacji rama ustąpi więcej (`sheetBottomPad`). */
  designPad?: number;
  /**
   * Wysokość klawiatury. Arkusz bez pól tekstowych podaje 0 — nie dlatego, że klawiatura
   * go nie dotyczy, tylko dlatego, że nigdy się przy nim nie pojawi.
   */
  keyboardHeight?: number;
  /** Kolor górnej krawędzi — akcent typu arkusza (błękit zrzutu, amber wpisu ręcznego). */
  accentColor?: string;
  /** Numpad PIN-u centruje treść; reszta arkuszy rozciąga ją na szerokość. */
  align?: 'stretch' | 'center';
  /**
   * Treść PRZYPIĘTA pod obszarem przewijania: rząd akcji, pole wpisu wyszukiwarki,
   * strefa destrukcyjna. To ona ma zostać widoczna, gdy treści jest za dużo.
   */
  pinned?: React.ReactNode;
  children?: React.ReactNode;
}

export function SheetSurface({
  visible,
  onCancel,
  onShow,
  gap,
  paddingHorizontal,
  paddingTop,
  designPad,
  keyboardHeight = 0,
  accentColor,
  align = 'stretch',
  pinned,
  children,
}: SheetSurfaceProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const maxHeight = sheetMaxHeight(windowHeight, keyboardHeight, insets.top);
  const bottomPad = sheetBottomPad(
    designPad ?? theme.spacing.xxxl,
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
      onShow={onShow}
      statusBarTranslucent
    >
      {/* Tapnięcie w tło = anuluj. Potwierdzenie wymaga celowego tapnięcia w przycisk. */}
      <Pressable
        style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}
        onPress={onCancel}
        accessibilityLabel="Zamknij"
      />

      {/* Klawiatura podnosi arkusz zamiast go zasłaniać — patrz `useKeyboardHeight`. */}
      <View style={[styles.bottom, { paddingBottom: keyboardHeight }]}>
        <View
          style={{
            maxHeight,
            gap: gap ?? theme.spacing.md,
            paddingHorizontal: paddingHorizontal ?? theme.spacing.lg,
            paddingTop: paddingTop ?? theme.spacing.lg,
            paddingBottom: bottomPad,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            borderTopWidth: theme.borderWidthStrong,
            borderTopColor: accentColor ?? theme.colors.borderStrong,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />

          {/* `flexShrink` bez `flexGrow` — krótka treść nie rozciąga arkusza na siłę. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{
              gap: gap ?? theme.spacing.md,
              alignItems: align === 'center' ? 'center' : undefined,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {pinned}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
});
