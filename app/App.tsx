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

import React from 'react';
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
import { useAppBootstrap } from './src/ui/bootstrap/appBootstrap';

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
    <>
      <StatusBar style={theme.isLight ? 'dark' : 'light'} />
      <RootNavigator />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  msg: { textAlign: 'center' },
});
