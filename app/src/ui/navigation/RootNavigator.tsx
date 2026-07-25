/**
 * UZ Aero — szkielet nawigacji.
 *
 * Docelowy flow (docs `_main.md.txt` §7): 00 login → 01 splash → 02/02a/03 preflight
 * → 04/04a kokpit ground ⇄ 05x kokpit w locie → 06/07/08 akcje → 09/10/11 zamknięcie.
 *
 * Na razie w stosie są dwa ekrany: pierwszy realny (kokpit ground) i katalog Design
 * Systemu. Kolejne ekrany dokładamy do `RootStackParamList` i tutaj — reszta aplikacji
 * nie musi wiedzieć, że przybyły.
 */

import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useTheme } from '../theme';
import { CockpitScreen } from '../screens/CockpitScreen';
import { StyleGuideScreen } from '../screens/StyleGuideScreen';

export type RootStackParamList = {
  Cockpit: undefined;
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
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.textPrimary,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen
          name="Cockpit"
          component={CockpitScreen}
          options={{ title: 'Kokpit' }}
        />
        <Stack.Screen
          name="StyleGuide"
          component={StyleGuideScreen}
          options={{ title: 'Design System' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
