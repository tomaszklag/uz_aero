/**
 * Ninerdeck - POWRÓT NA EKRAN DOMOWY (3.0.0, epik R-E).
 *
 * Od zakładek „dom" przestał być jedną trasą: Pulpit, Kalendarz i Historia są ekranami
 * WEWNĄTRZ trasy `Tabs`, więc wskazanie ich ze stosu wymaga zagnieżdżonego kształtu
 * (`navigate('Tabs', { screen: 'History' })`). Ta funkcja jest jedynym miejscem, które
 * ten kształt zna.
 *
 * Powód jest ten sam, dla którego kod pilota rozwiązuje jeden hook, a nie sześć ekranów:
 * gdyby każde wyjście z flow składało zagnieżdżenie samo, pierwsza zmiana nazwy zakładki
 * zostawiłaby połowę aplikacji na trasie, której nie ma - i objawiłoby się to dopiero
 * w locie, bo `navigate` przyjmuje dowolny napis.
 *
 * `navigate`, a nie `reset`: `Tabs` leży POD flow lotu w tym samym stosie, więc nawigacja
 * do niej ZDEJMUJE kroki przejęcia i kokpit, zamiast budować drugi komplet ekranów.
 */

import type { TabsParamList } from './TabsNavigator';

/** Minimum, jakiego ta funkcja potrzebuje - ekrany typują nawigację luźno. */
export interface HomeNavigator {
  navigate: (screen: string, params?: object) => void;
}

/**
 * Wraca na ekran domowy, domyślnie na PULPIT.
 *
 * Zakładkę podaje się wtedy, gdy powrót ma trafić gdzie indziej niż start dnia - tak
 * wraca ekran operacji (10), bo wszedł do niego przez listę w Historii.
 */
export function goHome(navigation: HomeNavigator, tab: keyof TabsParamList = 'Dashboard'): void {
  navigation.navigate('Tabs', { screen: tab });
}
