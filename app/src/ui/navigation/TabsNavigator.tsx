/**
 * Ninerdeck - DOLNE ZAKŁADKI (3.0.0, rezerwacje: issue #145, epik R-E).
 *
 * Ekran startowy przestał być samym logiem dnia, więc aplikacja dostaje pasek: **Pulpit ·
 * Kalendarz · Historia**. Trzy pozycje i ani jednej więcej - każda odpowiada na inne
 * pytanie W CZASIE: co mam dziś, co jest zaplanowane, co już poleciałem.
 *
 * ══ KOKPITU W TYM PASKU NIE MA I BYĆ NIE MOŻE ══
 * Kokpit jest stanem modalnym (CLAUDE.md, issue #82): dopóki pilot trzyma samolot, z 04/05
 * nie prowadzi żadna droga bokiem. Dlatego zakładki są JEDNYM EKRANEM STOSU, a flow lotu
 * (02 → 02E → 02A → kokpit → 09B) leży NAD nimi - wejście w lot przykrywa pasek w całości,
 * bez ani jednej linijki warunku w kokpicie. Zakładka wyprowadzająca z kokpitu nie byłaby
 * zmianą nawigacji, tylko skasowaniem modalności.
 *
 * ══ PASEK RYSUJEMY SAMI ══
 * Domyślny pasek `bottom-tabs` niesie własną typografię i własne kolory, a makieta
 * (`design/20-pulpit.html`, `.tabbar`) ma mono-wersaliki i akcent z tokenów. Własny
 * renderer jest tu tańszy niż nadpisywanie ośmiu opcji - i pilnuje reguły „zero kolorów
 * spoza tokenów".
 *
 * Zależność `@react-navigation/bottom-tabs` jest czystym JS-em na `react-native-screens`,
 * które projekt już ma - więc ta zmiana jedzie **OTA**, bez nowego APK.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';

import { useTheme, type Theme } from '../theme';
import { AppText } from '../components/foundation/AppText';
import { Icon } from '../components/foundation/Icon';
import { TABS } from './tabs';
import { DashboardScreen } from '../screens/DashboardScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { HistoryScreen } from '../screens/HistoryScreen';

export type TabsParamList = {
  /** 20 - PULPIT: sumy doby, najbliższa rezerwacja, akcje. Ekran startowy aplikacji. */
  Dashboard: undefined;
  /** 21 - KALENDARZ: zajętość floty. Jedyne miejsce z osią maszyn × czas. */
  Calendar: undefined;
  /** 24 - HISTORIA: WSZYSTKIE operacje, dzisiejsze i wcześniejsze, z oknem korekty. */
  History: undefined;
};

const Tabs = createBottomTabNavigator<TabsParamList>();

export function TabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} />
      <Tabs.Screen name="Calendar" component={CalendarScreen} />
      <Tabs.Screen name="History" component={HistoryScreen} />
    </Tabs.Navigator>
  );
}

function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = styles(theme);

  return (
    // Dolna wyściółka z BEZPIECZNEGO OBSZARU, nie ze stałej: makieta ma tam 22 px pod
    // wskaźnik gestu iPhone'a, a telefon z przyciskami systemowymi nie potrzebuje ani
    // piksela. Podłoga 8 px, żeby pasek nie kleił się do krawędzi ekranu.
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (tab == null) return null;
        const active = state.index === index;

        return (
          <Pressable
            key={route.key}
            style={s.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => {
              // `navigate` bez parametrów, a nie `emit('tabPress')` ręcznie: przy powrocie
              // na zakładkę, na której już stoimy, react-navigation sam resetuje jej stos.
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!active && !event.defaultPrevented) navigation.navigate(route.name);
            }}
          >
            <Icon
              name={tab.icon}
              size={20}
              color={active ? theme.colors.green : theme.colors.textMuted}
            />
            <AppText variant="micro" tone={active ? 'green' : 'muted'}>
              {tab.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingTop: 6,
      paddingHorizontal: 8,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingVertical: 6,
      paddingHorizontal: 4,
      borderRadius: 10,
      // 44 dp to minimum celu dotykowego - ta sama podłoga, co przy przyciskach kroku
      // w `TimeStepper` (issue #43).
      minHeight: 44,
    },
  });
