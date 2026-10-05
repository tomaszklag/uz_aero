/**
 * Ninerdeck - TRASA, NA KTÓREJ PILOT NAPRAWDĘ STOI.
 *
 * Od zakładek (3.0.0) czubek stosu bywa nawigatorem, nie ekranem: `state.routes[i].name`
 * oddawało wtedy „Tabs" dla Pulpitu, Kalendarza i Historii naraz - czyli zgłoszenie
 * błędu (issue #87) przestawało mówić, KTÓRY ekran pilot miał przed sobą. Schodzimy
 * więc do najgłębszego stanu; `state` zagnieżdżonego nawigatora ma ten sam kształt.
 *
 * Trasa niesie też PARAMETRY ekranu: baner w aplikacji (kanał klubu 4.0.0, K5) pyta nie
 * tylko o nazwę ekranu, ale o rzecz, którą ekran pokazuje - na karcie tej samej
 * rezerwacji baner by się powtarzał (pkt 43 zleceń).
 *
 * Czysty moduł z typem strukturalnym zamiast typów nawigatora: wystarczy mu kształt
 * stanu, a test nie musi stawiać nawigacji.
 */

/** Ekran na czubku stosu - nazwa trasy i jej parametry. */
export interface ScreenRoute {
  name: string;
  params?: Readonly<Record<string, unknown>>;
}

/** Stan nawigatora w kształcie, którego potrzeba do zejścia w głąb. */
export interface NavigationStateLike {
  index?: number;
  routes: ReadonlyArray<{ name: string; params?: object; state?: unknown }>;
}

export function activeRoute(state: NavigationStateLike | undefined): ScreenRoute | null {
  let route = state?.routes[state.index ?? 0];
  while (route?.state != null) {
    const child = route.state as NavigationStateLike;
    route = child.routes[child.index ?? 0];
  }
  return route == null ? null : { name: route.name, params: route.params as ScreenRoute['params'] };
}
