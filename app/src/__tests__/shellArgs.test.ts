/**
 * Ninerdeck - cytowanie argumentów dla powłoki (`scripts/shell-args.js`).
 *
 * Kontekst: `spawnSync` z `shell: true` skleja argumenty spacjami BEZ cudzysłowów, więc
 * `-m "opis ze spacjami"` docierał do `eas-cli` jako cztery argumenty i wywołanie odbijało
 * się o `Unexpected arguments` (2026-09-22, aktualizacja OTA na staging). Ta sama ścieżka
 * obsługuje `update:prod -- -m "opis"` przy wydaniach dla pilotów.
 */

import { quoteForShell, shellArgs } from '../../scripts/shell-args';

describe('quoteForShell - argument gotowy dla powłoki', () => {
  it('nie rusza argumentu bez spacji i znaków specjalnych', () => {
    expect(quoteForShell('--branch')).toBe('--branch');
    expect(quoteForShell('development')).toBe('development');
    expect(quoteForShell('app-staging.ninerdeck.pl')).toBe('app-staging.ninerdeck.pl');
  });

  it('cytuje opis ze spacjami - to jest przypadek, który wywrócił wysyłkę', () => {
    expect(quoteForShell('staging: adres app-staging')).toBe('"staging: adres app-staging"');
  });

  it('escapuje cudzysłów w środku, zamiast urywać argument', () => {
    expect(quoteForShell('opis z "cytatem" w środku')).toBe('"opis z \\"cytatem\\" w środku"');
  });

  it('cytuje PUSTY argument - bez cudzysłowów zniknąłby z linii poleceń', () => {
    expect(quoteForShell('')).toBe('""');
  });

  it('cytuje metaznaki powłoki, żeby nie zmieniły znaczenia polecenia', () => {
    for (const arg of ['a|b', 'a&b', 'a>b', 'a<b', 'a(b)', "a'b"]) {
      expect(quoteForShell(arg)).toBe(`"${arg}"`);
    }
  });
});

describe('shellArgs - cała tablica', () => {
  const argv = ['eas-cli', 'update', '--branch', 'development', '-m', 'opis ze spacjami'];

  it('cytuje wyłącznie to, co tego wymaga, gdy powłoka jest w grze', () => {
    expect(shellArgs(argv, true)).toEqual([
      'eas-cli',
      'update',
      '--branch',
      'development',
      '-m',
      '"opis ze spacjami"',
    ]);
  });

  it('BEZ powłoki oddaje argumenty bez zmian', () => {
    // Na POSIX `spawnSync` przekazuje je wprost do procesu - cudzysłowy dojechałyby
    // wtedy jako część wartości i opis wydania miałby je w treści.
    expect(shellArgs(argv, false)).toEqual(argv);
  });
});
