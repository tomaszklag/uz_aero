/**
 * UZ Aero — panel: `src/styles/tokens.css` MUSI być tym, co emituje `@uzaero/tokens`.
 *
 * Po co ten test, skoro plik jest generowany: bo generowany plik leżący w repozytorium
 * jest plikiem — da się go otworzyć i „poprawić kolor na szybko". Taka poprawka wygląda
 * w diffie zupełnie normalnie, a znika przy najbliższym uruchomieniu generatora,
 * czyli w najgorszym możliwym momencie: gdy nikt już nie pamięta, że coś zmieniał.
 *
 * Drugi kierunek jest równie ważny: zmiana palety w `packages/tokens` bez przebiegu
 * generatora daje panel w innym odcieniu niż aplikacja i niż zatwierdzone mockupy.
 * Rozjazd mockup ↔ tokeny pilnuje osobny test w `app/` (`tokensCssVars.test.ts`);
 * ten pilnuje odcinka tokeny → panel.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEMES, themeCssBlock } from '@uzaero/tokens';
import { describe, expect, it } from 'vitest';

import { renderTokensCss, TOKENS_CSS_HEADER } from '../../packages/tokens/scripts/tokensCss';

const TOKENS_CSS = join(__dirname, '..', 'src', 'styles', 'tokens.css');
const content = readFileSync(TOKENS_CSS, 'utf8');

describe('admin/src/styles/tokens.css', () => {
  it('jest DOKŁADNIE wynikiem generatora dla motywu night', () => {
    // Bajt w bajt: `npm run tokens:css --workspace admin` nie może produkować
    // różnicy w repozytorium.
    expect(content).toBe(renderTokensCss(THEMES.night));
  });

  it('zawiera blok `:root` z `themeCssBlock(THEMES.night)` — bez pośrednictwa generatora', () => {
    // Osobne sprawdzenie, żeby błąd w `renderTokensCss` nie mógł uzgodnić obu stron
    // ze sobą nawzajem: tu porównujemy z emiterem pakietu wprost.
    expect(content).toContain(themeCssBlock(THEMES.night));
  });

  it('ostrzega, że jest generowany — i jest to PIERWSZA rzecz w pliku', () => {
    expect(content.startsWith(TOKENS_CSS_HEADER)).toBe(true);
    expect(TOKENS_CSS_HEADER).toContain('PLIK GENEROWANY');
  });

  it('ma dokładnie JEDEN blok `:root` — panel nie ma przełącznika motywów', () => {
    // Drugi blok znaczyłby, że ktoś zaczął dokładać motyw „na zapas" (§1.6).
    expect(content.match(/:root\s*\{/g)).toHaveLength(1);
    expect(content).not.toContain('data-theme');
  });

  it('kontrola testu: plik naprawdę niesie paletę, a nie sam nagłówek', () => {
    // Bez tego wszystkie porównania wyżej przechodziłyby na pustym pliku,
    // gdyby generator kiedyś przestał emitować blok.
    expect(content).toContain('--green: #2ECC71');
    expect(content).toContain('--bg: #0D0D0D');
    expect(content.match(/^\s+--[a-z0-9-]+:/gm)?.length ?? 0).toBeGreaterThan(20);
  });

  it('NIE deklaruje wymiarów ramy panelu — to nie są tokeny produktu', () => {
    // `--sidebar-w` i `--topbar-h` mieszkają w `layout.css`: tokeny są wspólne
    // z telefonem, a telefon nie ma sidebara (§1.3).
    //
    // Patrzymy na DEKLARACJE, nie na wystąpienia napisu: nagłówek pliku wymienia
    // te nazwy z imienia właśnie po to, żeby nikt ich tu nie dopisał.
    const declared = [...content.matchAll(/^\s+(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);

    expect(declared).not.toContain('--sidebar-w');
    expect(declared).not.toContain('--topbar-h');
    expect(declared).not.toContain('--app-scale');
  });
});
