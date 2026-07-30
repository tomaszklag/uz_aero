/**
 * UZ Aero — Screen
 *
 * Wrapper ekranu: tło z tokenu motywu, obszar bezpieczny (safe area) i padding.
 * Opcjonalnie przewijalny. Kolory wyłącznie z motywu.
 *
 * KLAWIATURA (zgłoszenie z urządzenia, 2026-07-30). Ekran kurczy się o jej wysokość,
 * zamiast dać się nią zasłonić. Powód jest w wersji Androida, nie w naszym układzie:
 * od Expo SDK 54 (RN 0.81) aplikacja rysuje edge-to-edge, więc systemowy `adjustResize`
 * nie zmniejsza już okna — klawiatura wjeżdża NAD treść i pole, w które pilot właśnie
 * pisze, znika pod nią (preflight: „Oznaczenie klienta" tuż nad przyciskiem DALEJ).
 *
 * Bierzemy więc wysokość wprost ze zdarzeń klawiatury (`useKeyboardHeight` — ta sama
 * droga, którą już od dawna podnoszą się arkusze) i skracamy o nią obszar treści.
 * To NIE jest samo zrobienie miejsca na końcu listy: mniejszy `ScrollView` znaczy, że
 * natywny Android ma gdzie przewinąć zogniskowane pole (`requestChildFocus` liczy się
 * z widoczną ramką), więc input sam wchodzi nad klawiaturę.
 *
 * `KeyboardAvoidingView` świadomie odrzucony — patrz nota w `useKeyboardHeight`:
 * zachowuje się różnie na obu systemach i reaguje na translucent status bar.
 */

import React from 'react';
import { ScrollView, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useTheme } from '../theme/ThemeProvider';

export interface ScreenProps extends ViewProps {
  /**
   * Nagłówek POZA obszarem przewijania (`ScreenHeader` / `AppBar`).
   * W mockupach pasek u góry jest przyklejony — numer kroku i stan sieci muszą być
   * widoczne także w połowie długiego formularza.
   */
  header?: React.ReactNode;
  /** Owija zawartość w ScrollView. */
  scroll?: boolean;
  /** Padding wewnętrzny (spacing.lg). Domyślnie true. */
  padded?: boolean;
  /** Krawędzie safe area. Domyślnie wszystkie. */
  edges?: readonly Edge[];
  /** Styl kontenera zawartości (dotyczy trybu scroll). */
  contentContainerStyle?: ViewStyle;
}

const DEFAULT_EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

export function Screen({
  header,
  scroll = false,
  padded = true,
  edges = DEFAULT_EDGES,
  style,
  contentContainerStyle,
  children,
  ...rest
}: ScreenProps) {
  const { theme } = useTheme();
  const keyboard = useKeyboardHeight();
  const bg: ViewStyle = { backgroundColor: theme.colors.bg };
  const pad: ViewStyle | null = padded ? { padding: theme.spacing.lg } : null;

  // Wysunięta klawiatura przykrywa też pasek nawigacji, więc dolny inset przestaje
  // cokolwiek chronić — zostawiony, dokładałby zapas drugi raz. Górnego nie ruszamy:
  // nagłówek ekranu ma zostać pod status barem niezależnie od klawiatury.
  const shrink: ViewStyle | null = keyboard > 0 ? { paddingBottom: keyboard } : null;
  const activeEdges = keyboard > 0 ? edges.filter((e) => e !== 'bottom') : edges;

  if (scroll) {
    return (
      <SafeAreaView style={[styles.flex, bg, shrink]} edges={activeEdges}>
        {header}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[pad, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          // Bez tego pierwsze tapnięcie przy otwartej klawiaturze tylko ją chowa —
          // pilot musi tapnąć DALEJ dwa razy i nie wie dlaczego.
          keyboardShouldPersistTaps="handled"
          {...rest}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, bg, shrink]} edges={activeEdges}>
      {header}
      <View style={[styles.flex, pad, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
