/**
 * UZ Aero - panel: ścieżka okruszków dla adresu (moduł CZYSTY, testowany bez DOM-u).
 *
 * Okruszki wyprowadzamy z KANONICZNEJ nawigacji, a nie z osobnej tablicy tytułów:
 * dwie listy nazw ekranów rozjechałyby się przy pierwszym przemianowaniu, a rozjazd
 * między sidebarem („Dni lotne") a topbarem („Dni") wygląda jak dwa różne miejsca.
 */

import { NAV_GROUPS } from './navItems';

/** Korzeń ścieżki - nie jest ekranem, więc nigdy nie jest linkiem. */
const ROOT = 'Panel';

/**
 * `/dni` → `['Panel', 'Dni lotne']`. Adres spoza nawigacji (deep link w szczegół,
 * literówka) daje `['Panel']` - bez zmyślonego tytułu: lepiej pokazać mniej niż
 * podpisać ekran nazwą, której nikt nie zatwierdził.
 */
export function trailFor(pathname: string): string[] {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      // `startsWith` obsługuje ścieżki w głąb (`/dni/<uuid>` należy do „Dni lotne").
      // Granicą jest `/`, żeby `/dni` nie połykało hipotetycznego `/dniowka`.
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        return [ROOT, item.label];
      }
    }
  }
  return [ROOT];
}
