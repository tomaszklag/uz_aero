/**
 * UZ Aero - TREŚĆ arkusza `admin/src/styles/tokens.css` (czysta funkcja).
 *
 * Osobno od pisania pliku (`emitCss.ts`), bo dokładnie tę treść porównuje test panelu
 * (`admin/test/tokens.generated.test.ts`). Gdyby renderowanie siedziało w skrypcie CLI,
 * test musiałby albo uruchamiać proces, albo powtórzyć nagłówek u siebie - a powtórzony
 * nagłówek przestaje cokolwiek sprawdzać.
 *
 * Dlaczego plik, a nie wstrzykiwanie w runtime: panel ma JEDEN motyw
 * (`docs/architektura-panelu-frontend.md` §1.6), więc `document.documentElement.style`
 * dawałoby wyłącznie migotanie przed pierwszym paintem i uzależnienie stylu od
 * wykonania JS. Statyczny arkusz działa, zanim cokolwiek się wykona, i widać go
 * w przeglądzie kodu.
 */

import { themeCssBlock } from '../src/cssVars';
import type { Theme } from '../src/theme';

/**
 * Nagłówek jest OSTRZEŻENIEM, nie ozdobą: plik leży w `admin/src/styles/` obok
 * arkuszy pisanych ręcznie, więc bez tej ramki poprawka „na szybko" w kolorze
 * wyglądałaby na najzupełniej normalną i przeżyłaby do pierwszego przebiegu skryptu.
 */
export const TOKENS_CSS_HEADER = `/* ══════════════════════════════════════════════════════════════════════
   PLIK GENEROWANY - NIE EDYTUJ RĘCZNIE.
   Źródło: packages/tokens (THEMES.night) · generator: packages/tokens/scripts/emitCss.ts
   Odtworzenie: npm run tokens:css --workspace admin
   Równość pliku ze źródłem przybija admin/test/tokens.generated.test.ts.

   Panel ma JEDEN motyw (night) i nie ma przełącznika: pięć motywów aplikacji
   istnieje dla kokpitu w słońcu i nocą w kabinie, a administrator siedzi przy
   biurku (docs/architektura-panelu-frontend.md §1.6).

   Wymiarów ramy panelu (--sidebar-w, --topbar-h) TU NIE MA i nie będzie -
   to układ jednej powierzchni, a nie token produktu. Mieszkają w layout.css.
   ══════════════════════════════════════════════════════════════════════ */`;

/** Nagłówek + jeden blok `:root`. Dokładnie to, co ma leżeć w pliku. */
export function renderTokensCss(theme: Theme): string {
  return `${TOKENS_CSS_HEADER}\n\n${themeCssBlock(theme)}\n`;
}
