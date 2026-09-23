/**
 * Ninerdeck - szkielet nawigacji.
 *
 * Flow (docs `_main.md.txt` §7, model 2026-08-10): 00 login → **01 „Mój dzień"
 * (EKRAN DOMOWY)** → 02/02e/02a przejęcie → 04a kokpit PRZED uruchomieniem →
 * 05x kokpit w locie (wiele LOTÓW jednej sesji) → 04 kokpit PO zatrzymaniu (drugiego
 * startu nie ma) → 09b zdanie = zatwierdzenie logu → z powrotem na 01.
 * Z 01 także 15 - ręczny wpis całego lotu po fakcie.
 *
 * **Wszystko wraca na 01, nie do kokpitu.** Dzień pilota nie ma „startu" ani „końca" jako
 * kroków flow: zaczyna się pierwszą sesją i NICZYM się nie domyka (issue #23). Dlatego
 * w stosie nie ma już ani splasha („NOWY DZIEŃ LOTNY" otwierało coś, czego się nie
 * otwiera), ani ekranu zakończenia dnia - zastąpiło go zdanie SAMOLOTU.
 *
 * Kolejne ekrany dokładamy do `RootStackParamList` i tutaj - reszta aplikacji nie musi
 * wiedzieć, że przybyły.
 *
 * Nawigacja jest **bezgłowa**: każdy ekran rysuje własny nagłówek zgodny z mockupem,
 * a natywny pasek stosu jest wyłączony (patrz `screenOptions` niżej).
 */

import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigationState, NavigatorScreenParams } from '@react-navigation/native';

import { useTheme } from '../theme';
import { setBugRoute } from '../components/bug/bugReporter';
import { CockpitScreen } from '../screens/CockpitScreen';
import { PreflightAircraftScreen } from '../screens/PreflightAircraftScreen';
import { PreflightTaskScreen } from '../screens/PreflightTaskScreen';
import { PreflightReadingsScreen } from '../screens/PreflightReadingsScreen';
import {
  CockpitReadonlyScreen,
  type CockpitReadonlyParams,
} from '../screens/CockpitReadonlyScreen';
import { CrewChangeScreen } from '../screens/CrewChangeScreen';
import { ManualFlightScreen } from '../screens/ManualFlightScreen';
import { BookingDetailsScreen } from '../screens/BookingDetailsScreen';
import { DecisionScreen } from '../screens/DecisionScreen';
import { NewBookingScreen } from '../screens/NewBookingScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { RefuelScreen } from '../screens/RefuelScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TabsNavigator, type TabsParamList } from './TabsNavigator';
import { ReleaseAircraftScreen } from '../screens/ReleaseAircraftScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { TrackScreen, type TrackScreenParams } from '../screens/TrackScreen';

