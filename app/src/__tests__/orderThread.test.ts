/**
 * Ninerdeck - testy ROZMOWY W ZLECENIU (`logic/orderThread.ts`; epik Z-C #247; makiety
 * 29, 29A, 29B).
 *
 * Ramki makiet jeden do jednego: nagłówek trzech widzów (adresat, autor, czytelnik),
 * pasek zlecenia z fotelem, separatory „Wczoraj"/„Dziś" czasem klubu, „Odczytane" pod
 * ostatnią własną (u czytelnika - pod ostatnią i o drugim uczestniku), nazwiska nad
 * seriami wyłącznie u czytelnika i zdanie zamiast pola, gdy nie da się pisać.
 */

import type { RemoteOrderCard, RemoteThreadMessage, RemoteThreadPage } from '../application';
import type { ChangePart } from '../ui/screens/logic/orderChanges';
import { threadVm, type ThreadItemVm } from '../ui/screens/logic/orderThread';
import { booking, card, codeOf, local, localMs, me, nameOf, order, recipient, regOf } from './support/orderFixtures';

const flat = (parts: readonly ChangePart[]): string => parts.map((p) => (p.strong ? `[${p.text}]` : p.text)).join('');

const msg = (id: string, authorId: string, at: string, body = id): RemoteThreadMessage => ({ id, authorId, body, createdAt: at });

const page = (over: Partial<RemoteThreadPage> = {}): Pick<RemoteThreadPage, 'role' | 'closed' | 'participants' | 'messages'> => ({
  role: 'participant',
  closed: null,
  participants: [],
  messages: [],
  ...over,
});

/** Skrót wiersza osi: dzień albo „strona · godzina · odczyt". */
const line = (item: ThreadItemVm): string =>
  item.kind === 'day'
    ? `— ${item.label} —`
    : [
        item.side === 'right' ? '>' : '<',
        item.own ? 'own' : null,
        item.author == null ? null : `${item.author.name} ${item.author.code}`,
        item.body,
        item.time,
        item.read,
      ]
        .filter((p) => p != null)
        .join(' | ');

/** Zlecenie A po przesunięciu terminu: przelot SP-AXA, sobota 10:00-12:00. */
const zlecenieA = (over: Partial<RemoteOrderCard> = {}): RemoteOrderCard =>
  card({
    order: order({ id: 'o-a', createdBy: 'MZI', seats: { pic: 'sought', dual: 'none' } }),
    booking: booking({ aircraftId: 'ac-axa', startsAt: local(0, '10:00'), endsAt: local(0, '12:00'), operation: 'ferry', fromIcao: 'EPKK', toIcao: 'EPRJ' }),
    ...over,
  });

const rozmowaA = [
  msg('m1', 'MZI', local(-2, '19:02'), 'Cześć, dasz radę w sobotę rano?'),
  msg('m2', 'AKO', local(-2, '19:10'), 'Mogę, ale dopiero od 10.'),
  msg('m3', 'MZI', local(-2, '19:12'), 'Sprawdzę, czy SP-AXA jest wtedy wolna.'),
  msg('m4', 'MZI', local(-1, '07:31'), 'Przesunęłam na 10:00-12:00.'),
  msg('m5', 'AKO', local(-1, '07:40'), 'Dzięki, w takim razie przyjmuję.'),
];

describe('29 - adresat po przyjęciu (piątek 07:45)', () => {
  const v = threadVm({
    page: page({
      // Strona przychodzi od najnowszej - kolejność osi robi moduł.
      messages: [...rozmowaA].reverse(),
      participants: [
        { pilotId: 'MZI', lastReadAt: local(-1, '07:41') },
        { pilotId: 'AKO', lastReadAt: local(-1, '07:40') },
      ],
    }),
    card: zlecenieA({ booking: booking({ aircraftId: 'ac-axa', startsAt: local(0, '10:00'), endsAt: local(0, '12:00'), operation: 'ferry', fromIcao: 'EPKK', toIcao: 'EPRJ', pilotId: 'AKO' }), viewer: { leads: false, recipient: me({ seat: 'pic', direct: true, assignedSeat: 'pic', answer: 'yes' }) } }),
    recipientId: 'AKO',
    viewerId: 'AKO',
    now: localMs(-1, '07:45'),
    nameOf,
    codeOf,
    regOf,
  })!;

  it('nagłówek: osoba zlecająca w mianowniku, „zleca · kod"', () => {
    expect([v.role, v.header]).toEqual(['recipient', { title: 'Marta Zięba', sub: 'zleca · MZI' }]);
  });

  it('pasek zlecenia: maszyna, dzień i godziny klubu; Twój fotel po przyjęciu', () => {
    expect(v.strip).toEqual({ top: 'SP-AXA · sob 3 PAŹ · 10:00-12:00', sub: 'Przelot EPKK → EPRJ · Twój fotel: dowódca' });
  });

  it('oś: separatory dni, własne po prawej, „Odczytane" tylko pod ostatnią własną', () => {
    expect(v.items.map(line)).toEqual([
      '— Wczoraj —',
      '< | Cześć, dasz radę w sobotę rano? | 19:02',
      '> | own | Mogę, ale dopiero od 10. | 19:10',
      '< | Sprawdzę, czy SP-AXA jest wtedy wolna. | 19:12',
      '— Dziś —',
      '< | Przesunęłam na 10:00-12:00. | 07:31',
      '> | own | Dzięki, w takim razie przyjmuję. | 07:40 | Odczytane 07:41',
    ]);
  });

  it('stopka: pole ze zdaniem o koordynatorach (pkt 19)', () => {
    expect(v.footer).toEqual({ kind: 'composer', visibility: 'Rozmowę widzą też koordynatorzy lotów klubu.' });
  });
});

