/**
 * Ninerdeck - testy KARTY ZLECENIA U PROWADZĄCEGO (`logic/orderLeaderCard.ts`; epik Z-C
 * #247; makiety 32, 32A, 32B).
 *
 * Ramki makiet jeden do jednego: fotele z adresatami w kolejności „mogą → odczytane →
 * nieodczytane → odmowy", osoba przy obu fotelach z „także na …", wspólna lista
 * z „NA DRUGIEGO PILOTA", komplet załogi z godzinami przyjęcia i przydziału oraz
 * zlecenie odwołane jako zapis - bez akcji, liczników i bursztynu.
 */

import type { RemoteOrderCard, RemoteOrderHistoryEntry, RemoteOrderRecipient } from '../application';
import { leaderCardVm, type LeaderCardVm, type LeaderRowVm } from '../ui/screens/logic/orderLeaderCard';
import {
  aircraftOf,
  airfieldName,
  booking,
  card,
  codeOf,
  local,
  localMs,
  nameOf,
  order,
  recipient,
  regOf,
} from './support/orderFixtures';

function vm(c: RemoteOrderCard, now: number, pilotId = 'MZI', canCreate = true): LeaderCardVm {
  const result = leaderCardVm({ card: c, now, pilotId, canCreate, nameOf, codeOf, aircraft: aircraftOf(c.booking.aircraftId), airfieldName, regOf });
  if (result == null) throw new Error('karta nie do narysowania');
  return result;
}

const row = (r: LeaderRowVm) => ({
  who: `${r.name} ${r.code}`,
  status: r.status.map((s) => (s.tone == null ? s.text : `<${s.tone}>${s.text}`)).join(''),
  warn: r.warn,
  reason: r.reason,
  also: r.also,
  picks: r.picks.map((p) => p.label),
  menu: r.menu,
  thread: r.thread,
  unread: r.unread,
});

/** Grupa „Piloci An-2" na drugi fotel - stan z piątku 21:40 (32, ramka 1). */
const group: RemoteOrderRecipient[] = [
  recipient('AKW', { answer: 'yes', answeredAt: local(-2, '19:10'), seen: true, seenAt: local(-2, '19:00'), threadId: 't-akw', unread: 1 }),
  recipient('BNO', { answer: 'yes', answeredAt: local(-1, '21:30'), seen: true, seenAt: local(-1, '21:20') }),
  recipient('ESO', { seen: true, seenAt: local(-2, '20:05'), editUnseen: true }),
  recipient('AKO'),
  recipient('PLI', { answer: 'no', answeredAt: local(-2, '19:48'), answerReason: 'W sobotę mam egzamin w Mielcu.', seen: true, seenAt: local(-2, '19:40') }),
];

const history: RemoteOrderHistoryEntry[] = [
  { id: 'h1', actorId: 'MZI', kind: 'created', payload: { audience: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2' }, at: local(-2, '18:40') },
  { id: 'h2', actorId: 'PWL', kind: 'edited', payload: { changes: { plannedAirMin: { from: 120, to: 180 } } }, at: local(-1, '07:10') },
];

const zlecenieB = (over: Partial<RemoteOrderCard> = {}): RemoteOrderCard =>
  card({
    order: order({
      createdAt: local(-2, '18:40'),
      editedAt: local(-1, '07:10'),
      audienceLabel: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2',
    }),
    viewer: { leads: true, recipient: null },
    recipients: [
      recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null, seen: true, seenAt: local(-1, '08:15') }),
      ...group,
    ],
    history,
    ...over,
  });

