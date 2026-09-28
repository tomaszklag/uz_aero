/**
 * Ninerdeck - tokeny kontra mockupy: zmienne CSS emitowane z `@ninerdeck/tokens` muszą
 * zgadzać się z blokiem `:root` KAŻDEJ makiety `design/*.html`.
 *
 * Po co ten test. Tokeny są kodem, ale ŹRÓDŁEM PRAWDY jest mockup (`CLAUDE.md`:
 * „mockupy w `design/` to zatwierdzona specyfikacja"). Dopóki konsumentem była jedna
 * aplikacja, rozjazd wychodził na oczy przy pierwszym spojrzeniu na ekran. Panel
 * webowy czyta te same wartości OKRĘŻNĄ drogą - przez `themeCssVars` - więc literówka
 * w palecie dałaby panel w innym odcieniu niż zatwierdzony projekt i nikt by tego nie
 * złapał, bo obie strony byłyby „zgodne ze sobą".
 *
 * Dlaczego KAŻDA makieta. Każdy plik niesie paletę we własnym `<head>` (makietę otwiera
 * się z dysku, bez wspólnego arkusza), a nowy ekran powstaje z kopii sąsiada. Do
 * 2026-09-28 test czytał jeden plik - najpierw szablon archiwum panelu 1.0, potem sam
 * Pulpit - i przez ten czas `--text-placeholder` rozjechał się w 38 makietach na dwie
 * wartości, których nikt nie zatwierdził (`#5A5A5A` od 2026-08-16, `#5C5C5C` od
 * 2026-09-08), podczas gdy telefon i panel rysowały `#565656`. Każdy skopiowany
 * `<head>` jest więc osobną kopią palety i każdy musi się zgadzać.
 *
 * Makiety panelu 2.0 (`design/panel/`) własnego `:root` nie mają - ich arkusz
 * `panel.css` jest GENEROWANY z tokenów, więc porównanie z nim byłoby kołem. Stąd skan
 * obejmuje wyłącznie pliki w samym `design/`.
 *
 * Test mieszka w `app/`, bo to jedyny workspace z runnerem; `packages/tokens` swojego
 * nie ma (tak jak `packages/domain`, którego reguły testuje `rules.test.ts`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEMES, themeCssVars } from '@ninerdeck/tokens';

const DESIGN = join(__dirname, '..', '..', '..', 'design');

/** Pary `--nazwa: wartość;` z pierwszego bloku `:root { … }`; `null`, gdy bloku nie ma. */
function rootVarsOf(html: string): Map<string, string> | null {
  const block = /:root\s*\{([\s\S]*?)\}/.exec(html);
  if (block == null) return null;

  const vars = new Map<string, string>();
  for (const [, name, value] of block[1]!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    vars.set(name!, value!.trim());
  }
  return vars;
}

const mockups = readdirSync(DESIGN)
  .filter((file) => file.endsWith('.html'))
  .sort()
  .map((file) => ({ file, vars: rootVarsOf(readFileSync(join(DESIGN, file), 'utf8')) }))
  .filter((m): m is { file: string; vars: Map<string, string> } => m.vars != null);

describe('zmienne CSS makiet pochodzą z tych samych tokenów co aplikacja', () => {
  const emitted = themeCssVars(THEMES.night);

  it('skaner znalazł makiety i realną część wspólną (kontrola testu)', () => {
    // Bez tego zielony wynik niżej mógłby znaczyć „nie przeczytano żadnego pliku" albo
    // „zero wspólnych nazw" - test przechodziłby przy dowolnie rozjechanej palecie.
    expect(mockups.length).toBeGreaterThan(50);

    // Kotwica: ekran startowy niesie komplet palety ciemnego motywu. Gdyby konwencja
    // nazw kiedyś się zmieniła, chcemy wiedzieć od razu.
    const pulpit = mockups.find((m) => m.file === '20-pulpit.html');
    expect(pulpit).toBeDefined();
    const shared = Object.keys(emitted).filter((name) => pulpit!.vars.has(name));
    expect(shared.length).toBeGreaterThan(20);
    expect(shared).toEqual(expect.arrayContaining(['--bg', '--surface-raised', '--text-muted', '--green-border']));
  });

  it('każda wspólna zmienna ma w KAŻDEJ makiecie DOKŁADNIE tę samą wartość', () => {
    const drift: Array<{ file: string; name: string; mockup: string; tokens: string }> = [];
    for (const { file, vars } of mockups) {
      for (const [name, value] of Object.entries(emitted)) {
        const inMockup = vars.get(name);
        if (inMockup != null && inMockup !== value) {
          drift.push({ file, name, mockup: inMockup, tokens: value });
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it('wymiary ramy makiet NIE wyciekają do tokenów produktu', () => {
    // `--phone-scale` (ramka telefonu) oraz `--sidebar-w`, `--topbar-h` i `--app-scale`
    // (rama okna panelu) opisują układ JEDNEGO ekranu makiety, a nie token designu.
    // Makiety je mają; emiter nie ma prawa ich znać.
    for (const layoutOnly of ['--phone-scale', '--sidebar-w', '--topbar-h', '--app-scale']) {
      expect(emitted).not.toHaveProperty(layoutOnly);
    }
  });
});
