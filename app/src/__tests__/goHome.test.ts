/**
 * Ninerdeck - testy POWROTU NA EKRAN DOMOWY (`ui/navigation/goHome.ts`).
 *
 * Pod obserwacją jest STAN STOSU po powrocie, a nie kształt akcji: błąd, który te testy
 * przybijają, siedział w zachowaniu routera. `navigate('Tabs')` w React Navigation 7
 * dokładał drugie zakładki zamiast cofnąć stos - „wstecz" z Pulpitu wracało więc do
 * zakończonego lotu, a po zapisie lotu ręcznego do wypełnionego formularza, którego
 * ponowny zapis dublował lot. Dlatego akcje idą przez PRAWDZIWY `StackRouter` (czysty JS,
 * bez React Native) z trasami stosu aplikacji.
 */

// Ekran wysyła akcje z `@react-navigation/native`, a to pakiet z React Native. Te same
// akcje i ten sam router mieszkają w `@react-navigation/routers` (native je tylko
// przekazuje dalej), więc w teście nawigacja jest samym routerem.
jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/routers'));

import {
  CommonActions,
  StackRouter,
  type NavigationAction,
  type ParamListBase,
  type RouterConfigOptions,
  type StackNavigationState,
} from '@react-navigation/routers';

import { goHome, homeAction } from '../ui/navigation/goHome';

type Stack = StackNavigationState<ParamListBase>;

const router = StackRouter({});

/** Trasy stosu aplikacji, które występują w scenariuszach (komplet: `RootNavigator`). */
const OPTIONS: RouterConfigOptions = {
  routeNames: [
    'Tabs',
    'PreflightAircraft',
    'PreflightTask',
    'PreflightReadings',
    'Cockpit',
    'ReleaseAircraft',
    'ManualFlight',
    'Stats',
    'Notifications',
    'BookingDetails',
  ],
  routeParamList: {},
  routeGetIdList: {},
};

/** Kroki jednego lotu nad zakładkami - dokładnie tak, jak dokłada je aplikacja. */
const FLIGHT = ['PreflightAircraft', 'PreflightTask', 'PreflightReadings', 'Cockpit', 'ReleaseAircraft'];

/** Stos z nazw tras - klucze nadaje router, jak w aplikacji. */
function stack(...names: string[]): Stack {
  return router.getRehydratedState({ routes: names.map((name) => ({ name })) }, OPTIONS);
}

/** Akcja przepuszczona przez router tak, jak zrobi to nawigator aplikacji. */
function apply(state: Stack, action: NavigationAction): Stack {
  // Akcje ekranów są typowane szerzej niż unia routera - router rozpoznaje je po `type`.
  const next = router.getStateForAction(
    state,
    action as Parameters<typeof router.getStateForAction>[1],
    OPTIONS,
  );
  if (next == null) throw new Error(`router nie obsłużył akcji ${action.type}`);
  // RESET oddaje stan częściowy - klucze nadaje mu nawigator przy następnym renderze.
  return router.getRehydratedState(next, OPTIONS);
}

/** `navigation` ekranu: `navigate` to akcja NAVIGATE wysłana do stosu - jak w React Navigation. */
function screenNavigation(initial: Stack) {
  let state = initial;
  return {
    getState: () => state,
    dispatch: (action: NavigationAction) => {
      state = apply(state, action);
    },
    navigate: (name: string, params?: object) => {
      state = apply(state, CommonActions.navigate(name, params));
    },
  };
}

const names = (state: Stack) => state.routes.map((route) => route.name);

describe('powrót na ekran domowy cofa stos', () => {
  it('po zdaniu samolotu schodzą kroki przejęcia, kokpit i 09B - zostają TE SAME zakładki', () => {
    const before = stack('Tabs', ...FLIGHT);
    const navigation = screenNavigation(before);

    goHome(navigation);

    const after = navigation.getState();
    expect(names(after)).toEqual(['Tabs']);
    // Ta sama trasa, nie nowa: zakładki nie przemontowują się i nie gubią stanu list.
    expect(after.routes[0]!.key).toBe(before.routes[0]!.key);
    expect(after.routes[0]!.params).toEqual({ screen: 'Dashboard' });
  });

  it('po zapisie lotu ręcznego „wstecz" z Pulpitu nie wraca do formularza - nie ma go już w stosie', () => {
    const navigation = screenNavigation(stack('Tabs', 'ManualFlight'));

    goHome(navigation);

    expect(names(navigation.getState())).toEqual(['Tabs']);
    // „Wstecz" z Pulpitu idzie do stosu (zakładki mają `backBehavior: firstRoute`), a ten nie
    // ma już czego zdjąć. Przed poprawką zdejmował drugie zakładki i odsłaniał wypełniony
    // krok 4 - ponowne „ZAPISZ LOT" zapisywało ten sam lot drugi raz.
    expect(router.getStateForAction(navigation.getState(), CommonActions.goBack(), OPTIONS)).toBeNull();
  });

  it('kolejne loty nie dokładają zakładek - po każdym powrocie stos ma jedną trasę', () => {
    const navigation = screenNavigation(stack('Tabs'));

    for (let flight = 0; flight < 3; flight++) {
      FLIGHT.forEach((step) => navigation.navigate(step));
      goHome(navigation);
    }

    expect(names(navigation.getState())).toEqual(['Tabs']);
  });

  it('aplikacja wznowiona prosto do kokpitu (bez zakładek pod spodem): stos zaczyna się od zakładek', () => {
    // `popTo` zamieniłby tu tylko bieżący ekran i zostawił kokpit zdanego samolotu pod Pulpitem.
    const navigation = screenNavigation(stack('Cockpit', 'ReleaseAircraft'));

    goHome(navigation);

    const after = navigation.getState();
    expect(names(after)).toEqual(['Tabs']);
    expect(after.routes[0]!.params).toEqual({ screen: 'Dashboard' });
  });

  it('wskazana zakładka dochodzi do zagnieżdżonego nawigatora - zawsze NOWYM obiektem parametrów', () => {
    // Zakładki przełączają się na `screen` z parametrów trasy tylko przy obiekcie, którego
    // jeszcze nie skonsumowały. Tu trasa pamięta Kalendarz z wcześniejszego powrotu, a pilot
    // zdążył przejść na Pulpit - ten sam obiekt zostawiłby go na Pulpicie.
    const tabs = apply(stack('Tabs'), CommonActions.setParams({ screen: 'Calendar' }));
    const remembered = tabs.routes[0]!.params;
    const navigation = screenNavigation(tabs);
    navigation.navigate('Notifications');
    navigation.navigate('BookingDetails', { bookingId: 'b-1' });

    goHome(navigation, 'Calendar');

    const after = navigation.getState();
    expect(names(after)).toEqual(['Tabs']);
    expect(after.routes[0]!.params).toEqual({ screen: 'Calendar' });
    expect(after.routes[0]!.params).not.toBe(remembered);
  });

  it('formularz z bramką rezygnacji oddaje bramce TĘ SAMĄ akcję, którą `goHome` wysyła sam', () => {
    // Formularz wychodzi przez `exit.proceed(homeAction(...))` - prosto przez `goHome` jego
    // bramka przechwyciłaby własne wyjście. Obie drogi mają prowadzić w to samo miejsce.
    const state = stack('Tabs', 'ManualFlight');
    const sent: NavigationAction[] = [];

    goHome({ getState: () => state, dispatch: (action) => sent.push(action) });

    expect(sent).toEqual([homeAction(state)]);
  });
});
