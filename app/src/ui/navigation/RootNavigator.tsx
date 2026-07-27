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
import { PreflightReadingsScreen } from '../screens/PreflightReadingsScreen';
import { PreflightConfirmScreen } from '../screens/PreflightConfirmScreen';
import { StyleGuideScreen } from '../screens/StyleGuideScreen';

export type RootStackParamList = {
  Cockpit: undefined;
  PreflightAircraft: undefined;
  PreflightReadings: undefined;
  PreflightConfirm: undefined;
  StyleGuide: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
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
        initialRouteName="Cockpit"
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
        <Stack.Screen name="Cockpit" component={CockpitScreen} />
        <Stack.Screen name="PreflightAircraft" component={PreflightAircraftScreen} />
        <Stack.Screen name="PreflightReadings" component={PreflightReadingsScreen} />
        <Stack.Screen name="PreflightConfirm" component={PreflightConfirmScreen} />
        <Stack.Screen name="StyleGuide" component={StyleGuideScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
