/**
 * Ninerdeck - panel: słownik klubu (`/admin/api/directory`, issue #216).
 *
 * Nazwiska i znaki do podpisania zajętości - odpowiednik danych referencyjnych
 * telefonu w najwęższej postaci. Czyta go kalendarz i kolejka decyzji, bo obie stoją
 * przed KAŻDYM członkiem klubu, a listy modułów Piloci i Samoloty otwiera dopiero
 * „Podgląd klubu".
 */

import type { DirectoryDto } from './dto';
import { apiGet } from './httpClient';

export function getDirectory(): Promise<DirectoryDto> {
  return apiGet<DirectoryDto>('/directory');
}
