/**
 * Rozmowa w zleceniu - zestaw z makiety `zlecenia-watek` (ZL4, ZL4a, ZL4b): Marta Zięba
 * zleca przelot SP-AXA, sobota 3 października 10:00-12:00, Adamowi Kowalskiemu imiennie
 * na dowódcę. Rozmawiają w piątek wieczorem i w sobotę rano; Adam przyjął o 07:40.
 * Patrzymy w sobotę o 08:00 czasu klubu (Warszawa, UTC+2).
 */

import { describe, expect, it } from 'vitest';

import type { OrderCardDto, OrderLeaderRecipientDto, OrderMeDto, ThreadMessageDto, ThreadPageDto } from '../../api/dto';
import type { Person } from '../calendar/bookingLabels';
import { threadVm, type ThreadInput } from './orderThread';

const NOW = Date.parse('2026-10-03T06:00:00Z');

const PEOPLE: Record<string, Person> = {
  mzi: { name: 'Marta Zięba', code: 'MZI' },
  ako: { name: 'Adam Kowalski', code: 'AKO' },
  kor: { name: 'Jan Bąk', code: 'JBA' },
};

const msg = (id: string, authorId: string, at: string, body = `wiadomość ${id}`): ThreadMessageDto => ({
  id,
  authorId,
  body,
  createdAt: at,
});

/** Od najnowszej, jak przychodzi z serwera. */
const MESSAGES: ThreadMessageDto[] = [
  msg('m5', 'ako', '2026-10-03T05:40:00Z', 'Dzięki, w takim razie przyjmuję.'),
  msg('m4', 'mzi', '2026-10-03T05:31:00Z', 'Przesunęłam na 10:00-12:00 - nowy termin jest już w zleceniu.'),
  msg('m3', 'mzi', '2026-10-02T17:12:00Z', 'Sprawdzę, czy SP-AXA jest wtedy wolna.'),
  msg('m2', 'ako', '2026-10-02T17:10:00Z', 'Mogę, ale dopiero od 10. Da się przesunąć na 10-12?'),
  msg('m1', 'mzi', '2026-10-02T17:02:00Z', 'Cześć, dasz radę w sobotę rano? Części trzeba odebrać przed południem.'),
];

function page(over: Partial<Omit<ThreadPageDto, 'next'>> = {}): Omit<ThreadPageDto, 'next'> {
  return {
    role: 'participant',
    closed: null,
    threadId: 't1',
    participants: [
      { pilotId: 'mzi', lastReadAt: '2026-10-03T05:41:00Z' },
      { pilotId: 'ako', lastReadAt: '2026-10-03T05:40:00Z' },
    ],
    messages: MESSAGES,
    ...over,
  };
}

const me = (over: Partial<OrderMeDto> = {}): OrderMeDto => ({
  seat: 'pic',
  namedSeat: null,
  direct: true,
  answer: 'yes',
  answerReason: null,
  answeredAt: '2026-10-03T05:40:00Z',
  previousAnswer: null,
  previousAnswerAt: null,
  previousAnswerReason: null,
  seen: true,
  removed: false,
  removedAt: null,
  removeReason: null,
  inPlay: true,
  staleReason: null,
  assignedSeat: 'pic',
  threadId: 't1',
  unread: 0,
  lastUnreadAt: null,
  ...over,
});

const adam = (over: Partial<OrderLeaderRecipientDto> = {}): OrderLeaderRecipientDto => ({
  pilotId: 'ako',
  seat: 'pic',
  namedSeat: null,
  direct: true,
  viaGroupId: null,
  answer: 'yes',
  previousAnswer: null,
  answerReason: null,
  answeredAt: '2026-10-03T05:40:00Z',
  seen: true,
  seenAt: '2026-10-02T17:05:00Z',
  lastSeenAt: '2026-10-03T05:39:00Z',
  editUnseen: false,
  inPlay: true,
  staleReason: null,
  assignedSeat: 'pic',
  removed: false,
  removedAt: null,
  conflict: null,
  threadId: 't1',
  unread: 0,
  ...over,
});

