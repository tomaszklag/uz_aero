/**
 * UZ Aero — generator UUID v4 (klucz idempotencji zdarzeń, docs/_main.md.txt §4.1).
 *
 * Wymóg testowalności (CLAUDE.md, brief Fazy 1): warstwa danych musi działać w Node/Jest
 * bez modułów natywnych. Dlatego NIE zależymy od `expo-crypto`. Zamiast tego bierzemy
 * najlepsze dostępne źródło losowości:
 *   1. `crypto.randomUUID()`      — Node 19+ oraz RN z polyfillem (preferowane),
 *   2. `crypto.getRandomValues()` — składamy v4 ręcznie,
 *   3. `Math.random()`            — fallback ostateczny (NIE kryptograficzny).
 *
 * W realnym RN bezpieczniej wstrzyknąć `expo-crypto`.randomUUID przez `EventsRepo`
 * (opcja `generateId`) — repozytorium to umożliwia. Tu chodzi o poprawny, unikalny
 * klucz dedup, nie o sekret.
 */

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

function getCrypto(): CryptoLike | undefined {
  return (globalThis as { crypto?: CryptoLike }).crypto;
}

/** Zwraca UUID v4 (RFC 4122) jako string „xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx". */
export function uuidv4(): string {
  const c = getCrypto();

  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Ustaw wersję (4) i wariant (RFC 4122) zgodnie ze specyfikacją.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 256; i++) {
    hex.push((i + 0x100).toString(16).slice(1));
  }

  return (
    hex[bytes[0]!]! +
    hex[bytes[1]!]! +
    hex[bytes[2]!]! +
    hex[bytes[3]!]! +
    '-' +
    hex[bytes[4]!]! +
    hex[bytes[5]!]! +
    '-' +
    hex[bytes[6]!]! +
    hex[bytes[7]!]! +
    '-' +
    hex[bytes[8]!]! +
    hex[bytes[9]!]! +
    '-' +
    hex[bytes[10]!]! +
    hex[bytes[11]!]! +
    hex[bytes[12]!]! +
    hex[bytes[13]!]! +
    hex[bytes[14]!]! +
    hex[bytes[15]!]!
  );
}
