/**
 * UZ Aero - testy krypto PIN-u (`infrastructure/auth/sha256.ts`, `pinCrypto.ts`).
 *
 * Własna implementacja SHA-256 (powody w jej docblocku) MUSI być przybita wektorami
 * NIST FIPS 180-4 - ręcznie napisany hash, który „wygląda dobrze", to najgorszy rodzaj
 * błędu: zły skrót weryfikuje się sam ze sobą i test roundtrip niczego by nie wykrył.
 */

import { sha256Hex } from '../infrastructure/auth/sha256';
import { PinCrypto } from '../infrastructure/auth/pinCrypto';

describe('sha256Hex - wektory NIST', () => {
  it('pusty łańcuch', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('"abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('dwa bloki (wejście > 55 bajtów wymusza drugi blok paddingu)', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('UTF-8 poza ASCII (polskie znaki kodują się wielobajtowo)', () => {
    // Wektor policzony niezależnie: node:crypto sha256('zażółć', 'utf8').
    expect(sha256Hex('zażółć')).toBe(
      '7eefe5e3046c86cec19ce1215e0a04724124d948468005a1ebc4adf2643bea13',
    );
  });
});

describe('PinCrypto', () => {
  it('roundtrip: dobry PIN przechodzi, zły nie', async () => {
    const crypto = new PinCrypto();
    const record = await crypto.create('1234');

    expect(await crypto.verify('1234', record)).toBe(true);
    expect(await crypto.verify('4321', record)).toBe(false);
  });

  it('sól różnicuje rekordy - ten sam PIN, dwa różne skróty', async () => {
    const crypto = new PinCrypto();
    const a = await crypto.create('1234');
    const b = await crypto.create('1234');

    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('rekord nie zawiera PIN-u wprost', async () => {
    const record = await new PinCrypto().create('1234');
    expect(JSON.stringify(record)).not.toContain('1234');
  });
});