describe('32 - fotele i adresaci (ramka 1, piątek 21:40)', () => {
  const v = vm(zlecenieB(), localMs(-1, '21:40'));

  it('hero: szuka załogi, maszyna z typem, odliczanie', () => {
    expect(v.hero).toEqual({
      tone: 'blue',
      date: 'Sobota · 3 października',
      badge: { text: 'Szuka załogi', tone: 'blue' },
      hours: '09:00 → 13:00',
      length: '4 h',
      aircraft: 'SP-ANA · An-2',
      countdown: 'ZA 11 H 20 MIN',
    });
    expect([v.closed, v.crew, v.others]).toEqual([false, null, null]);
  });

  it('fotel imienny: „imiennie", odczytane bez odpowiedzi - moment, w którym prowadzący pisze albo zamienia osobę', () => {
    const pic = v.blocks[0]!;
    expect([pic.key, pic.title, pic.sub, pic.count]).toEqual(['pic', 'Dowódca', 'imiennie', null]);
    expect(pic.rows.map(row)).toEqual([
      {
        who: 'Jakub Wrona JWR',
        status: 'Odczytane 08:15 · bez odpowiedzi',
        warn: null,
        reason: null,
        also: null,
        picks: [],
        menu: true,
        thread: 'write',
        unread: false,
      },
    ]);
  });

  it('fotel z grupy: najpierw ci, którzy mogą (wg zgłoszenia), potem odczytane, nieodczytane, odmowy', () => {
    const dual = v.blocks[1]!;
    expect([dual.title, dual.sub, dual.count]).toEqual(['Drugi pilot', 'Piloci An-2', '2 mogą lecieć']);
    expect(dual.rows.map(row)).toEqual([
      { who: 'Anna Kowal AKW', status: '<ok>Może lecieć · wcz. 19:10', warn: null, reason: null, also: null, picks: ['WYBIERZ'], menu: true, thread: 'write', unread: true },
      { who: 'Barbara Nowak BNO', status: '<ok>Może lecieć · 21:30', warn: null, reason: null, also: null, picks: ['WYBIERZ'], menu: true, thread: 'write', unread: false },
      { who: 'Ewa Sowa ESO', status: 'Odczytane wcz. 20:05', warn: 'zmiana z 07:10 nieodczytana', reason: null, also: null, picks: [], menu: true, thread: 'write', unread: false },
      { who: 'Adam Kowalski AKO', status: '<unread>Nieodczytane', warn: null, reason: null, also: null, picks: [], menu: true, thread: 'write', unread: false },
      { who: 'Piotr Lis PLI', status: '<no>Nie może · wcz. 19:48', warn: null, reason: 'W sobotę mam egzamin w Mielcu.', also: null, picks: [], menu: true, thread: 'write', unread: false },
    ]);
  });

  it('zlecenie bez wiersza „Samolot" (maszyna stoi w hero); zleca Ty; pas EDYTUJ, WYŚLIJ PONOWNIE, ODWOŁAJ', () => {
    expect(v.details.map((d) => [d.label, d.value, d.sub])).toEqual([
      ['Zadanie', 'Skoki', null],
      ['Lotnisko', 'EPKP', 'Kraków-Pobiednik Wielki'],
      ['Plan lotu', '3:00 · paliwo 600 L', null],
      ['Opis', 'Sobotni dzień skokowy - dwa wyloty przed południem, grupa kursowa AFF.', null],
      ['Zleca', 'Ty', 'wysłane wczoraj 18:40'],
    ]);
    expect(v.actions).toEqual({ edit: true, resend: true, cancel: true });
    expect(v.history.map((h) => h.who)).toEqual(['Paweł Wilk', 'Ty']);
  });

  it('„Powiel" wyłącznie z prawem zlecania - prowadzenie cudzych zleceń go nie daje', () => {
    expect(vm(zlecenieB(), localMs(-1, '21:40'), 'MZI', true).duplicate).toBe(true);
    expect(vm(zlecenieB(), localMs(-1, '21:40'), 'MZI', false).duplicate).toBe(false);
  });

  it('koordynator, który nie jest autorem, rozmowy CZYTA - i tylko te, które powstały', () => {
    const coordinator = vm(zlecenieB(), localMs(-1, '21:40'), 'PWL');
    const dual = coordinator.blocks[1]!.rows;
    expect(dual.map((r) => [r.pilotId, r.thread])).toEqual([
      ['AKW', 'read'],
      ['BNO', null],
      ['ESO', null],
      ['AKO', null],
      ['PLI', null],
    ]);
    expect(coordinator.details.at(-1)).toMatchObject({ value: 'Marta Zięba', sub: 'MZI · wysłane wczoraj 18:40' });
  });
});