function card(over: Partial<OrderCardDto> = {}, order: Partial<OrderCardDto['order']> = {}): OrderCardDto {
  return {
    timezone: 'Europe/Warsaw',
    day: { date: '2026-10-03', startsAt: '2026-10-02T22:00:00Z', endsAt: '2026-10-03T22:00:00Z' },
    order: {
      id: 'A',
      status: 'open',
      revision: 2,
      createdBy: 'mzi',
      seats: { pic: 'sought', dual: 'none' },
      addressing: 'per_seat',
      editedAt: null,
      createdAt: '2026-10-02T16:40:00Z',
      closedAt: null,
      closedBy: null,
      closeReason: null,
      ...order,
    },
    booking: {
      id: 'b-A',
      aircraftId: 'axa',
      status: 'confirmed',
      startsAt: '2026-10-03T08:00:00Z',
      endsAt: '2026-10-03T10:00:00Z',
      operation: 'ferry',
      fromIcao: 'EPKK',
      toIcao: 'EPRJ',
      plannedAirMin: 90,
      plannedFuelL: 120,
      note: null,
      pilotId: 'ako',
      dualId: null,
    },
    viewer: { leads: false, recipient: null },
    lastEdit: null,
    lastTermChange: null,
    myConflicts: [],
    recipients: null,
    history: null,
    ...over,
  };
}

const input = (over: Partial<ThreadInput>): ThreadInput => ({
  page: page(),
  card: card(),
  recipientId: 'ako',
  viewerId: 'ako',
  now: NOW,
  period: 'upcoming',
  person: (id) => PEOPLE[id] ?? null,
  aircraft: (id) => (id === 'axa' ? { reg: 'SP-AXA', type: 'C172' } : null),
  ...over,
});

const messages = (items: ReturnType<typeof threadVm>) =>
  (items?.items ?? []).map((item) => (item.kind === 'day' ? `— ${item.label} —` : `${item.side} ${item.time}${item.read == null ? '' : ` · ${item.read}`}`));

describe('ZL4 - adresat pisze z osobą zlecającą', () => {
  const vm = threadVm(input({ card: card({ viewer: { leads: false, recipient: me() } }) }))!;

  it('tytułem jest rozmówca: osoba zlecająca z kodem', () => {
    expect(vm.role).toBe('recipient');
    expect(vm.title).toBe('Marta Zięba');
    expect(vm.sub).toEqual({ label: 'zleca', code: 'MZI' });
    expect(vm.label).toBe('Rozmowa · Marta Zięba');
  });

  it('pasek zlecenia: termin czasem klubu, „Twój fotel" - i prowadzi do rezerwacji, bo lot jest już mój', () => {
    expect(vm.strip).toEqual({
      top: 'SP-AXA · sob 3 PAŹ · 10:00 → 12:00',
      sub: 'Przelot EPKK → EPRJ · Twój fotel: dowódca',
      href: '/kalendarz/b-A',
    });
  });

  it('od najstarszej, z separatorami dnia; „Odczytane" wyłącznie pod ostatnią własną', () => {
    expect(messages(vm)).toEqual([
      '— Wczoraj —',
      'in 19:02',
      'out 19:10',
      'in 19:12',
      '— Dziś —',
      'in 07:31',
      'out 07:40 · Odczytane 07:41',
    ]);
    // U uczestnika nazwiska nad dymkami nie ma - położenie mówi, kto pisze.
    expect(vm.items.some((i) => i.kind === 'message' && i.who != null)).toBe(false);
  });

  it('pole wiadomości ze zdaniem o tym, kto jeszcze czyta', () => {
    expect(vm.footer).toEqual({ kind: 'composer', note: 'Rozmowę widzą też koordynatorzy lotów klubu.', to: 'Marta Zięba' });
  });

  it('odczyt zapisuje się na najnowszej wiadomości drugiej strony', () => {
    expect(vm.readMark).toBe('m4');
  });

  it('zlecenie przed odpowiedzią: pasek prowadzi do karty zlecenia nad „Do mnie"', () => {
    const before = threadVm(
      input({ card: card({ viewer: { leads: false, recipient: me({ answer: null, assignedSeat: null }) } }), period: 'past' }),
    )!;
    expect(before.strip.sub).toBe('Przelot EPKK → EPRJ · proponowany fotel: dowódca');
    expect(before.strip.href).toBe('/zlecenia/A?widok=do-mnie&okres=minione');
    const shared = threadVm(input({ card: card({ viewer: { leads: false, recipient: me({ answer: null, assignedSeat: null, seat: null }) } }) }))!;
    expect(shared.strip.sub).toBe('Przelot EPKK → EPRJ · termin do potwierdzenia');
  });
});

