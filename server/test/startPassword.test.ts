/**
 * UZ Aero (serwer) — generator hasła startowego (`infrastructure/auth/startPassword.ts`).
 *
 * Hasło startowe jest jedynym poświadczeniem, które w tym systemie powstaje MASZYNOWO
 * i wędruje między dwoma ludźmi. Testujemy trzy rzeczy i wszystkie są własnościami,
 * nie wyglądem: kształt (bo hasło jest PRZEPISYWANE), alfabet (bo znaki mylące psują
 * przepisywanie) i to, że dwa kolejne wywołania nie dają tej samej wartości (bo
 * generator „losowy" z zepsutym źródłem entropii wygląda dokładnie tak samo jak dobry).
 */

import { describe, expect, it } from 'vitest';

import {
  generateStartPassword,
  START_PASSWORD_ALPHABET,
  START_PASSWORD_SYMBOLS,
} from '../src/infrastructure/auth/startPassword.ts';

describe('hasło startowe', () => {
  it('ma kształt trzech grup po cztery znaki — hasło się DYKTUJE, nie kopiuje', () => {
    expect(generateStartPassword()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });

  it('nie zawiera znaków mylących: i, l, o, 0, 1', () => {
    // Alfabet bez tych par jest całym powodem, dla którego generator jest osobnym
    // plikiem, a nie jedną linijką z `randomBytes().toString('base64url')`.
    for (const banned of ['i', 'l', 'o', '0', '1']) {
      expect(START_PASSWORD_ALPHABET).not.toContain(banned);
    }

    const drawn = Array.from({ length: 200 }, () => generateStartPassword()).join('');
    expect(drawn).not.toMatch(/[ilo01]/);
  });

  it('dwieście losowań daje dwieście różnych haseł', () => {
    // Kontrola źródła entropii. Przy 31^12 kombinacjach kolizja na dwustu próbach jest
    // praktycznie niemożliwa, więc powtórzenie znaczy zepsuty generator, a nie pecha.
    const drawn = new Set(Array.from({ length: 200 }, () => generateStartPassword()));
    expect(drawn.size).toBe(200);
  });

  it('losowych pozycji jest tyle, ile deklaruje moduł (kontrola samego testu)', () => {
    const password = generateStartPassword();
    expect(password.replace(/-/g, '')).toHaveLength(START_PASSWORD_SYMBOLS);
  });
});
