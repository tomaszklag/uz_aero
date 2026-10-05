/**
 * Ninerdeck - panel: napis dzwonka dla czytnika ekranu (4.0.0, K7 `docs/kanal-klubu.md`).
 *
 * Liczba przy dzwonku jest widoczna wyłącznie przy nowych wiadomościach; czytnik ekranu
 * dostaje ją w etykiecie przycisku, z odmianą - „1 nowa", „3 nowe", „5 nowych".
 */

import { plural } from '@ninerdeck/format';

export function bellLabel(count: number | null): string {
  if (count == null || count <= 0) return 'Powiadomienia';
  return `Powiadomienia - ${count} ${plural(count, 'nowa', 'nowe', 'nowych')}`;
}
