/**
 * UZ Aero — panel: przejście z karty dnia do dziennika audytu przy fladze.
 *
 * Jedna reguła i cały plik o niej: **link istnieje wtedy i tylko wtedy, gdy dziennik
 * ma co pokazać.** Wpis `flag.resolve` powstaje w chwili rozstrzygnięcia, więc dla
 * flagi otwartej dziennik jest pusty z definicji — a to właśnie otwarta flaga jest
 * najczęstszym powodem, dla którego ktoś w ogóle otwiera kartę dnia.
 */

import { describe, expect, it } from 'vitest';

import type { FlagListItemDto } from '../../api/dto';
import { flagAuditHref } from './dayFlagAudit';

const flag = (over: Partial<FlagListItemDto>): Pick<FlagListItemDto, 'id' | 'status'> => ({
  id: 1044,
  status: 'open',
  ...over,
});

describe('link do audytu przy fladze karty dnia', () => {
  it('flaga OTWARTA nie dostaje linku — dziennik jest wtedy pusty z definicji', () => {
    // Flagę zakłada ingest, a człowiek nie ma jak jej dotknąć, dopóki jej nie zamknie.
    // Link „Audyt" przy otwartej sprawie prowadzi więc do listy „nic w tym zawężeniu",
    // i to w najczęstszym przypadku tego ekranu.
    expect(flagAuditHref(flag({ status: 'open' }))).toBeNull();
  });

  it('flaga ROZSTRZYGNIĘTA prowadzi do śladu TEJ sprawy, nie do listy wszystkiego', () => {
    // `target_id` wpisu `flag.resolve` JEST numerem flagi — stąd zawężenie po obiekcie.
    expect(flagAuditHref(flag({ status: 'resolved' }))).toBe('/audyt?typ=flag&obiekt=1044');
  });
});
