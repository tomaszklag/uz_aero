/**
 * UZ Aero - panel: `design/panel/panel.css` MUSI być tym, co składa generator.
 *
 * Makiety i panel mają jeden arkusz - złożony z `admin/src/styles/` i ramy makiety
 * (`design/panel/rama.css`). Plik leżący w repozytorium da się „poprawić na szybko"
 * i taka poprawka wygląda w diffie normalnie, a znika przy najbliższym przebiegu
 * generatora. Gorszy kierunek: poprawka w arkuszu panelu bez przebiegu generatora
 * daje makietę w innym stylu niż panel - dokładnie ten rozjazd, przed którym
 * `panel.css` z 2026-09-07 bronił się prozą w nagłówku.
 *
 * Bliźniak `tokens.generated.test.ts` - ten pilnuje odcinka tokeny → panel, tamten
 * odcinka panel → makiety.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { composePanelCss, PANEL_CSS_HEADER } from '../scripts/panelCss';

const PANEL_CSS = join(__dirname, '..', '..', 'design', 'panel', 'panel.css');
// Bez '\r' z tego samego powodu, co w generatorze: `core.autocrlf=true` kładzie plik
// na dysku z CRLF, a porównujemy TREŚĆ, nie sposób zapisu końca linii.
const content = readFileSync(PANEL_CSS, 'utf8').replace(/\r\n/g, '\n');

describe('design/panel/panel.css', () => {
  it('jest DOKŁADNIE wynikiem generatora', () => {
    // Bajt w bajt: `npm run panel:css --workspace admin` nie może produkować
    // różnicy w repozytorium.
    expect(content).toBe(composePanelCss());
  });

  it('ostrzega, że jest generowany - i jest to PIERWSZA rzecz w pliku', () => {
    expect(content.startsWith(PANEL_CSS_HEADER)).toBe(true);
    expect(PANEL_CSS_HEADER).toContain('PLIK GENEROWANY');
  });

  it('kontrola testu: plik naprawdę niesie arkusze panelu i ramę makiety', () => {
    // Bez tego porównanie wyżej przechodziłoby na pustym generatorze.
    expect(content).toContain('--green: #2ECC71');
    expect(content).toContain('.sidebar-nav');
    expect(content).toContain('.table-wrap');
    expect(content).toContain('.browser {');
    expect(content).toContain('.login-google-mock');
  });

  it('rama makiety NIE wycieka do arkuszy panelu', () => {
    // Klasy kanwy i okna przeglądarki istnieją wyłącznie w `rama.css`. Gdyby któraś
    // trafiła do `admin/src/styles/`, panel dostałby regułę dla obrazka, którego nie ma.
    const styles = composePanelCss().split('RAMA MAKIETY - KANWA')[0] ?? '';
    for (const frameOnly of ['.browser', '.chrome', '.canvas-label', '.inv-demo', '.idx-card']) {
      expect(styles).not.toContain(`${frameOnly} {`);
    }
  });
});
