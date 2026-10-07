/**
 * Ninerdeck - POWRÓT NA EKRAN DOMOWY (3.0.0, epik R-E; cofanie stosu od 4.0.0).
 *
 * Od zakładek „dom" przestał być jedną trasą: Pulpit, Kalendarz i Historia są ekranami
 * WEWNĄTRZ trasy `Tabs`, więc wskazanie ich ze stosu wymaga zagnieżdżonego kształtu
 * (`{ screen: 'History' }`). Ten moduł jest jedynym miejscem, które ten kształt zna.
 *
 * Powód jest ten sam, dla którego kod pilota rozwiązuje jeden hook, a nie sześć ekranów:
 * gdyby każde wyjście z flow składało zagnieżdżenie samo, pierwsza zmiana nazwy zakładki
 * zostawiłaby połowę aplikacji na trasie, której nie ma - i objawiłoby się to dopiero
 * w locie, bo nawigacja przyjmuje dowolny napis.
 *
 * ══ POWRÓT COFA STOS, NIE DOKŁADA DRUGICH ZAKŁADEK ══
 * Do 4.0.0 stało tu `navigate('Tabs', …)` z obietnicą, że to „zdejmuje kroki przejęcia
 * i kokpit". W React Navigation 7 (aplikacja stoi na 7.x od pierwszych ekranów) tak nie
 * było nigdy: `navigate` cofa się do trasy wyłącznie wtedy, gdy jest BIEŻĄCA, a inaczej
 * dokłada nową. Każdy lot zostawiał więc pod Pulpitem całe flow z zamontowanym kokpitem,
 * a „wstecz" z Pulpitu wracało do zakończonego lotu - po zapisie lotu ręcznego do
 * wypełnionego formularza, którego ponowny zapis dublował lot.
 *
 * Powrót ma odtąd dwie gałęzie, obie przybite testem na prawdziwym routerze
 * (`__tests__/goHome.test.ts`):
 *  - zakładki leżą pod flow (zwykły przypadek) → `popTo`: wszystko nad nimi schodzi
 *    ze stosu, a zakładki zostają TE SAME - bez przemontowania i bez utraty stanu list;
 *  - zakładek pod spodem nie ma, bo aplikacja wznowiła się prosto do kokpitu
 *    (`resumeTarget.ts`) → stos zaczyna się od nowa od zakładek. `popTo` zamieniłby tu
 *    tylko bieżący ekran i zostawił kokpit zdanego samolotu pod Pulpitem. To jest jedyne
 *    zastąpienie całego stosu w aplikacji i nie zabiera drogi do kokpitu: pod spodem nie
 *    ma żadnego domu, do którego dałoby się wrócić inaczej.
 *
 * Cofnięcie przechodzi przez `beforeRemove` KAŻDEGO zdejmowanego ekranu, więc bramki
 * działają tak samo jak przy „wstecz": kokpit, w którym pilot dalej trzyma maszynę,
 * zatrzymuje powrót arkuszem 04D, a formularz z bramką rezygnacji wychodzi przez
 * `exit.proceed(homeAction(...))`. Prosto przez `goHome` jego bramka przechwyciłaby
 * własne wyjście - pilnuje tego strażnik w `architecture.test.ts`.
 */

import { CommonActions, StackActions, type NavigationAction } from '@react-navigation/native';

import type { TabsParamList } from './TabsNavigator';

/** Trasa stosu, pod którą mieszkają zakładki. */
const HOME = 'Tabs';

/** Zakładka, na którą prowadzi powrót. */
export type HomeTab = keyof TabsParamList;

/** Tyle stosu, ile decyzja potrzebuje: czy zakładki leżą gdzieś pod spodem. */
export interface HomeStack {
  routes: readonly { name: string }[];
}

/** Minimum, jakiego `goHome` potrzebuje - ekrany typują nawigację luźno. */
export interface HomeNavigator {
  dispatch: (action: NavigationAction) => void;
  getState: () => HomeStack;
}

/**
 * Akcja powrotu na ekran domowy, domyślnie na PULPIT.
 *
 * Osobno od `goHome`, bo formularz z bramką rezygnacji nie wychodzi sam: oddaje akcję
 * bramce (`exit.proceed`), a ta wypuszcza ją dopiero po opuszczeniu bramki.
 *
 * Parametry są za każdym razem NOWYM obiektem. Zakładki przełączają się na `screen`
 * z parametrów trasy tylko wtedy, gdy jeszcze go nie skonsumowały - powtórzony obiekt
 * zostawiłby pilota na zakładce, z której wyszedł.
 */
export function homeAction(stack: HomeStack, tab: HomeTab = 'Dashboard'): NavigationAction {
  const params = { screen: tab };
  return stack.routes.some((route) => route.name === HOME)
    ? StackActions.popTo(HOME, params)
    : CommonActions.reset({ index: 0, routes: [{ name: HOME, params }] });
}

/**
 * Wraca na ekran domowy, domyślnie na PULPIT.
 *
 * Zakładkę podaje się wtedy, gdy powrót ma trafić gdzie indziej niż start dnia - tak
 * wraca karta rezerwacji (do Kalendarza) i unieważniona operacja (do Historii).
 */
export function goHome(navigation: HomeNavigator, tab: HomeTab = 'Dashboard'): void {
  navigation.dispatch(homeAction(navigation.getState(), tab));
}