describe('29A - przed odpowiedzią (piątek 07:38)', () => {
  const v = threadVm({
    page: page({
      messages: rozmowaA.slice(0, 4),
      participants: [
        { pilotId: 'MZI', lastReadAt: local(-2, '19:11') },
        { pilotId: 'AKO', lastReadAt: local(-1, '07:32') },
      ],
    }),
    card: zlecenieA({ viewer: { leads: false, recipient: me({ seat: 'pic', direct: true }) } }),
    recipientId: 'AKO',
    viewerId: 'AKO',
    now: localMs(-1, '07:38'),
    nameOf,
    codeOf,
    regOf,
  })!;

  it('proponowany fotel, a odczyt tej samej doby co wiadomość - sama godzina', () => {
    expect(v.strip.sub).toBe('Przelot EPKK → EPRJ · proponowany fotel: dowódca');
    expect(v.items.map(line)[2]).toBe('> | own | Mogę, ale dopiero od 10. | 19:10 | Odczytane 19:11');
  });

  it('odczyt innej doby niż wiadomość dostaje dzień w napisie', () => {
    const later = threadVm({
      page: page({ messages: rozmowaA.slice(0, 2), participants: [{ pilotId: 'MZI', lastReadAt: local(-1, '07:30') }] }),
      card: zlecenieA({ viewer: { leads: false, recipient: me({ seat: 'pic', direct: true }) } }),
      recipientId: 'AKO',
      viewerId: 'AKO',
      now: localMs(-1, '07:38'),
      nameOf,
      codeOf,
      regOf,
    })!;
    expect(later.items.map(line)[2]).toBe('> | own | Mogę, ale dopiero od 10. | 19:10 | Odczytane 07:30');
    const twoDays = threadVm({
      page: page({ messages: rozmowaA.slice(0, 2), participants: [{ pilotId: 'MZI', lastReadAt: local(-1, '07:30') }] }),
      card: zlecenieA({ viewer: { leads: false, recipient: me({ seat: 'pic', direct: true }) } }),
      recipientId: 'AKO',
      viewerId: 'AKO',
      now: localMs(0, '08:00'),
      nameOf,
      codeOf,
      regOf,
    })!;
    expect(twoDays.items.map(line)[2]).toBe('> | own | Mogę, ale dopiero od 10. | 19:10 | Odczytane wczoraj 07:30');
  });

  it('odczyt starszy niż ostatnia własna wiadomość - bez „Odczytane"', () => {
    const unread = threadVm({
      page: page({ messages: rozmowaA.slice(0, 2), participants: [{ pilotId: 'MZI', lastReadAt: local(-2, '19:05') }] }),
      card: zlecenieA({ viewer: { leads: false, recipient: me({ seat: 'pic', direct: true }) } }),
      recipientId: 'AKO',
      viewerId: 'AKO',
      now: localMs(-1, '07:38'),
      nameOf,
      codeOf,
      regOf,
    })!;
    expect(unread.items.filter((i) => i.kind === 'message' && i.read != null)).toEqual([]);
  });
});

