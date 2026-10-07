/**
 * Ninerdeck - testy ARKUSZA ADRESATÓW W FORMULARZU (`logic/orderFormAddressees.ts`;
 * epik Z-C #247; makieta 31C; pkt 37, 39).
 *
 * Pod obserwacją: grupy nad osobami z licznikiem osób, do których zlecenie NAPRAWDĘ trafi;
 * członek zaznaczonej grupy zaznaczony, ale nie do odznaczenia („z grupy …"); podpis przy
 * osobie z listy drugiego fotela; bez zlecającego i wyłączonych; „GOTOWE · N" liczy osoby
 * raz; wyszukiwarka obu sekcji.
 */

import type { RemoteMemberGroup } from '../application';
import type { Member } from '../ui/screens/logic/orderAddressees';
import { filterSheet, multiSheetVm, personOptions, toggled } from '../ui/screens/logic/orderFormAddressees';
import { PEOPLE } from './support/orderFixtures';

const members: Member[] = [
  ...Object.entries(PEOPLE).map(([id, p]) => ({ id, name: p.name, code: p.code, active: true })),
  { id: 'ZZZ', name: 'Zenon Wyłączony', code: 'ZZZ', active: false },
];

const groups: RemoteMemberGroup[] = [
  { id: 'g-an2', name: 'Piloci An-2', memberIds: ['AKW', 'AKO', 'PLI', 'BNO', 'ESO', 'ZZZ'], createdAt: '', updatedAt: '' },
  { id: 'g-inst', name: 'Instruktorzy', memberIds: ['PWL', 'MZI', 'JWR'], createdAt: '', updatedAt: '' },
];

/** Drugi pilot (31C ramka): dowódca wskazany imiennie - Jakub Wrona. */
const otherPicNamed = { seat: 'pic' as const, mode: 'person' as const, person: 'JWR', people: new Set(['JWR']) };

describe('arkusz „Grupa · lub kilka osób"', () => {
  const vm = multiSheetVm({
    selection: { pilotIds: [], groupIds: ['g-an2'] },
    groups,
    members,
    me: 'MZI',
    other: otherPicNamed,
  });

  it('grupy po nazwie, licznik bez zlecającego i wyłączonych', () => {
    expect(vm.groups.map((g) => [g.name, g.sub, g.on])).toEqual([
      ['Instruktorzy', '2 osoby', false],
      ['Piloci An-2', '5 osób', true],
    ]);
  });

  it('osoby po nazwisku; członek zaznaczonej grupy „z grupy …"; podpis przy osobie z drugiego fotela', () => {
    expect(vm.persons.map((p) => [p.name, p.state, p.sub])).toEqual([
      ['Anna Kowal', 'inherit', 'z grupy Piloci An-2'],
      ['Adam Kowalski', 'inherit', 'z grupy Piloci An-2'],
      ['Piotr Lis', 'inherit', 'z grupy Piloci An-2'],
      ['Barbara Nowak', 'inherit', 'z grupy Piloci An-2'],
      ['Ewa Sowa', 'inherit', 'z grupy Piloci An-2'],
      ['Paweł Wilk', 'off', null],
      ['Jakub Wrona', 'off', 'imiennie na dowódcę · po zaznaczeniu termin do potwierdzenia'],
    ]);
    expect(vm.total).toBe(5);
  });

  it('osoba wskazana i w grupie liczy się raz', () => {
    const both = multiSheetVm({
      selection: { pilotIds: ['AKO', 'PWL'], groupIds: ['g-an2'] },
      groups,
      members,
      me: 'MZI',
      other: null,
    });
    expect(both.total).toBe(6);
    expect(both.persons.find((p) => p.pilotId === 'PWL')?.state).toBe('on');
  });

  it('wyszukiwarka filtruje obie sekcje', () => {
    const found = filterSheet(vm, 'inst');
    expect(found.groups.map((g) => g.name)).toEqual(['Instruktorzy']);
    expect(found.persons).toEqual([]);
    expect(filterSheet(vm, 'wro').persons.map((p) => p.name)).toEqual(['Jakub Wrona']);
  });
});

describe('arkusz „Osoba · imiennie"', () => {
  it('sama lista osób; podpis przy osobie z listy drugiego fotela', () => {
    const list = personOptions({
      members,
      me: 'MZI',
      other: { seat: 'dual', mode: 'group', person: null, people: new Set(['AKW', 'AKO']) },
    });
    expect(list.map((o) => o.name)).toEqual([
      'Anna Kowal',
      'Adam Kowalski',
      'Piotr Lis',
      'Barbara Nowak',
      'Ewa Sowa',
      'Paweł Wilk',
      'Jakub Wrona',
    ]);
    expect(list[0]!.sub).toBe('na liście drugiego pilota · po zaznaczeniu termin do potwierdzenia');
    expect(list[2]!.sub).toBeNull();
  });
});

describe('wybór w toku', () => {
  it('zaznaczenie i odznaczenie pozycji', () => {
    const a = toggled({ pilotIds: [], groupIds: [] }, { kind: 'group', id: 'g-an2' });
    expect(a).toEqual({ pilotIds: [], groupIds: ['g-an2'] });
    expect(toggled(a, { kind: 'group', id: 'g-an2' })).toEqual({ pilotIds: [], groupIds: [] });
  });
});
