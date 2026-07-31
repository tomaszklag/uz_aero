/**
 * UZ Aero — szkielet nawigacji.
 *
 * Docelowy flow (docs `_main.md.txt` §7): 00 login → 01 splash → 02/02a/03 preflight
 * → 04/04a kokpit ground ⇄ 05x kokpit w locie → 06/07/08 akcje → 09/10/11 zamknięcie.
 *
 * W stosie są dziś kokpit, trzy kroki preflightu i katalog Design Systemu. Kolejne ekrany
 * dokładamy do `RootStackParamList` i tutaj — reszta aplikacji nie musi wiedzieć, że przybyły.
 *
 * Nawigacja jest **bezgłowa**: każdy ekran rysuje własny nagłówek zgodny z mockupem,
 * a natywny pasek stosu jest wyłączony (patrz `screenOptions` niżej).
 */

import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useTheme } from '../theme';
import { CockpitScreen } from '../screens/CockpitScreen';
import { PreflightAircraftScreen } from '../screens/PreflightAircraftScreen';
import { PreflightTaskScreen } from '../screens/PreflightTaskScreen';
import { PreflightReadingsScreen } from '../screens/PreflightReadingsScreen';
import { PreflightConfirmScreen } from '../screens/PreflightConfirmScreen';
import {
  CockpitReadonlyScreen,
  type CockpitReadonlyParams,
} from '../screens/CockpitReadonlyScreen';
import { CrewChangeScreen } from '../screens/CrewChangeScreen';
import { ManualLogScreen } from '../screens/ManualLogScreen';
import { RefuelScreen } from '../screens/RefuelScreen';
import { EndOfDayScreen } from '../screens/EndOfDayScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { StyleGuideScreen } from '../screens/StyleGuideScreen';

export type RootStackParamList = {
  /** 01 — ekran startowy dnia (bez otwartej sesji). */
  Splash: undefined;
  /** 12 — historia dni z oknem korekty; wejście ze splasha. */
  History: undefined;
  Cockpit: undefined;
  /** Preflight w czterech krokach (§3.1): kto/czym/od kiedy → zadanie → odczyty → potwierdzenie. */
  PreflightAircraft: undefined;
  PreflightTask: undefined;
  PreflightReadings: undefined;
  PreflightConfirm: undefined;
  /** Podgląd cudzego samolotu bez przejmowania go (04b) — wejście z listy na 02. */
  CockpitReadonly: CockpitReadonlyParams;
  Refuel: undefined;
  CrewChange: undefined;
  ManualLog: undefined;
  EndOfDay: undefined;
  Stats: undefined;
  Sync: undefined;
  /** 13 — ustawienia: motyw, PIN, konto, diagnostyka GPS. */
  Settings: undefined;
  StyleGuide: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator({
  initialRouteName = 'Splash',
}: {
  /**
   * Punkt wejścia zależy od stanu dnia: otwarta sesja po restarcie wraca prosto do
   * kokpitu (`App.tsx` sprawdza `session_meta`, §5.2), świeży start zaczyna od 01.
   */
  initialRouteName?: keyof RootStackParamList;
}) {
  const { theme } = useTheme();

  // Motyw nawigacji budujemy z naszych tokenów, żeby tła ekranów i przejść nie
  // migały kolorem spoza systemu (zasada: kolory wyłącznie z tokenów).
  const navTheme = {
    ...(theme.isLight ? DefaultTheme : DarkTheme),
    colors: {
      ...(theme.isLight ? DefaultTheme : DarkTheme).colors,
      background: theme.colors.bg,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      primary: theme.colors.green,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          // Bez natywnego paska nawigacji. W mockupach ekran idzie od status bara prosto
          // do własnego nagłówka (`.app-header`) — pasek systemowy dokładałby drugi tytuł,
          // drugą strzałkę wstecz i ~56 px wysokości, których design nie przewiduje.
          // Powrót między krokami prowadzi `ScreenHeader onBack`; sprzętowy „wstecz"
          // Androida działa niezależnie od tego ustawienia.
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="Cockpit" component={CockpitScreen} />
        <Stack.Screen name="PreflightAircraft" component={PreflightAircraftScreen} />
        <Stack.Screen name="PreflightTask" component={PreflightTaskScreen} />
        <Stack.Screen name="PreflightReadings" component={PreflightReadingsScreen} />
        <Stack.Screen name="PreflightConfirm" component={PreflightConfirmScreen} />
        <Stack.Screen name="CockpitReadonly" component={CockpitReadonlyScreen} />
        <Stack.Screen name="Refuel" component={RefuelScreen} />
        <Stack.Screen name="CrewChange" component={CrewChangeScreen} />
        <Stack.Screen name="ManualLog" component={ManualLogScreen} />
        <Stack.Screen name="EndOfDay" component={EndOfDayScreen} />
        <Stack.Screen name="Stats" component={StatsScreen} />
        <Stack.Screen name="Sync" component={SyncScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="StyleGuide" component={StyleGuideScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
