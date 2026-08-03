/**
 * UZ Aero — motyw jako ZMIENNE CSS (dla panelu webowego).
 *
 * Aplikacja mobilna czyta tokeny jako obiekt (`Theme`), bo React Native nie ma CSS.
 * Przeglądarka woli zmienne: mockupy w `design/admin/` są napisane na `var(--green)`,
 * `var(--surface-raised)` i tak dalej, a `CLAUDE.md` zakazuje hardcoded kolorów.
 * Ten moduł zamienia jedno na drugie, żeby panel nie musiał trzymać DRUGIEJ kopii
 * palety — dokładnie tego problemu, dla którego ten pakiet powstał.
 *
 * Nazwy zmiennych powstają mechanicznie z nazw tokenów (`surfaceRaised` →
 * `--surface-raised`), więc zgadzają się z mockupami bez ręcznego słownika, którego
 * nikt by nie pilnował. Test w tym pakiecie porównuje wynik z blokiem `:root`
 * w `design/admin/SZABLON.html`.
 */

import type { Theme } from './theme';
import { fontFamilyCss } from './typography';

/** `surfaceRaised` → `surface-raised`. Cyfry zostają przy poprzedzającym słowie. */
const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Zmienne CSS motywu: kolory z palety + trzy rodziny czcionek.
 *
 * Wymiarów ramy panelu (`--sidebar-w`, `--topbar-h`, `--app-scale`) tu NIE MA i nie
 * powinno być: to układ jednego ekranu w jednej aplikacji, a nie token produktu.
 */
export function themeCssVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [token, value] of Object.entries(theme.colors)) {
    vars[`--${kebab(token)}`] = value;
  }
  vars['--font-display'] = fontFamilyCss.display;
  vars['--font-body'] = fontFamilyCss.body;
  vars['--font-mono'] = fontFamilyCss.mono;
  return vars;
}

/** Ten sam zestaw jako gotowa treść bloku `:root { … }` do wstrzyknięcia w arkusz. */
export function themeCssBlock(theme: Theme, selector = ':root'): string {
  const body = Object.entries(themeCssVars(theme))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `${selector} {\n${body}\n}`;
}
