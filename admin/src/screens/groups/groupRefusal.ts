/**
 * Ninerdeck - panel: odmowa zapisu GRUPY → zdanie po polsku (4.0.0, epik Z-D #248).
 *
 * `Record<GroupRefusalDto, …>` wywala kompilację, gdy serwer dopisze nowy powód - a lustro
 * unii pilnuje `test/mirrors.test.ts`. Nazwa zajęta stoi POD POLEM nazwy, czerwoną ramką
 * i zdaniem (makieta P5a); osoba spoza aktywnych członków - w karcie obsady.
 */

import type { GroupRefusalDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';

const REFUSALS: Record<GroupRefusalDto, string> = {
  name_taken: 'Grupa o tej nazwie już jest w klubie.',
  member_not_in_org: 'Ktoś z wybranych nie jest już aktywnym członkiem klubu. Otwórz grupę jeszcze raz.',
};

/** Powód odmowy z odpowiedzi serwera; `null` = to nie odmowa zapisu grupy. */
export function groupRefusalOf(error: unknown): GroupRefusalDto | null {
  if (!isHttpError(error)) return null;
  const code = error.body.error;
  return code === 'name_taken' || code === 'member_not_in_org' ? code : null;
}

export const groupRefusalMessage = (refusal: GroupRefusalDto): string => REFUSALS[refusal];
