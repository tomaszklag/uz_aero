import { describe, expect, it } from 'vitest';

import type { OrganizationRefDto, PanelSessionDto, PanelScopesDto } from '../../api/dto';
import { scopeCount, shellScope, SCOPE_PICK } from './scope';

const ALFA: OrganizationRefDto = { id: 'org-a', slug: 'aeroklub-alfa', name: 'Aeroklub Alfa' };
const BETA: OrganizationRefDto = { id: 'org-b', slug: 'aeroklub-beta', name: 'Aeroklub Beta' };

const club = (org: OrganizationRefDto) => ({ org, code: 'TMK', role: 'admin' as const });

const session = (
  org: OrganizationRefDto | null,
  scopes: PanelScopesDto,
): PanelSessionDto => ({
  pilot: { id: 'TMK', code: org == null ? null : 'TMK', name: 'Tomasz Małkiewicz', role: 'admin' },
  org,
  capabilities: ['panel.access'],
  scopes,
});

describe('kontekst sesji w kolumnie bocznej', () => {
  it('sesja klubu pisze NAZWĘ KLUBU - także wtedy, gdy klub jest jedyny', () => {
    const scope = shellScope(session(ALFA, { clubs: [club(ALFA)], platform: false }));

    expect(scope).toEqual({
      kind: 'org',
      label: 'Klub',
      name: 'Aeroklub Alfa',
      // Jeden zakres = nie ma dokąd przełączać, więc kafel NIE jest linkiem: ekran
      // wyboru z jedną kartą obiecywałby wybór, którego nie ma.
      switchTo: null,
    });
  });

  it('drugi klub zapala przełącznik', () => {
    const scope = shellScope(session(ALFA, { clubs: [club(ALFA), club(BETA)], platform: false }));

    expect(scope?.switchTo).toBe(SCOPE_PICK);
    expect(scope?.name).toBe('Aeroklub Alfa');
  });

  it('sesja platformowa jest ZAKRESEM, nie klubem', () => {
    const scope = shellScope(session(null, { clubs: [], platform: true }));

    expect(scope).toEqual({
      kind: 'platform',
      label: 'Superadministrator',
      name: 'Wszystkie kluby',
      switchTo: null,
    });
  });

  it('PLATFORMA LICZY SIĘ JAKO ZAKRES: superadministrator z jednym klubem ma przełącznik', () => {
    // To jest przypadek 00A′ z makiety - operator, który pomaga jednemu klubowi.
    // Gdyby rachunek liczył same kluby, ten człowiek nie miałby jak zejść z platformy
    // do klubu ani wrócić.
    const fromPlatform = shellScope(session(null, { clubs: [club(ALFA)], platform: true }));
    const fromClub = shellScope(session(ALFA, { clubs: [club(ALFA)], platform: true }));

    expect(fromPlatform?.switchTo).toBe(SCOPE_PICK);
    expect(fromClub?.switchTo).toBe(SCOPE_PICK);
  });

  it('bez sesji nie ma kafla', () => {
    expect(shellScope(null)).toBeNull();
    expect(scopeCount(null)).toBe(0);
  });
});
