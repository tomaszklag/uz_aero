/**
 * Ninerdeck (serwer) - adresowanie zlecenia: rozwinięcie grup w osoby
 * (#245, `docs/zlecenia.md` §4.2, §4.3, §6.2).
 *
 * Trzy rzeczy, których złamanie jest wadą MODELU, a nie usterką ekranu:
 *  1. „tak" obsadza fotel WYŁĄCZNIE u jedynego adresata wskazanego imiennie (`direct`);
 *  2. osoba z list obu foteli dostaje TERMIN DO POTWIERDZENIA - także wskazana imiennie
 *     na jeden i obecna w grupie drugiego (pkt 37), a wskazanie traci moc obsadzania;
 *  3. zlecający i członkowie nieaktywni zlecenia nie dostają - ale osoba WSKAZANA
 *     imiennie bez aktywnego członkostwa jest odmową, nie cichym pominięciem.
 */

import { describe, expect, it } from 'vitest';

import {
  audienceLabel,
  expandRecipients,
  withAddedRecipients,
  type ExpansionContext,
  type OrderAudience,
} from '../src/domain/orderAddressing.ts';

const GROUPS = new Map<string, readonly string[]>([
  ['g-instr', ['JWR', 'PIE']],
  ['g-an2', ['BNO', 'JWR', 'OFF']],
]);
const ACTIVE = new Set(['AKO', 'JWR', 'PIE', 'BNO', 'ANN']);

const ctx = (extra: Partial<ExpansionContext> = {}): ExpansionContext => ({
  authorId: 'AKO',
  groupMembers: GROUPS,
  isActiveMember: (id) => ACTIVE.has(id),
  ...extra,
});

const list = (pilotIds: string[] = [], groupIds: string[] = []) => ({ pilotIds, groupIds });

describe('imiennie na fotel', () => {
  it('jedyna osoba wskazana imiennie obsadza fotel swoim „tak" (`direct`)', () => {
    const audience: OrderAudience = { kind: 'per_seat', pic: list(['JWR']), dual: null };
    expect(expandRecipients({ pic: 'sought', dual: 'none' }, audience, ctx())).toEqual([
      { pilotId: 'JWR', seat: 'pic', namedSeat: null, direct: true, viaGroupId: null },
    ]);
  });

  it('dwie osoby na fotel to już zgłoszenia - wybiera prowadzący', () => {
    const audience: OrderAudience = { kind: 'per_seat', pic: list(['JWR', 'BNO']), dual: null };
    const out = expandRecipients({ pic: 'sought', dual: 'none' }, audience, ctx());
    expect(out).toEqual([
      { pilotId: 'JWR', seat: 'pic', namedSeat: null, direct: false, viaGroupId: null },
      { pilotId: 'BNO', seat: 'pic', namedSeat: null, direct: false, viaGroupId: null },
    ]);
  });

  it('grupa z jedną osobą NIE jest wskazaniem imiennym - zlecający wybrał grupę', () => {
    const groups = new Map([['g-solo', ['PIE']]]);
    const audience: OrderAudience = { kind: 'per_seat', pic: list([], ['g-solo']), dual: null };
    const out = expandRecipients({ pic: 'sought', dual: 'none' }, audience, ctx({ groupMembers: groups }));
    expect(out).toEqual([{ pilotId: 'PIE', seat: 'pic', namedSeat: null, direct: false, viaGroupId: 'g-solo' }]);
  });

  it('instruktor → uczeń: dowódca „ja", drugi pilot imiennie', () => {
    const audience: OrderAudience = { kind: 'per_seat', pic: null, dual: list(['ANN']) };
    expect(expandRecipients({ pic: 'self', dual: 'sought' }, audience, ctx())).toEqual([
      { pilotId: 'ANN', seat: 'dual', namedSeat: null, direct: true, viaGroupId: null },
    ]);
  });
});

describe('termin do potwierdzenia (pkt 30, 37)', () => {
  it('osoba z list obu foteli (grupy się pokrywają) dostaje JEDNO zlecenie bez fotela', () => {
    const audience: OrderAudience = {
      kind: 'per_seat',
      pic: list([], ['g-instr']),
      dual: list([], ['g-an2']),
    };
    const out = expandRecipients({ pic: 'sought', dual: 'sought' }, audience, ctx());
    expect(out).toEqual([
      { pilotId: 'JWR', seat: null, namedSeat: null, direct: false, viaGroupId: 'g-instr' },
      { pilotId: 'PIE', seat: 'pic', namedSeat: null, direct: false, viaGroupId: 'g-instr' },
      { pilotId: 'BNO', seat: 'dual', namedSeat: null, direct: false, viaGroupId: 'g-an2' },
    ]);
  });

  it('wskazana imiennie na jeden fotel i obecna w grupie drugiego: wskazanie traci moc obsadzania', () => {
    // Makieta 31B: Jan imiennie na dowódcę, grupa „Piloci An-2" (z Janem) na drugiego.
    const audience: OrderAudience = { kind: 'per_seat', pic: list(['JWR']), dual: list([], ['g-an2']) };
    const out = expandRecipients({ pic: 'sought', dual: 'sought' }, audience, ctx());
    expect(out).toContainEqual({ pilotId: 'JWR', seat: null, namedSeat: 'pic', direct: false, viaGroupId: 'g-an2' });
    // Pozostali z grupy stoją przy swoim fotelu jako zgłoszenia.
    expect(out).toContainEqual({ pilotId: 'BNO', seat: 'dual', namedSeat: null, direct: false, viaGroupId: 'g-an2' });
  });
});