describe('32 - zlecenie odwołane (ramka 2) jest zapisem', () => {
  const v = vm(
    zlecenieB({
      order: order({ status: 'cancelled', closedAt: local(-1, '16:20'), closedBy: 'MZI', closeReason: 'Maszyna idzie do serwisu.', editedAt: local(-1, '07:10'), audienceLabel: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2' }),
      history: [...history, { id: 'h3', actorId: 'MZI', kind: 'cancelled', payload: { reason: 'Maszyna idzie do serwisu.' }, at: local(-1, '16:20') }],
    }),
    localMs(-1, '16:22'),
  );

  it('hero neutralne bez odliczania, bez pasa akcji', () => {
    expect(v.hero).toMatchObject({ tone: 'off', badge: { text: 'Odwołane', tone: 'dim' }, countdown: null });
    expect([v.closed, v.actions]).toEqual([true, { edit: false, resend: false, cancel: false }]);
  });

  it('fotele zostają z odpowiedziami, ale bez WYBIERZ, menu, liczników i bursztynu', () => {
    expect(v.blocks.map((b) => b.count)).toEqual([null, null]);
    const rows = v.blocks.flatMap((b) => b.rows);
    expect(rows.every((r) => r.picks.length === 0 && !r.menu && r.warn == null)).toBe(true);
    // Rozmowę dalej da się przeczytać - ikona zostaje.
    expect(rows.find((r) => r.pilotId === 'AKW')?.thread).toBe('write');
  });

  it('historia mówi o odwołaniu z nazwiskiem i powodem', () => {
    expect(v.history[0]).toMatchObject({ who: 'Ty', reason: 'Maszyna idzie do serwisu.' });
  });
});

describe('32 - osoba przy obu fotelach (ramka 3, decyzje 37 i 38)', () => {
  const v = vm(
    zlecenieB({
      order: order({ audienceLabel: 'dowódca: Adam Kowalski · drugi pilot: Piloci An-2', createdAt: local(-2, '18:40'), editedAt: local(-1, '07:10') }),
      recipients: [
        recipient('AKO', { seat: null, namedSeat: 'pic', answer: 'yes', answeredAt: local(-1, '21:52'), seen: true, seenAt: local(-1, '21:48') }),
        ...group.filter((r) => r.pilotId !== 'AKO'),
      ],
    }),
    localMs(-1, '21:55'),
  );

  it('blok imienny dowódcy: Adam z WYBIERZ i dopiskiem, licznik jedna osoba', () => {
    const pic = v.blocks[0]!;
    expect([pic.sub, pic.count]).toEqual(['imiennie', '1 może lecieć']);
    expect(pic.rows.map(row)).toEqual([
      { who: 'Adam Kowalski AKO', status: '<ok>Może lecieć · 21:52', warn: null, reason: null, also: 'także na drugiego pilota', picks: ['WYBIERZ'], menu: true, thread: 'write', unread: false },
    ]);
  });

  it('lista grupy: Adam stoi też tutaj, z własnym WYBIERZ i „także na dowódcę"', () => {
    const dual = v.blocks[1]!;
    expect(dual.count).toBe('3 mogą lecieć');
    expect(dual.rows.map((r) => [r.pilotId, r.also, r.picks.map((p) => `${p.label}:${p.seat}`)])).toEqual([
      ['AKW', null, ['WYBIERZ:dual']],
      ['BNO', null, ['WYBIERZ:dual']],
      ['AKO', 'także na dowódcę', ['WYBIERZ:dual']],
      ['ESO', null, []],
      ['PLI', null, []],
    ]);
  });

  it('po odmowie dopisku nie ma - odmowa stoi przy obu fotelach, ale na żaden z nich ta osoba już nie trafi', () => {
    const refused = vm(
      zlecenieB({
        order: order({ audienceLabel: 'dowódca: Adam Kowalski · drugi pilot: Piloci An-2', createdAt: local(-2, '18:40') }),
        recipients: [
          recipient('AKO', { seat: null, namedSeat: 'pic', answer: 'no', answeredAt: local(-1, '21:52'), seen: true }),
          ...group.filter((r) => r.pilotId !== 'AKO'),
        ],
      }),
      localMs(-1, '21:55'),
    );
    const ako = refused.blocks.flatMap((b) => b.rows).filter((r) => r.pilotId === 'AKO');
    expect(ako.map((r) => r.also)).toEqual([null, null]);
  });
});

describe('32A - wspólna lista, dowódca przydzielony', () => {
  const v = vm(
    card({
      order: order({ addressing: 'shared', audienceLabel: 'wspólna lista: Piloci An-2', createdAt: local(-2, '18:40') }),
      booking: booking({ pilotId: 'BNO' }),
      viewer: { leads: true, recipient: null },
      recipients: [
        recipient('BNO', { seat: null, answer: 'yes', answeredAt: local(-1, '21:30'), seen: true }),
        ...group.filter((r) => r.pilotId !== 'BNO').map((r) => ({ ...r, seat: null })),
      ],
      history: [{ id: 'h1', actorId: 'MZI', kind: 'assigned', payload: { seat: 'pic', pilotId: 'BNO', via: 'leader' }, at: local(-1, '21:35') }],
    }),
    localMs(-1, '21:40'),
  );

  it('załoga: kto leci (z godziną przydziału) i który fotel szuka - instrukcja, nie opis stanu', () => {
    expect(v.hero.badge).toEqual({ text: 'Szuka drugiego pilota', tone: 'blue' });
    expect(v.crew?.map((c) => ({ label: c.label, name: c.name, status: c.status.map((s) => s.text).join(''), menu: c.menu }))).toEqual([
      { label: 'Dowódca', name: 'Barbara Nowak', status: 'Leci · przydział 21:35', menu: true },
      { label: 'Drugi pilot', name: null, status: 'przydziel z listy niżej', menu: false },
    ]);
  });

  it('jeden blok wspólnej listy; przydział nazywa fotel, który został', () => {
    expect(v.blocks.map((b) => [b.key, b.title, b.sub, b.count])).toEqual([['shared', 'Wspólna lista', 'Piloci An-2', '1 może lecieć']]);
    expect(v.blocks[0]!.rows.map((r) => [r.pilotId, r.picks.map((p) => p.label)])).toEqual([
      ['AKW', ['NA DRUGIEGO PILOTA']],
      ['ESO', []],
      ['AKO', []],
      ['PLI', []],
    ]);
    // Barbara siedzi w fotelu - na liście jej już nie ma.
    expect(v.others).toBeNull();
  });
});

describe('32A po odwołaniu - karta „Załoga" jest zapisem', () => {
  const v = vm(
    card({
      order: order({
        status: 'cancelled',
        addressing: 'shared',
        audienceLabel: 'wspólna lista: Piloci An-2',
        createdAt: local(-2, '18:40'),
        closedAt: local(-1, '22:00'),
        closedBy: 'MZI',
        closeReason: 'Maszyna idzie do serwisu.',
      }),
      booking: booking({ pilotId: 'BNO' }),
      viewer: { leads: true, recipient: null },
      recipients: [recipient('BNO', { seat: null, answer: 'yes', answeredAt: local(-1, '21:30'), seen: true })],
      history: [{ id: 'h1', actorId: 'MZI', kind: 'assigned', payload: { seat: 'pic', pilotId: 'BNO', via: 'leader' }, at: local(-1, '21:35') }],
    }),
    localMs(-1, '22:10'),
  );

  it('kto usiadł i kiedy - bez „Leci" i bez zieleni, bo lot się nie odbędzie; bez menu', () => {
    expect(v.crew?.[0]).toMatchObject({ name: 'Barbara Nowak', status: [{ text: 'Przydział 21:35' }], menu: false });
    expect(v.crew?.[0]?.status.some((s) => s.tone === 'ok')).toBe(false);
  });

  it('pusty fotel przestaje być pytaniem ekranu', () => {
    expect(v.crew?.[1]).toMatchObject({ name: null, status: [], asking: false });
  });

  it('w zleceniu żywym ten sam pusty fotel pyta (wzorzec 32A)', () => {
    const live = vm(
      card({
        order: order({ addressing: 'shared', audienceLabel: 'wspólna lista: Piloci An-2', createdAt: local(-2, '18:40') }),
        booking: booking({ pilotId: 'BNO' }),
        viewer: { leads: true, recipient: null },
        recipients: [recipient('BNO', { seat: null, answer: 'yes', answeredAt: local(-1, '21:30'), seen: true })],
        history: [],
      }),
      localMs(-1, '21:40'),
    );
    expect(live.crew?.map((c) => c.asking)).toEqual([false, true]);
  });
});

describe('32B - komplet załogi', () => {
  const v = vm(
    card({
      order: order({ status: 'filled', audienceLabel: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2', createdAt: local(-2, '18:40') }),
      booking: booking({ pilotId: 'JWR', dualId: 'AKW' }),
      viewer: { leads: true, recipient: null },
      recipients: [
        recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null, answer: 'yes', answeredAt: local(-1, '22:05'), seen: true }),
        recipient('AKW', { answer: 'yes', answeredAt: local(-2, '19:10'), seen: true }),
        recipient('BNO', { answer: 'yes', answeredAt: local(-1, '21:30'), seen: true, inPlay: false, staleReason: 'seat_filled' }),
        recipient('AKO', { seat: 'dual', answer: 'yes', answeredAt: local(-1, '21:52'), seen: true, inPlay: false, staleReason: 'seat_filled' }),
        recipient('ESO', { seen: true, seenAt: local(-2, '20:05'), inPlay: false, staleReason: 'seat_filled' }),
        recipient('PLI', { answer: 'no', answeredAt: local(-2, '19:48'), answerReason: 'W sobotę mam egzamin w Mielcu.', inPlay: false, staleReason: 'seat_filled' }),
      ],
      history: [
        { id: 'h1', actorId: 'JWR', kind: 'assigned', payload: { seat: 'pic', pilotId: 'JWR', via: 'answer' }, at: local(-1, '22:05') },
        { id: 'h2', actorId: 'MZI', kind: 'assigned', payload: { seat: 'dual', pilotId: 'AKW', via: 'leader' }, at: local(-1, '22:12') },
      ],
    }),
    localMs(-1, '22:30'),
  );

  it('hero w zieleni; załoga z „przyjęte" i „przydział"; bez bloków', () => {
    expect(v.hero.tone).toBe('green');
    expect(v.hero.badge).toEqual({ text: 'Komplet załogi', tone: 'green' });
    expect(v.crew?.map((c) => [c.name, c.code, c.status.map((s) => s.text).join(''), c.menu])).toEqual([
      ['Jakub Wrona', 'JWR', 'Leci · przyjęte 22:05', true],
      ['Anna Kowal', 'AKW', 'Leci · przydział 22:12', true],
    ]);
    expect(v.blocks).toEqual([]);
  });

  it('przy osobie w fotelu zostaje rozmowa - ta sama, co przy adresacie, z którego usiadła', () => {
    expect(v.crew?.map((c) => [c.pilotId, c.thread])).toEqual([
      ['JWR', 'write'],
      ['AKW', 'write'],
    ]);
  });

  it('„Pozostali adresaci" - zwinięci, bez tonów i bez akcji', () => {
    expect(v.others?.count).toBe(4);
    expect(v.others?.rows.map(row)).toEqual([
      { who: 'Barbara Nowak BNO', status: 'Może lecieć · 21:30', warn: null, reason: null, also: null, picks: [], menu: false, thread: 'write', unread: false },
      { who: 'Adam Kowalski AKO', status: 'Może lecieć · 21:52', warn: null, reason: null, also: null, picks: [], menu: false, thread: 'write', unread: false },
      { who: 'Ewa Sowa ESO', status: 'Odczytane wcz. 20:05', warn: null, reason: null, also: null, picks: [], menu: false, thread: 'write', unread: false },
      { who: 'Piotr Lis PLI', status: 'Nie może · wcz. 19:48', warn: null, reason: 'W sobotę mam egzamin w Mielcu.', also: null, picks: [], menu: false, thread: 'write', unread: false },
    ]);
  });

  it('pas: EDYTUJ i ODWOŁAJ; WYŚLIJ PONOWNIE nie ma - nie ma kogo szukać', () => {
    expect(v.actions).toEqual({ edit: true, resend: false, cancel: true });
  });
});

describe('zlecenie instruktora - fotel „ja"', () => {
  it('karta „Załoga" mówi, że w fotelu siedzi osoba zlecająca - bez menu', () => {
    const v = vm(
      card({
        order: order({ createdBy: 'AKO', seats: { pic: 'self', dual: 'sought' }, audienceLabel: 'drugi pilot: Ewa Sowa' }),
        booking: booking({ pilotId: 'AKO' }),
        viewer: { leads: true, recipient: null },
        recipients: [recipient('ESO', { seat: 'dual', direct: true, viaGroupId: null })],
      }),
      localMs(-1, '21:45'),
      'AKO',
    );
    expect(v.crew?.map((c) => [c.label, c.name, c.status.map((s) => s.text).join(''), c.menu, c.thread])).toEqual([
      ['Dowódca', 'Ty', 'osoba zlecająca', false, null],
      ['Drugi pilot', null, 'wybierz z listy niżej', false, null],
    ]);
    expect(v.blocks.map((b) => [b.title, b.sub])).toEqual([['Drugi pilot', 'imiennie']]);
  });
});
