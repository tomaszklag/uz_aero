/**
 * UZ Aero — formatowanie mieszka w `packages/format` (workspace `@uzaero/format`).
 *
 * Wyniesione 2026-07-31. Powód nie jest teoretyczny: `server/src/application/export/
 * daySheetContent.ts` trzymał ręczne KOPIE tych funkcji z docblockami „lustro … z
 * app/src/ui/format.ts", bo karta arkusza musi pokazywać te same napisy co telefon.
 * Kopia utrzymywana dyscypliną to kopia, która się rozjedzie — a trzecim konsumentem
 * został właśnie panel administracyjny.
 *
 * Ten plik to shim zgodności: `app/src` importuje formaty ścieżką `ui/format` i tak
 * ma zostać.
 */

export * from '@uzaero/format';
