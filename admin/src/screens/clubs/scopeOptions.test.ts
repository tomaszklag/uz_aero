import { describe, expect, it } from 'vitest';

import type { PanelScopesDto } from '../../api/dto';
import { scopeOptions, scopeQuestion } from './scopeOptions';

const club = (id: string, name: string, code: string) => ({
  org: { id, slug: id, name },
  code,
  role: 'admin' as const,
});

const scopes = (over: Partial<PanelScopesDto> = {}): PanelScopesDto => ({
  clubs: [club('org-a', 'Aeroklub Zielonogórski', 'TMK')],
  platform: false,
  ...over,
});

describe('karty wyboru zakresu', () => {
  it('klub niesie ROLĘ i KOD w tym klubie - to jest skutek wyboru', () => {
    expect(scopeOptions(scopes())).toEqual([
      {
        orgId: 'org-a',
        name: 'Aeroklub Zielonogórski',
        desc: 'administrator · Twój kod TMK',
      },
    ]);
  });

  it('PLATFORMA STOI PIERWSZA i mówi o zakresie, nie o kodzie pilota', () => {
    const options = scopeOptions(
      scopes({ clubs: [club('org-a', 'Aeroklub Zielonogórski', 'TKL')], platform: true }),
    );

    expect(options.map((o) => o.orgId)).toEqual([null, 'org-a']);
    expect(options[0]!.desc).not.toContain('kod');
  });

  it('kolejność klubów zostaje SERWEROWA - panel nie sortuje drugi raz', () => {
    const options = scopeOptions(
      scopes({
        clubs: [club('org-z', 'Zielona Góra', 'ZG'), club('org-a', 'Aeroklub Alfa', 'AA')],
      }),
    );

    expect(options.map((o) => o.name)).toEqual(['Zielona Góra', 'Aeroklub Alfa']);
  });

  it('pytanie zmienia się razem z tym, co jest na liście', () => {
    expect(scopeQuestion(scopes())).toBe('W którym klubie pracujesz?');
    expect(scopeQuestion(scopes({ platform: true }))).toBe('Gdzie wchodzisz?');
  });
});
