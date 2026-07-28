/**
 * UZ Aero — punkt wejścia aplikacji.
 *
 * Odpowiada za rzeczy poziomu aplikacji, i tylko za nie:
 *   • dostawcy kontekstu (safe area, motyw),
 *   • ładowanie fontów Design Systemu,
 *   • composition root — otwarcie bazy i podłączenie warstw do store'u,
 *   • nawigacja.
 *
 * Ekrany nie wiedzą, skąd biorą się zależności — dostają je gotowe (§5 architektury).
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';

import { ThemeProvider, useTheme } from './src/ui/theme';
import { AppText } from './src/ui/components';
import { RootNavigator } from './src/ui/navigation/RootNavigator';
import { useAppBootstrap, useGpsPort } from './src/ui/bootstrap/appBootstrap';
import { ServicesProvider } from './src/ui/bootstrap/ServicesProvider';
import { useAuthStore } from './src/ui/store/authStore';
import { useSyncLoop } from './src/ui/hooks/useSyncLoop';
import { LoginScreen } from './src/ui/screens/LoginScreen';

/**
 * Tło okna natywnego — jedyna warstwa, której nie da się pomalować widokiem RN.
 *
 * Widać ją przez ułamek sekundy podczas animacji przejścia między ekranami
 * (`react-native-screens` animuje fragmenty, a pod nimi jest okno Androida, domyślnie
 * białe). Dopóki ekrany miały natywny pasek nawigacji, przykrywał on tę dziurę;
 * po jego wyłączeniu — zgodnie z mockupami, które takiego paska nie mają — błysk wyszedł
 * na wierzch. Statyczny `backgroundColor` w `app.json` załatwia start aplikacji;
 * to ustawienie dokłada zgodność z **wybranym motywem** (mamy ich pięć).
 *
 * Wymaga modułu natywnego, więc zadziała dopiero po przebudowie dev clienta —
 * do tego czasu wywołanie po cichu przepada, zamiast wywracać aplikację.
 */
function useSystemBackground(color: string): void {
  useEffect(() => {
    void (async () => {
      try {
        const SystemUI = require('expo-system-ui') as typeof import('expo-system-ui');
        await SystemUI.setBackgroundColorAsync(color);
      } catch {
        // Stary dev client bez modułu — zostaje kolor z `app.json`.
      }
    })();
  }, [color]);
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppRoot />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppRoot() {
  const { theme, ready: themeReady } = useTheme();
  const boot = useAppBootstrap();
  const gps = useGpsPort();

  useSystemBackground(theme.colors.bg);

  const [fontsLoaded, fontError] = useFonts({
    BebasNeue_400Regular,
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  const fontsReady = fontsLoaded || fontError != null;

  // Brak lokalnego zapisu = aplikacja nie ma prawa udawać, że działa (offline-first §4.1).
  if (boot.phase === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <StatusBar style={theme.isLight ? 'dark' : 'light'} />
        <AppText variant="display" style={{ color: theme.colors.red }}>
          BŁĄD BAZY
        </AppText>
        <AppText variant="body" tone="secondary" style={styles.msg}>
          Nie udało się otworzyć lokalnej bazy zdarzeń. Bez niej dzień lotny nie zostałby
          zapisany, więc aplikacja się nie uruchamia.
        </AppText>
        <AppText variant="mono" tone="muted" style={styles.msg}>
          {boot.message}
        </AppText>
      </View>
    );
  }

  if (!themeReady || !fontsReady || boot.phase !== 'ready') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.green} size="large" />
      </View>
    );
  }

  return (
    <ServicesProvider gps={gps}>
      <StatusBar style={theme.isLight ? 'dark' : 'light'} />
      {/*
        Nieprzezroczyste tło POD nawigatorem.

        Bez niego przy cofaniu widać biały błysk: `react-native-screens` w trakcie animacji
        przez moment nie ma nad sobą żadnej nieprzezroczystej warstwy, więc prześwituje
        tło okna Androida (domyślnie białe). Ta ramka zamyka dziurę od strony JS —
        natywne tło okna ustawia dodatkowo `backgroundColor` w `app.json`.
      */}
      <View style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
        <AuthGate />
      </View>
    </ServicesProvider>
  );
}

/**
 * Bramka tożsamości (§3.0): bez profilu jedyną drogą jest 00-login; z profilem —
 * aplikacja. Pętla synca żyje TUTAJ, nad nawigatorem: okazje do wysyłki nie mogą
 * zależeć od tego, który ekran jest otwarty (silnik i bramkę `signed_in` pętla
 * czyta sama ze store'ów).
 */
function AuthGate() {
  const { theme } = useTheme();
  const status = useAuthStore((s) => s.status);

  useSyncLoop();

  if (status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.green} size="large" />
      </View>
    );
  }

  if (status === 'signed_out') return <LoginScreen />;

  return <RootNavigator />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  msg: { textAlign: 'center' },
});
