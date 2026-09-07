/**
 * UZ Aero - SKELETON RAMY APLIKACJI: bramki startu, zanim wiadomo, jaki ekran przyjdzie.
 *
 * Trzy momenty w `App.tsx` czekają, zanim jakikolwiek ekran ma prawo się narysować:
 * otwarcie bazy i wczytanie fontów, odczyt magazynu poświadczeń i wznowienie sesji.
 * Do issue #33 każdy z nich pokazywał `ActivityIndicator` na środku czerni.
 *
 * Ten skeleton celowo NIE UDAJE konkretnego ekranu - po tych bramkach idzie się na 01,
 * do kokpitu albo na login, a plamki w kształcie logu dnia pokazane przed ekranem
 * logowania byłyby obietnicą nie do dotrzymania (wzorzec `design/LOADERY.html` reguła 2:
 * skeleton obiecuje część wspólną). Rezerwuje więc wyłącznie to, co mają wszystkie
 * ekrany: pasek nagłówka nad linią i blok treści pod nim.
 *
 * Splash z logo świadomie odrzucony - `SplashScreen` został z aplikacji usunięty
 * (etap C5) i nie wraca tylnymi drzwiami jako ekran ładowania.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';
import { Skeleton } from '../foundation/Skeleton';

export function SkeletonScreen() {
  const { theme } = useTheme();

  return (
    // Obszar bezpieczny jak w `Screen` - bez niego pasek nagłówka wchodziłby pod status
    // bar (Android rysuje edge-to-edge od SDK 54) i skeleton obiecywałby układ przesunięty
    // o wysokość wcięcia względem ekranu, który za chwilę przyjdzie.
    <SafeAreaView
      accessible
      accessibilityLabel="Ładowanie"
      style={[styles.flex, { backgroundColor: theme.colors.bg }]}
    >
      {/* Pasek nagłówka w geometrii `ScreenHeader`: tytuł display 26 px nad podtytułem
          mono, linia u dołu. Wysokość paska jest stała na wszystkich ekranach, więc
          treść, która za chwilę przyjdzie, zaczyna się dokładnie tam, gdzie teraz. */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: theme.borderWidth,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Skeleton width={148} height={26} />
          <Skeleton width={96} height={10} />
        </View>
        <Skeleton width={44} height={44} radius={12} />
      </View>

      <View style={[styles.content, { padding: theme.spacing.lg, gap: theme.spacing.md }]}>
        <Skeleton height={120} radius={theme.radius.md} />
        <Skeleton height={46} radius={theme.radius.md} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { gap: 5 },
  content: { flex: 1 },
});