describe('autor pisze z adresatem', () => {
  const vm = threadVm(
    input({ viewerId: 'mzi', card: card({ viewer: { leads: true, recipient: null }, recipients: [adam()] }, { audienceLabel: 'dowódca: Adam Kowalski' }) }),
  )!;

  it('tytułem jest adresat; pasek mówi, na jaki fotel i jak zlecenie do niego trafiło', () => {
    expect(vm.role).toBe('author');
    expect(vm.title).toBe('Adam Kowalski');
    expect(vm.sub).toEqual({ label: 'adresat', code: 'AKO' });
    expect(vm.strip.sub).toBe('Przelot EPKK → EPRJ · dowódca · imiennie');
    expect(vm.strip.href).toBe('/zlecenia/A?widok=zlecone');
  });

  it('własne po prawej, „Odczytane" pod ostatnią własną - odczyt adresata', () => {
    expect(messages(vm)).toEqual([
      '— Wczoraj —',
      'out 19:02',
      'in 19:10',
      'out 19:12',
      '— Dziś —',
      'out 07:31 · Odczytane 07:40',
      'in 07:40',
    ]);
    expect(vm.readMark).toBe('m5');
  });

  it('grupa i wspólna lista - nazwa z etykiety adresowania', () => {
    const group = threadVm(
      input({
        viewerId: 'mzi',
        card: card(
          { viewer: { leads: true, recipient: null }, recipients: [adam({ direct: false, viaGroupId: 'g1', seat: 'dual', assignedSeat: null })] },
          { audienceLabel: 'dowódca: Jakub Wrona · drugi pilot: Piloci An-2' },
        ),
      }),
    )!;
    expect(group.strip.sub).toBe('Przelot EPKK → EPRJ · drugi pilot · Piloci An-2');
    const shared = threadVm(
      input({
        viewerId: 'mzi',
        card: card(
          { viewer: { leads: true, recipient: null }, recipients: [adam({ direct: false, seat: null, assignedSeat: null })] },
          { addressing: 'shared', audienceLabel: 'wspólna lista: Piloci An-2' },
        ),
      }),
    )!;
    expect(shared.strip.sub).toBe('Przelot EPKK → EPRJ · wspólna lista · Piloci An-2');
  });

  it('odczyt innej doby niesie ją w napisie', () => {
    const vm2 = threadVm(
      input({
        viewerId: 'mzi',
        card: card({ viewer: { leads: true, recipient: null }, recipients: [adam()] }),
        page: page({
          messages: [msg('m1', 'mzi', '2026-10-02T17:02:00Z')],
          participants: [{ pilotId: 'ako', lastReadAt: '2026-10-03T05:00:00Z' }],
        }),
      }),
    )!;
    expect(messages(vm2)).toEqual(['— Wczoraj —', 'out 19:02 · Odczytane dziś 07:00']);
  });

  it('odczyt sprzed ostatniej własnej - „Odczytane" nie świeci', () => {
    const vm2 = threadVm(
      input({
        viewerId: 'mzi',
        card: card({ viewer: { leads: true, recipient: null }, recipients: [adam()] }),
        page: page({ participants: [{ pilotId: 'ako', lastReadAt: '2026-10-03T05:20:00Z' }] }),
      }),
    )!;
    expect(vm2.items.some((i) => i.kind === 'message' && i.read != null)).toBe(false);
  });

  it('rozmowa bez wiadomości od drugiej strony: odczyt na pustym znaku; bez wiadomości - nic do odczytu', () => {
    const own = threadVm(input({ viewerId: 'mzi', page: page({ messages: [msg('m1', 'mzi', '2026-10-02T17:02:00Z')] }) }))!;
    expect(own.readMark).toBe('');
    const empty = threadVm(input({ viewerId: 'mzi', page: page({ messages: [], threadId: null }) }))!;
    expect(empty.readMark).toBeNull();
    expect(empty.items).toEqual([]);
  });
});

