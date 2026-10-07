/**
 * Wiersze listy grup - ten sam zestaw, co makieta `piloci-grupy`: „Instruktorzy" z jednym
 * członkostwem wyłączonym (Paweł Nowak) i „Piloci An-2" w komplecie aktywnych.
 */

import { describe, expect, it } from 'vitest';

import type { DirectoryDto, GroupDto } from '../../api/dto';
import { disabledLabel, groupMembers, groupRows, groupSub, membersLabel } from './groupRows';

const DIRECTORY: DirectoryDto = {
  members: [
    { id: 'ako', code: 'AKO', name: 'Adam Kowalski', active: true },
    { id: 'mso', code: 'MSO', name: 'Marek Sowa', active: true },
    { id: 'pwi', code: 'PWI', name: 'Paweł Wilk', active: true },
    { id: 'pno', code: 'PNO', name: 'Paweł Nowak', active: false },
    { id: 'akw', code: 'AKW', name: 'Anna Kowal', active: true },
  ],
  aircraft: [],
};

const group = (id: string, name: string, memberIds: string[]): GroupDto => ({
  id,
  name,
  memberIds,
  createdAt: '2026-09-28T10:00:00Z',
  updatedAt: '2026-09-28T10:00:00Z',
});

describe('członkowie grupy ze słownika klubu', () => {
  it('najpierw aktywni, potem wyłączeni - obie części alfabetycznie', () => {
    const members = groupMembers(['pno', 'pwi', 'ako', 'mso'], DIRECTORY);
    expect(members.map((m) => m.name)).toEqual(['Adam Kowalski', 'Marek Sowa', 'Paweł Wilk', 'Paweł Nowak']);
    expect(members[3]).toEqual({ id: 'pno', name: 'Paweł Nowak', code: 'PNO', active: false });
  });

  it('osoba spoza słownika to kreska, nigdy surowy identyfikator', () => {
    expect(groupMembers(['obcy'], DIRECTORY)).toEqual([{ id: 'obcy', name: '—', code: null, active: false }]);
  });
});

describe('podpisy', () => {
  it('liczba członków i członkostw wyłączonych z odmianą', () => {
    expect(membersLabel(1)).toBe('1 członek');
    expect(membersLabel(4)).toBe('4 członków');
    expect(disabledLabel(1)).toBe('1 członkostwo wyłączone');
    expect(disabledLabel(2)).toBe('2 członkostwa wyłączone');
    expect(disabledLabel(5)).toBe('5 członkostw wyłączonych');
  });

  it('podtytuł szuflady dokłada wyłączone tylko wtedy, gdy są', () => {
    expect(groupSub(groupMembers(['ako', 'mso', 'pwi', 'pno'], DIRECTORY))).toBe('4 członków · 1 członkostwo wyłączone');
    expect(groupSub(groupMembers(['ako'], DIRECTORY))).toBe('1 członek');
  });
});

describe('wiersze tabeli grup', () => {
  it('alfabetycznie po nazwie; skład jednym zdaniem; podpis pod liczbą przy wyłączonych', () => {
    const rows = groupRows(
      [group('g2', 'Piloci An-2', ['akw', 'ako']), group('g1', 'Instruktorzy', ['pno', 'pwi', 'ako', 'mso'])],
      DIRECTORY,
    );
    expect(rows).toEqual([
      {
        id: 'g1',
        name: 'Instruktorzy',
        count: 4,
        countSub: '1 członkostwo wyłączone',
        composition: 'Adam Kowalski, Marek Sowa, Paweł Wilk, Paweł Nowak',
      },
      { id: 'g2', name: 'Piloci An-2', count: 2, countSub: null, composition: 'Adam Kowalski, Anna Kowal' },
    ]);
  });

  it('grupa bez członków - zero i kreska, bez podpisu', () => {
    expect(groupRows([group('g', 'Na zapas', [])], DIRECTORY)[0]).toMatchObject({ count: 0, countSub: null, composition: '—' });
  });
});
