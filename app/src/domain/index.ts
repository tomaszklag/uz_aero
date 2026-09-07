/**
 * UZ Aero - domena mieszka w `packages/domain` (workspace `@uzaero/domain`).
 *
 * Wyniesiona z aplikacji w Fazie 2, bo serwer liczy sesje TĄ SAMĄ projekcją i sprawdza
 * TE SAME inwarianty - dwie implementacje rozjechałyby się przy pierwszej zmianie.
 *
 * Ten plik to shim zgodności: całe `app/src` importuje domenę ścieżką `../../domain`
 * i tak ma zostać - warstwa UI nie musi wiedzieć, że domena jest osobnym pakietem.
 * Granic pilnuje `architecture.test.ts` (skanuje teraz `packages/domain/src`).
 */

export * from '@uzaero/domain';
