/**
 * UZ Aero - tokeny kontra mockupy: zmienne CSS emitowane z `@uzaero/tokens` muszą
 * zgadzać się z blokiem `:root` w `design/admin/SZABLON.html`.
 *
 * Po co ten test. Tokeny są kodem, ale ŹRÓDŁEM PRAWDY jest mockup (`CLAUDE.md`:
 * „mockupy w `design/` to zatwierdzona specyfikacja"). Dopóki konsumentem była jedna
 * aplikacja, rozjazd wychodził na oczy przy pierwszym spojrzeniu na ekran. Panel
 * webowy czyta te same wartości OKRĘŻNĄ drogą - przez `themeCssVars` - więc literówka
 * w palecie dałaby panel w innym odcieniu niż zatwierdzony projekt i nikt by tego nie
 * złapał, bo obie strony byłyby „zgodne ze sobą".
 *
 * Test mieszka w `app/`, bo to jedyny workspace z runnerem; `packages/tokens` swojego
 * nie ma (tak jak `packages/domain`, którego reguły testuje `rules.test.ts`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEMES, themeCssVars } from '@uzaero/tokens';

const SZABLON = join(__dirname, '..', '..', '..', 'design', 'admin', 'SZABLON.html');

/** Wyciąga pary `--nazwa: wartość;` z pierwszego bloku `:root { … }` w arkuszu. */
function rootVarsOf(html: string): Map<string, string> {
  const block = /:root\s*\{([\s\S]*?)\}/.exec(html);
  if (block == null) throw new Error('Brak bloku :root w SZABLON.html');

  const vars = new Map<string, string>();
  for (const [, name, value] of block[1]!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    vars.set(name!, value!.trim());
  }
  return vars;
}

describe('zmienne CSS panelu pochodzą z tych samych tokenów co aplikacja', () => {
  const mockup = rootVarsOf(readFileSync(SZABLON, 'utf8'));
  const emitted = themeCssVars(THEMES.night);

  it('mockup i emiter mają realną część wspólną (kontrola testu)', () => {
    // Bez tego zielony wynik niżej mógłby znaczyć „zero wspólnych nazw", czyli
    // porównanie pustego zbioru - test przechodziłby przy dowolnie rozjechanej palecie.
    const shared = Object.keys(emitted).filter((name) => mockup.has(name));
    expect(shared.length).toBeGreaterThan(20);
    // Kotwice: gdyby konwencja nazw kiedyś się zmieniła, chcemy wiedzieć od razu.
    expect(shared).toEqual(expect.arrayContaining(['--bg', '--surface-raised', '--text-muted', '--green-border']));
  });

  it('każda wspólna zmienna ma w mockupie DOKŁADNIE tę samą wartość', () => {
    const drift: Array<{ name: string; mockup: string; tokens: string }> = [];
    for (const [name, value] of Object.entries(emitted)) {
      const inMockup = mockup.get(name);
      if (inMockup != null && inMockup !== value) {
        drift.push({ name, mockup: inMockup, tokens: value });
      }
    }
    expect(drift).toEqual([]);
  });

  it('wymiary ramy panelu NIE wyciekają do tokenów produktu', () => {
    // `--sidebar-w`, `--topbar-h` i `--app-scale` opisują układ JEDNEGO ekranu w jednej
    // aplikacji, a nie token designu. Mockup je ma; emiter nie ma prawa ich znać.
    for (const layoutOnly of ['--sidebar-w', '--topbar-h', '--app-scale']) {
      expect(emitted).not.toHaveProperty(layoutOnly);
    }
  });
});
