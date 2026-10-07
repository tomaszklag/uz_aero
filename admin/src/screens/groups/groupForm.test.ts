import { describe, expect, it } from 'vitest';

import type { DirectoryDto, GroupDto } from '../../api/dto';
import { draftOf, EMPTY_GROUP, groupBlocked, groupPatch, memberOptions, newGroup, toggleMember } from './groupForm';

const DIRECTORY: DirectoryDto = {
  members: [
    { id: 'ako', code: 'AKO', name: 'Adam Kowalski', active: true },
    { id: 'mso', code: 'MSO', name: 'Marek Sowa', active: true },
    { id: 'pno', code: 'PNO', name: 'Paweł Nowak', active: false },
    { id: 'akw', code: 'AKW', name: 'Anna Kowal', active: true },
    { id: 'bno', code: 'BNO', name: 'Barbara Nowak', active: false },
  ],
  aircraft: [],
};

const INSTRUCTORS: GroupDto = {
  id: 'g1',
  name: 'Instruktorzy',
  memberIds: ['mso', 'pno', 'ako'],
  createdAt: '2026-09-28T10:00:00Z',
  updatedAt: '2026-09-28T10:00:00Z',
};

describe('szkic grupy', () => {
  it('przełączanie osoby dopisuje ją albo zdejmuje', () => {
    expect(toggleMember(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleMember(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('zmiana niesie tylko to, co się zmieniło - kolejność obsady nie jest zmianą', () => {
    expect(groupPatch(INSTRUCTORS, draftOf(INSTRUCTORS))).toBeNull();
    expect(groupPatch(INSTRUCTORS, { ...draftOf(INSTRUCTORS), memberIds: ['ako', 'mso', 'pno'] })).toBeNull();
    expect(groupPatch(INSTRUCTORS, { ...draftOf(INSTRUCTORS), name: '  Instruktorzy klubu ' })).toEqual({
      name: 'Instruktorzy klubu',
    });
    expect(groupPatch(INSTRUCTORS, { ...draftOf(INSTRUCTORS), memberIds: ['ako'] })).toEqual({ memberIds: ['ako'] });
  });

  it('zapis zablokowany przy pustej nazwie i przy braku zmian - grupa bez członków jest dozwolona', () => {
    expect(groupBlocked(null, EMPTY_GROUP)).toBe(true);
    expect(groupBlocked(null, { name: '   ', memberIds: ['ako'] })).toBe(true);
    expect(groupBlocked(null, { name: 'Na zapas', memberIds: [] })).toBe(false);
    expect(groupBlocked(INSTRUCTORS, draftOf(INSTRUCTORS))).toBe(true);
    expect(groupBlocked(INSTRUCTORS, { ...draftOf(INSTRUCTORS), memberIds: [] })).toBe(false);
  });

  it('nowa grupa: nazwa przycięta, identyfikator od panelu', () => {
    expect(newGroup('id-1', { name: ' Piloci skokowi ', memberIds: ['ako'] })).toEqual({
      id: 'id-1',
      name: 'Piloci skokowi',
      memberIds: ['ako'],
    });
  });
});

describe('karty obsady', () => {
  const pinned = INSTRUCTORS.memberIds;

  it('obecni członkowie na górze (aktywni, potem wyłączony), pod nimi reszta aktywnych alfabetycznie', () => {
    const options = memberOptions(DIRECTORY, draftOf(INSTRUCTORS), pinned, '');
    expect(options.map((o) => o.name)).toEqual(['Adam Kowalski', 'Marek Sowa', 'Paweł Nowak', 'Anna Kowal']);
    expect(options[2]).toEqual({
      id: 'pno',
      name: 'Paweł Nowak',
      desc: 'PNO · członkostwo wyłączone - nie dostaje zleceń',
      selected: true,
      dim: true,
    });
    // Wyłączonej osoby SPOZA grupy nie da się dopisać - serwer by odmówił, więc nie ma karty.
    expect(options.some((o) => o.id === 'bno')).toBe(false);
  });

  it('zaznaczenie nie przestawia kolejności - karta nie ucieka spod kursora', () => {
    const draft = { ...draftOf(INSTRUCTORS), memberIds: [...INSTRUCTORS.memberIds, 'akw'] };
    const options = memberOptions(DIRECTORY, draft, pinned, '');
    expect(options.map((o) => o.id)).toEqual(['ako', 'mso', 'pno', 'akw']);
    expect(options[3]!.selected).toBe(true);
  });

  it('wyszukiwanie po fragmencie nazwiska albo kodu, bez względu na wielkość liter', () => {
    expect(memberOptions(DIRECTORY, EMPTY_GROUP, [], 'KOW').map((o) => o.id)).toEqual(['ako', 'akw']);
    expect(memberOptions(DIRECTORY, EMPTY_GROUP, [], 'mso').map((o) => o.id)).toEqual(['mso']);
  });

  it('nowa grupa: wszyscy aktywni alfabetycznie, nikt nie zaznaczony', () => {
    expect(memberOptions(DIRECTORY, EMPTY_GROUP, [], '').map((o) => [o.name, o.selected])).toEqual([
      ['Adam Kowalski', false],
      ['Anna Kowal', false],
      ['Marek Sowa', false],
    ]);
  });
});
