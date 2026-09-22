/**
 * Ninerdeck - CYTOWANIE ARGUMENTÓW dla `spawnSync` z `shell: true`.
 *
 * Czysta logika bez importów Node (testy: `src/__tests__/shellArgs.test.ts`).
 *
 * ══ PO CO ══
 * `spawnSync(file, args, { shell: true })` NIE CYTUJE argumentów - skleja je spacjami
 * w jedną linię poleceń i oddaje powłoce. Argument ze spacją rozpada się wtedy na kilka:
 * `-m "opis ze spacjami"` dociera do programu jako `-m`, `opis`, `ze`, `spacjami`.
 *
 * Kosztowało to nieudaną aktualizację OTA (2026-09-22, staging): `eas-cli` odbił wywołanie
 * z `Unexpected arguments`. Awaria była głośna, ale ta sama ścieżka obsługuje
 * `npm run update:prod -- -m "krótki opis zmiany"` ze skilla `wydanie` - czyli wydania dla
 * pilotów - a tam obcięty opis mógłby przejść po cichu i zostać w historii wydań na zawsze.
 *
 * ══ DLACZEGO NIE „PO PROSTU BEZ POWŁOKI" ══
 * Na Windowsie `npx` jest skryptem `.cmd`, a Node od 18.20/20.12 ODMAWIA uruchomienia
 * `.cmd` i `.bat` bez powłoki (poprawka CVE-2024-27980). Powłoka jest więc wymuszona,
 * a skoro jest, to cytowanie należy do nas.
 *
 * ══ ZAKRES ══
 * Wąski i ma taki zostać: opakowujemy w cudzysłowy argument, który ma spację, jest pusty
 * albo niesie znak specjalny powłoki, a cudzysłów w środku poprzedzamy odwrotnym ukośnikiem
 * (tak czyta go parser argumentów programu docelowego). Pusty argument MUSI dostać
 * cudzysłowy - bez nich znika z linii poleceń zamiast dojść jako pusty napis.
 */

'use strict';

/**
 * Znaki, przy których argument bez cudzysłowów zmienia znaczenie: spacja i tabulator
 * dzielą argumenty, reszta to metaznaki powłoki (potok, przekierowanie, łączenie poleceń).
 */
const NEEDS_QUOTES = /[\s"'^&|<>()]/;

/**
 * Argument gotowy do wklejenia w linię poleceń powłoki.
 *
 * @param {string} arg
 * @returns {string}
 */
function quoteForShell(arg) {
  if (arg.length > 0 && !NEEDS_QUOTES.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * Cała tablica argumentów - albo bez zmian, gdy powłoki nie ma (POSIX: `spawnSync`
 * przekazuje argumenty wprost do procesu i cytowanie tylko by je zepsuło).
 *
 * @param {string[]} args
 * @param {boolean} useShell
 * @returns {string[]}
 */
function shellArgs(args, useShell) {
  return useShell ? args.map(quoteForShell) : args;
}

module.exports = { quoteForShell, shellArgs };
