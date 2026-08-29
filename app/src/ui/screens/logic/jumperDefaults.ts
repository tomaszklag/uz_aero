/**
 * UZ Aero - domyślny skład skoczków na kroku „zadanie" (02e, 2026-08-17).
 *
 * Dwie małe decyzje wydzielone z JSX, bo obie mają regułę, nie tylko formatowanie:
 *  • suma zero NIE JEST deklaracją - ta sama zasada co przy `declaredJumpers` w komendach
 *    (`sessionCommands.ts`), tu powtórzona lokalnie, bo szkic preflightu nie przechodzi
 *    przez warstwę komend: `confirmPreflight` wysyła `draft.jumperDefaults` wprost;
 *  • etykieta pola ma być pusta wizualnie („Bez ustawionego składu"), gdy defaultu
 *    nie ustawiono, i wypisywać TYLKO niezerowe pozycje, gdy ustawiono.
 */

import type { JumperCounts } from '../../../domain';

/** Suma zero to „nie ustawiono", nie „zero skoczków" - jak przy załadunku i zrzucie. */
export function normalizeJumperDefaults(jumpers: JumperCounts): JumperCounts | null {
  return jumpers.tandem + jumpers.aff + jumpers.solo > 0 ? jumpers : null;
}

/** Etykieta pola „Domyślny skład skoczków" - puste pozycje pomijamy. */
export function jumperDefaultsLabel(jumpers: JumperCounts | null): string {
  if (jumpers == null) return 'Bez ustawionego składu';
  const parts = [
    jumpers.tandem > 0 ? `${jumpers.tandem} tandem` : null,
    jumpers.aff > 0 ? `${jumpers.aff} AFF` : null,
    jumpers.solo > 0 ? `${jumpers.solo} solo` : null,
  ].filter((p): p is string => p != null);
  return parts.length > 0 ? parts.join(' · ') : 'Bez ustawionego składu';
}