describe('kto zlecenia nie dostaje', () => {
  it('zlecający wypada z adresatów, nawet gdy jest w grupie', () => {
    const groups = new Map([['g-all', ['AKO', 'PIE']]]);
    const audience: OrderAudience = { kind: 'per_seat', pic: list([], ['g-all']), dual: null };
    const out = expandRecipients({ pic: 'sought', dual: 'none' }, audience, ctx({ groupMembers: groups }));
    expect(out).toEqual([{ pilotId: 'PIE', seat: 'pic', namedSeat: null, direct: false, viaGroupId: 'g-all' }]);
  });

  it('członek nieaktywny zostaje na liście grupy, ale zlecenia nie dostaje', () => {
    const audience: OrderAudience = { kind: 'per_seat', pic: list([], ['g-an2']), dual: null };
    const out = expandRecipients({ pic: 'sought', dual: 'none' }, audience, ctx());
    expect(out).toEqual([
      { pilotId: 'BNO', seat: 'pic', namedSeat: null, direct: false, viaGroupId: 'g-an2' },
      { pilotId: 'JWR', seat: 'pic', namedSeat: null, direct: false, viaGroupId: 'g-an2' },
    ]);
  });

  it('osoba WSKAZANA imiennie bez aktywnego członkostwa to odmowa, nie cisza', () => {
    const audience: OrderAudience = { kind: 'per_seat', pic: list(['OFF']), dual: null };
    expect(expandRecipients({ pic: 'sought', dual: 'none' }, audience, ctx())).toBe('not_member');
  });

  it('grupa spoza klubu (skasowana albo cudza) to jedna odmowa na oba przypadki', () => {
    const audience: OrderAudience = { kind: 'per_seat', pic: list([], ['g-cudza']), dual: null };
    expect(expandRecipients({ pic: 'sought', dual: 'none' }, audience, ctx())).toBe('unknown_group');
  });

  it('osoby, którym ODEBRANO zlecenie, nie wracają i nie liczą się do „jedynego adresata"', () => {
    const audience: OrderAudience = { kind: 'per_seat', pic: list(['JWR', 'ANN']), dual: null };
    const out = expandRecipients(
      { pic: 'sought', dual: 'none' },
      audience,
      ctx({ removed: new Set(['JWR']) }),
    );
    // „Zamień osobę" przy fotelu imiennym: Anna zostaje jedyną - jej „tak" obsadza fotel.
    expect(out).toEqual([{ pilotId: 'ANN', seat: 'pic', namedSeat: null, direct: true, viaGroupId: null }]);
  });
});

describe('fotel bez adresata i listy nie na miejscu', () => {
  it('szukany fotel bez ani jednego adresata to odmowa - nikt by go nie obsadził', () => {
    const audience: OrderAudience = { kind: 'per_seat', pic: list(['JWR']), dual: null };
    expect(expandRecipients({ pic: 'sought', dual: 'sought' }, audience, ctx())).toBe('no_recipients');
  });

  it('lista dla fotela, którego zlecenie nie szuka, to odmowa - nie ciche pominięcie', () => {
    const audience: OrderAudience = { kind: 'per_seat', pic: list(['JWR']), dual: list(['ANN']) };
    expect(expandRecipients({ pic: 'sought', dual: 'none' }, audience, ctx())).toBe('seat_not_sought');
  });

  it('wspólna lista: jedna lista dla wszystkich szukanych foteli, bez fotela przy osobie', () => {
    const audience: OrderAudience = { kind: 'shared', list: list(['ANN'], ['g-instr']) };
    const out = expandRecipients({ pic: 'sought', dual: 'sought' }, audience, ctx());
    expect(out).toEqual([
      { pilotId: 'ANN', seat: null, namedSeat: null, direct: false, viaGroupId: null },
      { pilotId: 'JWR', seat: null, namedSeat: null, direct: false, viaGroupId: 'g-instr' },
      { pilotId: 'PIE', seat: null, namedSeat: null, direct: false, viaGroupId: 'g-instr' },
    ]);
    expect(expandRecipients({ pic: 'sought', dual: 'sought' }, { kind: 'shared', list: list() }, ctx())).toBe(
      'no_recipients',
    );
  });
});

describe('definicja po dopisaniu i etykieta dla prowadzących', () => {
  it('dopisanie idzie do listy fotela bez powtórzeń', () => {
    const before: OrderAudience = { kind: 'per_seat', pic: list(['JWR']), dual: null };
    expect(withAddedRecipients(before, { seat: 'pic', list: list(['JWR', 'ANN'], ['g-instr']) })).toEqual({
      kind: 'per_seat',
      pic: list(['JWR', 'ANN'], ['g-instr']),
      dual: null,
    });
    expect(withAddedRecipients(before, { seat: 'dual', list: list(['ANN']) })).toEqual({
      kind: 'per_seat',
      pic: list(['JWR']),
      dual: list(['ANN']),
    });
  });

  it('etykieta nazywa fotele i grupy z chwili zapisu', () => {
    const names = {
      person: (id: string) => ({ ANN: 'Anna Nowak', JWR: 'Jan Wrona' })[id] ?? id,
      group: (id: string) => ({ 'g-instr': 'Instruktorzy', 'g-an2': 'Piloci An-2' })[id] ?? id,
    };
    expect(
      audienceLabel(
        { pic: 'sought', dual: 'sought' },
        { kind: 'per_seat', pic: list([], ['g-instr']), dual: list(['ANN']) },
        names,
      ),
    ).toBe('dowódca: Instruktorzy · drugi pilot: Anna Nowak');
    expect(
      audienceLabel({ pic: 'sought', dual: 'sought' }, { kind: 'shared', list: list(['JWR'], ['g-an2']) }, names),
    ).toBe('wspólna lista: Piloci An-2, Jan Wrona');
  });
});
