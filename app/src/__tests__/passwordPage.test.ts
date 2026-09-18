/**
 * Ninerdeck - NIEZMIENNIKI STRONY `/haslo/` (2.1.0, H-W W6, przegląd §8 pkt 4, 7 i 8).
 *
 * Strona z linku jest jedynym miejscem w produkcie, w którym człowiek wpisuje hasło
 * POZA aplikacją i panelem - i jedynym plikiem strony stojącym na origin panelu
 * (`hostSplit.ts`, `PASSWORD_PAGE`). Trzyma ją kilka własności, których NIC nie pilnowało,
 * a każda da się złamać jedną odruchową poprawką:
 *
 *  • **zero skryptu i stylu w treści pliku** - jej ścisła polityka bezpieczeństwa
 *    (`staticSite.ts`, `PASSWORD_PAGE_CSP`) nie ma `'unsafe-inline'`, więc dopisany
 *    `<script>` po prostu się nie wykona. Awaria byłaby przy tym CICHA: strona wygląda
 *    tak samo, tylko formularz przestaje działać;
 *  • **pola hasła BEZ `name`** - przy natywnej wysyłce formularza trafiłyby do ADRESU
 *    (a więc do historii przeglądarki i logu każdego pośrednika po drodze);
 *  • **`method="post"`** - pas bezpieczeństwa dla tej samej sytuacji, gdyby `name`
 *    kiedyś doszło.
 *
 * Test stoi po stronie aplikacji z tego samego powodu, co `passwordPolicyMirror.test.ts`:
 * `site/` nie ma własnego zestawu testów, a tu żyje zestaw, który widzi cały monorepo.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HASLO = join(__dirname, '..', '..', '..', 'site', 'src', 'haslo');

const read = (file: string): string => readFileSync(join(HASLO, file), 'utf8');

const page = read('index.html');

/** Treść pliku bez komentarzy HTML - inaczej docblock strony sam wpada w asercje. */
const markup = page.replace(/<!--[\s\S]*?-->/g, '');

describe('strona /haslo/ - niezmienniki bezpieczeństwa', () => {
  it('nie ma ANI JEDNEGO skryptu w treści pliku - jej polityka na to nie pozwala', () => {
    // `<script src="…">` wolno; `<script>` z ciałem - nie.
    const inline = [...markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(
      ([, attrs, body]) => !/\bsrc=/.test(attrs ?? '') || (body ?? '').trim() !== '',
    );
    expect(inline).toEqual([]);
  });

  it('nie ma bloku stylu ani stylu w atrybucie', () => {
    expect(markup).not.toMatch(/<style\b/);
    expect(markup).not.toMatch(/\sstyle=/);
  });

  it('ładuje politykę PRZED skryptem strony - ten czyta z niej stałe przy pierwszym renderze', () => {
    expect(markup).toContain('src="policy.js"');
    expect(markup).toContain('src="haslo.js"');
    expect(markup.indexOf('policy.js')).toBeLessThan(markup.indexOf('haslo.js'));
  });

  it('pola hasła NIE MAJĄ `name` - natywna wysyłka nie przeniosłaby ich do adresu', () => {
    const inputs = [...markup.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag);
    const passwords = inputs.filter((tag) => /type="password"/.test(tag));
    expect(passwords).toHaveLength(2);
    for (const tag of passwords) expect(tag).not.toMatch(/\sname=/);
  });

  it('formularz jest `post` - pas bezpieczeństwa, gdyby `name` kiedyś doszło', () => {
    expect(markup).toMatch(/<form\b[^>]*\bmethod="post"/);
  });

  it('oba pola to `new-password` - menedżer haseł ma podpowiedzieć NOWE, nie zapisane', () => {
    const passwords = [...markup.matchAll(/<input\b[^>]*type="password"[^>]*>/g)].map(([t]) => t);
    for (const tag of passwords) expect(tag).toMatch(/autocomplete="new-password"/);
  });

  it('strona nie prosi o nic poza hasłem - żadnego pola na adres, kod ani token', () => {
    // Token jedzie we FRAGMENCIE adresu i ma się tam skończyć: pole do przepisania
    // czegokolwiek zamieniłoby link w kod do dyktowania, czego świadomie nie ma (D5).
    const inputs = [...markup.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag);
    expect(inputs).toHaveLength(2);
  });

  it('skrypt strony pyta API adresem WZGLĘDNYM - to on wymusza host aplikacji', () => {
    // Adres bezwzględny działałby z hosta strony, ale kosztem CORS na trasie
    // uwierzytelniania. Względny jest decyzją, nie skrótem - i dlatego stoi w teście.
    const script = read('haslo.js');
    expect(script).toContain("fetch('../auth/password/reset'");
    expect(script).not.toMatch(/fetch\(\s*['"]https?:/);
  });
});