describe('29B - czytelnik (koordynator, piątek 08:05)', () => {
  const zlecenieB = card({
    order: order({ createdBy: 'MZI', audienceLabel: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2' }),
    viewer: { leads: true, recipient: null },
    recipients: [recipient('AKW', { answer: 'yes', threadId: 't-akw' })],
  });
  const v = threadVm({
    page: page({
      role: 'reader',
      closed: 'read_only',
      messages: [
        msg('n1', 'AKW', local(-2, '19:03'), 'Do której planowane są skoki?'),
        msg('n2', 'AKW', local(-2, '19:04'), 'W sobotę od 14 mam dyżur w Balicach.'),
        msg('n3', 'MZI', local(-2, '19:07'), 'Kończymy o 13:00.'),
        msg('n4', 'AKW', local(-2, '19:10'), 'Zgłaszam się na drugiego pilota.'),
        msg('n5', 'MZI', local(-1, '07:25'), 'Plan lotu wydłużony do 3:00.'),
      ],
      participants: [
        { pilotId: 'AKW', lastReadAt: local(-1, '07:40') },
        { pilotId: 'MZI', lastReadAt: local(-2, '19:10') },
      ],
    }),
    card: zlecenieB,
    recipientId: 'AKW',
    viewerId: 'PWL',
    now: localMs(-1, '08:05'),
    nameOf,
    codeOf,
    regOf,
  })!;

  it('nagłówek nazywa OBIE strony: adresat w tytule, autor w podtytule', () => {
    expect([v.role, v.header]).toEqual(['reader', { title: 'Anna Kowal', sub: 'rozmowa · Marta Zięba' }]);
  });

  it('pasek: na jaki fotel i przez jaką grupę zlecenie trafiło do adresata', () => {
    expect(v.strip).toEqual({ top: 'SP-ANA · sob 3 PAŹ · 09:00-13:00', sub: 'Skoki EPKP · drugi pilot · Piloci An-2' });
  });

  it('autor po prawej, nazwisko nad pierwszym dymkiem serii, żadnych „własnych"; odczyt drugiego uczestnika', () => {
    expect(v.items.map(line)).toEqual([
      '— Wczoraj —',
      '< | Anna Kowal AKW | Do której planowane są skoki? | 19:03',
      '< | W sobotę od 14 mam dyżur w Balicach. | 19:04',
      '> | Marta Zięba MZI | Kończymy o 13:00. | 19:07',
      '< | Anna Kowal AKW | Zgłaszam się na drugiego pilota. | 19:10',
      '— Dziś —',
      '> | Marta Zięba MZI | Plan lotu wydłużony do 3:00. | 07:25 | Odczytane 07:40',
    ]);
  });

  it('zdanie zamiast pola: kto prowadzi rozmowę i co wolno patrzącemu', () => {
    expect(v.footer.kind).toBe('readonly');
    expect(v.footer.kind === 'readonly' ? flat(v.footer.parts) : null).toBe('Rozmowę prowadzi [Marta Zięba] - możesz ją czytać.');
  });
});

describe('autor rozmowy i rozmowa po zamknięciu', () => {
  const zlecenieB = card({
    order: order({ createdBy: 'MZI', audienceLabel: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2' }),
    viewer: { leads: true, recipient: null },
    recipients: [recipient('AKW'), recipient('JWR', { seat: 'pic', direct: true, viaGroupId: null })],
  });

  it('autor: tytułem adresat z kodem, własne po prawej w odcieniu „własnych"', () => {
    const v = threadVm({
      page: page({ messages: [msg('k1', 'MZI', local(-1, '20:00'), 'Dasz radę?')] }),
      card: zlecenieB,
      recipientId: 'JWR',
      viewerId: 'MZI',
      now: localMs(-1, '20:05'),
      nameOf,
      codeOf,
      regOf,
    })!;
    expect([v.role, v.header, v.strip.sub]).toEqual(['author', { title: 'Jakub Wrona', sub: 'adresat · JWR' }, 'Skoki EPKP · dowódca · imiennie']);
    expect(v.items.map(line)).toEqual(['— Dziś —', '> | own | Dasz radę? | 20:00']);
  });

  it('zlecenie nieaktualne - zdanie zamiast pola, wszystko zostaje do czytania', () => {
    const v = threadVm({
      page: page({ closed: 'thread_closed', messages: [msg('k1', 'AKO', local(-1, '20:00'))] }),
      card: zlecenieA({ viewer: { leads: false, recipient: me({ seat: 'pic', inPlay: false, staleReason: 'seat_filled' }) } }),
      recipientId: 'AKO',
      viewerId: 'AKO',
      now: localMs(-1, '20:05'),
      nameOf,
      codeOf,
      regOf,
    })!;
    expect(v.footer.kind === 'readonly' ? flat(v.footer.parts) : null).toBe('Zlecenie jest nieaktualne - rozmowę możesz czytać.');
    // Fotela już nie ma - pasek mówi samo zlecenie.
    expect(v.strip.sub).toBe('Przelot EPKK → EPRJ');
  });
});