describe('ZL4a - koordynator czyta cudzą rozmowę', () => {
  const vm = threadVm(
    input({
      viewerId: 'kor',
      page: page({ role: 'reader', closed: 'read_only' }),
      card: card({ viewer: { leads: true, recipient: null }, recipients: [adam()] }),
    }),
  )!;

  it('tytułem jest adresat, a pasek nazywa osobę zlecającą', () => {
    expect(vm.role).toBe('reader');
    expect(vm.title).toBe('Adam Kowalski');
    expect(vm.sub).toEqual({ label: 'adresat', code: 'AKO' });
    expect(vm.label).toBe('Rozmowa w zleceniu · Adam Kowalski');
    expect(vm.strip.sub).toBe('Przelot EPKK → EPRJ · zleca Marta Zięba');
    expect(vm.strip.href).toBe('/zlecenia/A?widok=zlecone');
  });

  it('autor po prawej, nazwisko nad pierwszym dymkiem serii; „Odczytane" pod ostatnią', () => {
    expect(messages(vm)).toEqual([
      '— Wczoraj —',
      'out 19:02',
      'in 19:10',
      'out 19:12',
      '— Dziś —',
      'out 07:31',
      'in 07:40 · Odczytane 07:41',
    ]);
    const who = vm.items.flatMap((i) => (i.kind === 'message' ? [i.who] : []));
    expect(who).toEqual(['Marta Zięba', 'Adam Kowalski', 'Marta Zięba', 'Marta Zięba', 'Adam Kowalski']);
  });

  it('seria tego samego autora w jednej dobie - nazwisko raz', () => {
    const series = threadVm(
      input({
        viewerId: 'kor',
        page: page({
          role: 'reader',
          messages: [msg('b', 'mzi', '2026-10-03T05:32:00Z'), msg('a', 'mzi', '2026-10-03T05:31:00Z')],
        }),
      }),
    )!;
    expect(series.items.flatMap((i) => (i.kind === 'message' ? [i.who] : []))).toEqual(['Marta Zięba', null]);
  });

  it('w miejscu pola - kto prowadzi rozmowę; odczytu koordynatora się nie zapisuje', () => {
    expect(vm.footer).toEqual({ kind: 'readonly', tone: 'reader', text: 'Rozmowę prowadzi Marta Zięba.' });
    expect(vm.readMark).toBeNull();
  });
});

describe('ZL4b - rozmowa do odczytu', () => {
  it('adresat po odebraniu zlecenia - jedno zdanie, bez nazwiska i bez innych adresatów', () => {
    const vm = threadVm(
      input({
        page: page({ closed: 'thread_closed' }),
        card: card({ viewer: { leads: false, recipient: me({ inPlay: false, staleReason: 'removed', assignedSeat: null }) } }),
      }),
    )!;
    expect(vm.footer).toEqual({
      kind: 'readonly',
      tone: 'closed',
      text: 'Zlecenie nie jest już dla Ciebie aktualne - rozmowa zostaje do odczytu.',
    });
    // Nieaktualne zlecenie nie ma fotela do nazwania; pasek prowadzi do karty zlecenia.
    expect(vm.strip.sub).toBe('Przelot EPKK → EPRJ');
    expect(vm.strip.href).toBe('/zlecenia/A?widok=do-mnie');
  });

  it('autor: zlecenie zamknięte albo nieaktualne dla tej osoby', () => {
    const closed = threadVm(input({ viewerId: 'mzi', page: page({ closed: 'thread_closed' }), card: card({}, { status: 'cancelled' }) }))!;
    expect(closed.footer).toEqual({ kind: 'readonly', tone: 'closed', text: 'Zlecenie jest zamknięte - rozmowa zostaje do odczytu.' });
    const removed = threadVm(input({ viewerId: 'mzi', page: page({ closed: 'thread_closed' }) }))!;
    expect(removed.footer).toEqual({
      kind: 'readonly',
      tone: 'closed',
      text: 'Zlecenie nie jest już aktualne dla tej osoby - rozmowa zostaje do odczytu.',
    });
  });

  it('termin nie do przeczytania - widoku nie ma', () => {
    expect(threadVm(input({ card: { ...card(), booking: { ...card().booking, startsAt: 'x' } } }))).toBeNull();
  });
});
