/**
 * Ninerdeck - RÓWNOŚĆ LUSTRA POLITYKI HASŁA (2.1.0, H-F F3).
 *
 * Strona `/haslo/` nie może zaimportować `@ninerdeck/domain`: `site/` jest świadomie poza
 * workspace'ami npm i bez bundlera (`site/README.md`), więc trzyma LUSTRO reguły
 * (`site/src/haslo/policy.js`). Ten plik jest ceną tej decyzji - i jedyną rzeczą, która
 * sprawia, że da się ją obronić.
 *
 * Rozjazd lustra z domeną znaczy stronę mówiącą „hasło dobre" przy serwerze
 * odpowiadającym `weak_password` - czyli człowieka, który nie wie, co poprawić,
 * w chwili ustawiania hasła. Dlatego test puszcza OBIE implementacje przez tę samą
 * tablicę i porównuje WYNIKI, a nie deklaracje.
 *
 * Test stoi po stronie aplikacji, bo tu żyją testy `@ninerdeck/domain`
 * (patrz `passwordPolicy.test.ts`) - to jedyne miejsce, które widzi obie strony naraz.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PASSWORD_BLOCKLIST,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPassword,
} from '@ninerdeck/domain';
import type { PasswordWeakness } from '@ninerdeck/domain';

/** Kształt, który `policy.js` wystawia na `window`. */
interface MirrorPolicy {
  MIN_LENGTH: number;
  MAX_LENGTH: number;
  BLOCKLIST: string[];
  normalize(text: string): string;
  checkPassword(password: string): PasswordWeakness | null;
}

/**
 * Lustro ładujemy TAK, JAK ROBI TO PRZEGLĄDARKA - czytamy plik i wykonujemy go na
 * podstawionym `window`. Import modułowy nie wchodzi w grę: `policy.js` jest skryptem
 * klasycznym (strona nie ma bundlera), a przepisanie go na moduł tylko dla testu
 * znaczyłoby, że test sprawdza inny plik niż ten, który dostaje człowiek.
 */
function loadMirror(): MirrorPolicy {
  const file = join(__dirname, '..', '..', '..', 'site', 'src', 'haslo', 'policy.js');
  const source = readFileSync(file, 'utf8');
  const globalScope: { NinerdeckPasswordPolicy?: MirrorPolicy } = {};
  new Function('window', source)(globalScope);
  if (globalScope.NinerdeckPasswordPolicy == null) {
    throw new Error('policy.js nie wystawiło `window.NinerdeckPasswordPolicy`');
  }
  return globalScope.NinerdeckPasswordPolicy;
}

const mirror = loadMirror();

describe('lustro polityki hasła na stronie /haslo/', () => {
  it('ma te same granice długości, co domena', () => {
    expect(mirror.MIN_LENGTH).toBe(PASSWORD_MIN_LENGTH);
    expect(mirror.MAX_LENGTH).toBe(PASSWORD_MAX_LENGTH);
  });

  it('ma DOKŁADNIE tę samą listę zablokowanych - co do wpisu i kolejności', () => {
    // Kolejność nie wpływa na wynik (porównanie jest po zbiorze), ale różnica w niej
    // znaczy, że ktoś dopisał wpis po jednej stronie - a to jest właśnie ten rozjazd.
    expect(mirror.BLOCKLIST).toEqual([...PASSWORD_BLOCKLIST]);
  });

  it('odpowiada tak samo na KAŻDY wpis z listy zablokowanych', () => {
    for (const entry of PASSWORD_BLOCKLIST) {
      expect(mirror.checkPassword(entry)).toBe(checkPassword(entry));
    }
  });

  it('normalizuje tak samo: wielkość liter, ogonki, odstępy', () => {
    // To jest rdzeń porównania z listą - rozjazd tutaj przepuszczałby „HASŁO 1234567".
    const variants = ['HASLO1234567', 'Hasło1234567', 'has ło 1234567', 'HAŚLO1234567'];
    for (const variant of variants) {
      expect(mirror.checkPassword(variant)).toBe(checkPassword(variant));
    }
  });

  it('liczy długość w PUNKTACH KODOWYCH, nie w jednostkach UTF-16', () => {
    // Jedenaście samolotów to jedenaście znaków dla człowieka - i dla obu stron.
    const eleven = '🛩️'.repeat(11);
    const twelve = '🛩️'.repeat(12);
    expect(mirror.checkPassword(eleven)).toBe(checkPassword(eleven));
    expect(mirror.checkPassword(twelve)).toBe(checkPassword(twelve));
  });

  it.each([
    ['', 'puste'],
    ['krotkie', 'za krótkie'],
    ['dokladnie12!', 'dokładnie na progu'],
    ['zielonesmigloleci', 'fraza bez cyfr'],
    ['correct horse battery staple', 'fraza z odstępami'],
    ['a'.repeat(PASSWORD_MAX_LENGTH), 'dokładnie sufit'],
    ['a'.repeat(PASSWORD_MAX_LENGTH + 1), 'ponad sufit'],
  ])('odpowiada tak samo na „%s" (%s)', (password) => {
    expect(mirror.checkPassword(password)).toBe(checkPassword(password));
  });

  it('LUSTRO JEST WĘŻSZE o powody, których strona nie zna - i to jest zamierzone', () => {
    // Token z linku niczego o człowieku nie zdradza, więc strona nie ma jak sprawdzić
    // adresu ani nazwiska. Te dwa powody rozstrzyga SERWER i wracają jako
    // `400 weak_password { reason }` - strona pokazuje je pod polem (`haslo.js`).
    const withEmail = 'kowalski-lotnisko';
    const context = { email: 'adam.kowalski@ninerdeck.pl', name: 'Adam Kowalski' };

    expect(checkPassword(withEmail, context)).toBe('contains_email');
    expect(mirror.checkPassword(withEmail)).toBeNull();
    // Bez tożsamości domena zgadza się z lustrem - różnicę robi WYŁĄCZNIE kontekst.
    expect(checkPassword(withEmail)).toBeNull();
  });
});