export type RootStackParamList = {
  /**
   * ZAKŁADKI (3.0.0): Pulpit · Kalendarz · Historia - cały ekran domowy aplikacji.
   *
   * Stoją jako JEDEN ekran stosu, a flow lotu leży NAD nimi. To nie jest szczegół
   * montowania: kokpit jest stanem modalnym (CLAUDE.md, issue #82), więc wejście
   * w lot ma przykryć pasek W CAŁOŚCI, bez ani jednej linijki warunku w kokpicie.
   */
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  Cockpit: undefined;
  /** Nowy lot w trzech krokach (§3.1): kto i czym → zadanie → odczyty i „ROZPOCZNIJ LOT". */
  PreflightAircraft: undefined;
  PreflightTask: undefined;
  PreflightReadings: undefined;
  /** Podgląd cudzego samolotu bez przejmowania go (04b) - wejście z listy na 02. */
  CockpitReadonly: CockpitReadonlyParams;
  Refuel: undefined;
  CrewChange: undefined;
  /*
   * `ManualLog` (ekran 08, lista ręczna) USUNIĘTY 2026-08-13 przy issue #43: był drugim
   * widokiem tej samej sesji, z własną osią i własnym słownikiem. Poprawianie jest odtąd
   * TRYBEM ekranu `Stats` - stąd jego parametry `edit` i `from`.
   */
  /** 15 - ręczny wpis CAŁEGO lotu z 01: kompletna sesja po fakcie (model 2026-08-10). */
  ManualFlight: undefined;
  /**
   * Formularz rezerwacji (22 → 22A). `aircraftId` i `startsAt` PODSTAWIAJĄ maszynę
   * i porę: tapnięcie w wolne pasmo kalendarza ma wejść w formularz z tym, w co pilot
   * przed chwilą wycelował, a nie kazać mu przepisywać to z ekranu.
   *
   * `bookingId` znaczy POPRAWKĘ istniejącego terminu („PRZESUŃ I POPRAW" z karty 23),
   * a nie nową rezerwację - ten sam formularz obsługuje oba, bo pyta o to samo.
   */
  NewBooking: { aircraftId?: string; startsAt?: number; bookingId?: string } | undefined;
  /** Karta rezerwacji (23) - z kalendarza, z Pulpitu i po zapisie formularza. */
  BookingDetails: { bookingId: string };
  /**
   * 25 - skrzynka powiadomień (3.1.0): decyzje o moich rezerwacjach i prośby o moją
   * zgodę. Wejście DZWONKIEM z Pulpitu - czwartej zakładki nie ma (§9.4).
   */
  Notifications: undefined;
  /** 26 - decyzja o CUDZEJ rezerwacji: zgoda albo odmowa z powodem. Wejście z wiersza „Do decyzji". */
  Decision: { bookingId: string };
  /** 09B/09C - zdanie samolotu = zatwierdzenie logu sesji. NIE kończy dnia pilota. */
  ReleaseAircraft: undefined;
  /**
   * 10 - detale i korekty JEDNEJ sesji; wejście kafelkiem sesji na 01 i w historii (12).
   *
   * `edit` włącza od razu TRYB EDYCJI (issue #43) - używa go kokpit po zatrzymaniu
   * silnika, a `from` mówi, dokąd wraca nagłówek: kokpit jest stanem modalnym, więc
   * wejście stamtąd musi wracać do kokpitu, nie na „Mój dzień".
   */
  Stats: { edit?: boolean; from?: string } | undefined;
  /**
   * 14 - ślad CAŁEJ sesji: trasa, profil pionowy i log punktów. Wejście miniaturą z 10.
   * Ekran 16 (szczegóły jednego lotu) usunięty przy issue #38 - zapis GPS powstaje
   * w jednym ciągu, więc krojenie go na loty dokładało ekran, który nic nie dodawał.
   */
  Track: TrackScreenParams;
  /** 11 - status synchronizacji; wejście z ustawień (13), sekcja „Synchronizacja". */
  Sync: undefined;
  /** 13 - ustawienia: motyw, PIN, konto, diagnostyka GPS. */
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Nazwa trasy, na której pilot NAPRAWDĘ stoi.
 *
 * Od zakładek (3.0.0) czubek stosu bywa nawigatorem, nie ekranem: `state.routes[i].name`
 * oddawało wtedy „Tabs" dla Pulpitu, Kalendarza i Historii naraz - czyli zgłoszenie
 * błędu (issue #87) przestawało mówić, KTÓRY ekran pilot miał przed sobą. Schodzimy
 * więc do najgłębszego stanu; `state` zagnieżdżonego nawigatora ma ten sam kształt.
 */
function activeRoute(state: NavigationState | undefined): string | null {
  let route = state?.routes[state.index ?? 0];
  while (route?.state != null) {
    const child = route.state as NavigationState;
    route = child.routes[child.index ?? 0];
  }
  return route?.name ?? null;
}

export function RootNavigator({
  initialRouteName = 'Tabs',
}: {
  /**
   * Punkt wejścia zależy od stanu dnia: otwarta sesja po restarcie wraca prosto do
   * kokpitu (`App.tsx` sprawdza `session_meta`, §5.2), świeży start zaczyna od zakładek.
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
    <NavigationContainer
      theme={navTheme}
      /* Bieżąca trasa dla kontekstu zgłoszenia błędu (issue #87). Tutaj, a nie
         w ekranach: dzięki temu żaden ekran nie musi wiedzieć, że reporter istnieje,
         a nowy ekran dostaje kontekst w chwili dopisania do stosu. */
      onStateChange={(state) => setBugRoute(activeRoute(state))}
      onReady={() => setBugRoute(initialRouteName === 'Tabs' ? 'Dashboard' : initialRouteName)}
    >
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          // Bez natywnego paska nawigacji. W mockupach ekran idzie od status bara prosto
          // do własnego nagłówka (`.app-header`) - pasek systemowy dokładałby drugi tytuł,
          // drugą strzałkę wstecz i ~56 px wysokości, których design nie przewiduje.
          // Powrót między krokami prowadzi `ScreenHeader onBack`; sprzętowy „wstecz"
          // Androida działa niezależnie od tego ustawienia.
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="Tabs" component={TabsNavigator} />
        <Stack.Screen name="Cockpit" component={CockpitScreen} />
        <Stack.Screen name="PreflightAircraft" component={PreflightAircraftScreen} />
        <Stack.Screen name="PreflightTask" component={PreflightTaskScreen} />
        <Stack.Screen name="PreflightReadings" component={PreflightReadingsScreen} />
        <Stack.Screen name="CockpitReadonly" component={CockpitReadonlyScreen} />
        <Stack.Screen name="Refuel" component={RefuelScreen} />
        <Stack.Screen name="CrewChange" component={CrewChangeScreen} />
        <Stack.Screen name="ManualFlight" component={ManualFlightScreen} />
        <Stack.Screen name="NewBooking" component={NewBookingScreen} />
        <Stack.Screen name="BookingDetails" component={BookingDetailsScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Decision" component={DecisionScreen} />
        <Stack.Screen name="ReleaseAircraft" component={ReleaseAircraftScreen} />
        <Stack.Screen name="Stats" component={StatsScreen} />
        <Stack.Screen name="Track" component={TrackScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
