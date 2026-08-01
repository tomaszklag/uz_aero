/**
 * UZ Aero — panel: kiedy przy fladze na karcie dnia jest przejście do DZIENNIKA
 * AUDYTU (moduł CZYSTY).
 *
 * Jedna decyzja, jeden plik — bo decyzja jest nieoczywista i łatwo ją stracić przy
 * przepisywaniu tabeli flag. Wpis `flag.resolve` powstaje **wyłącznie w chwili
 * rozstrzygnięcia**: flaga zakłada się sama, przy ingescie, i człowiek nie ma jak jej
 * dopisać ani zmienić, dopóki jej nie zamknie. Dla flagi OTWARTEJ dziennik jest więc
 * pusty z definicji — a kartę dnia otwiera się najczęściej właśnie z powodu otwartej
 * flagi, czyli link prowadziłby w pustkę w najczęstszym przypadku, jaki ten ekran ma.
 *
 * Serwerowi ta reguła nie jest do niczego potrzebna: `status` jest już na karcie dnia
 * (`FlagListItemDto`), więc odpowiedź kosztuje tyle, co jej zadanie.
 */

import type { FlagListItemDto } from '../../api/dto';
import { targetHref } from '../audyt/audytFilters';

/**
 * Adres śladu tej flagi w dzienniku; `null` = śladu NIE MA i nie będzie, dopóki sprawa
 * nie zostanie rozstrzygnięta. Ekran pokazuje wtedy sam przycisk „Rozwiąż".
 *
 * `target_id` wpisu `flag.resolve` JEST numerem flagi, więc link prowadzi dokładnie do
 * decyzji podjętych na tej sprawie, a nie do surowej listy wszystkiego.
 */
export function flagAuditHref(flag: Pick<FlagListItemDto, 'id' | 'status'>): string | null {
  return flag.status === 'resolved' ? targetHref('flag', String(flag.id)) : null;
}
