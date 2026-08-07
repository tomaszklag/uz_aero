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
import { resumeTarget, type ResumeTarget } from './src/ui/navigation/resumeTarget';
import { useAppBootstrap, useGpsPort, useSensorPort } from './src/ui/bootstrap/appBootstrap';
import { ServicesProvider } from './src/ui/bootstrap/ServicesProvider';
import { useGps } from './src/ui/bootstrap/servicesContext';
import { useAuthStore } from './src/ui/store/authStore';
import { useSessionStore } from './src/ui/store/sessionStore';
import { useBackgroundTracking } from './src/ui/hooks/useBackgroundTracking';
import { useSyncLoop } from './src/ui/hooks/useSyncLoop';
import { LoginScreen } from './src/ui/screens/LoginScreen';
import { PinScreen } from './src/ui/screens/PinScreen';

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
  const sensors = useSensorPort();

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
    <ServicesProvider gps={gps} sensors={sensors} trace={boot.trace}>
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
 * Bramka tożsamości (§3.0): bez profilu — 00a-login; z profilem bez PIN-u — „Ustaw
 * PIN"; z PIN-em — zamek 00; odblokowane — aplikacja. Pętla synca żyje TUTAJ, nad
 * nawigatorem: okazje do wysyłki nie mogą zależeć od tego, który ekran jest otwarty
 * (silnik i bramkę `signed_in` pętla czyta sama ze store'ów).
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
  if (status === 'pin_setup' || status === 'locked') return <PinScreen />;

  return <ResumeGate />;
}

/**
 * Wznowienie po restarcie (§5.2): pilot wraca tam, gdzie stoi jego samolot.
 *
 * Trzyma maszynę → prosto do kokpitu, bo restart w środku dnia lotnego nie może kosztować
 * tapnięcia w drodze do STOP ENGINE. Zdał ją albo nie ma sesji → „Mój dzień" (01).
 * Sama decyzja mieszka w `resumeTarget` — jest regułą flow, nie szczegółem montowania,
 * i ma test (`claimStrip.test.ts`).
 */
function ResumeGate() {
  const { theme } = useTheme();
  const queries = useSessionStore((s) => s.queries);
  const loadSession = useSessionStore((s) => s.loadSession);
  const [initial, setInitial] = React.useState<ResumeTarget | null>(null);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const current = queries != null ? await queries.currentSession() : null;
        if (current != null) {
          await loadSession(current.sessionUuid);
          const { projection } = useSessionStore.getState();
          if (alive) setInitial(resumeTarget(projection));
          return;
        }
      } catch {
        // Uszkodzone meta nie może zablokować wejścia — najwyżej zaczniemy od 01.
      }
      if (alive) setInitial('MyDay');
    })();
    return () => {
      alive = false;
    };
  }, [queries, loadSession]);

  if (initial == null) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.green} size="large" />
      </View>
    );
  }

  return (
    <>
      <BackgroundTrackingBinder />
      <RootNavigator initialRouteName={initial} />
    </>
  );
}

/**
 * Usługa GPS w tle chodzi za `engineRunning` (start silnika = start usługi, stop =
 * stop). Binder montuje się CELOWO tutaj, obok nawigatora — czyli dopiero po
 * `loadSession` — bo jego pierwszy odczyt stanu też jest komendą: zamontowany wyżej
 * (AppRoot) widziałby jeszcze `engineRunning=false` i przy każdym otwarciu aplikacji
 * w locie gasiłby adoptowaną usługę (mrugnięcie powiadomienia + dziura w śladzie).
 * Ekran blokady PIN usługi nie dotyka — binder żyje dopiero za bramką tożsamości.
 */
function BackgroundTrackingBinder() {
  useBackgroundTracking(useGps());
  return null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  msg: { textAlign: 'center' },
});
