/**
 * Wiersze listy zleceń - ten sam zestaw, co makieta `zlecenia-lista`: Marta Zięba
 * (koordynatorka) patrzy w piątek 2 października o 21:45 czasu klubu.
 *  - zlecenie B: skoki SP-ANA, dowódca imiennie Jan Wrona, drugi pilot z grupy „Piloci An-2";
 *  - zlecenie A: przelot SP-AXA, Adam Kowalski przyjął o 07:40;
 *  - cudze zlecenie Pawła Wilka: lot techniczny SP-BKL z kompletem załogi;
 *  - zlecenie instruktora: Adam Kowalski w fotelu dowódcy, drugi pilot imiennie do Ewy Sowy.
 */

import { describe, expect, it } from 'vitest';

import type { DirectoryDto, OrderListItemDto, OrderMeDto } from '../../api/dto';
import { inboxRows, managedRows, seatLines, type OrderRowContext } from './orderListRows';
import { orderLookups } from './orderLookups';

const TZ = 'Europe/Warsaw';
const NOW = Date.parse('2026-10-02T19:45:00Z'); // piątek 21:45 w klubie

const DIRECTORY: DirectoryDto = {
  members: [
    { id: 'mzi', code: 'MZI', name: 'Marta Zięba', active: true },
    { id: 'ako', code: 'AKO', name: 'Adam Kowalski', active: true },
    { id: 'jwr', code: 'JWR', name: 'Jan Wrona', active: true },
    { id: 'pwi', code: 'PWI', name: 'Paweł Wilk', active: true },
    { id: 'bno', code: 'BNO', name: 'Barbara Nowak', active: true },
    { id: 'eso', code: 'ESO', name: 'Ewa Sowa', active: true },
  ],
  aircraft: [
    { id: 'ana', reg: 'SP-ANA', type: 'AN-2', serviceStatus: 'active', dualRequired: false, mhFormat: 'hhmm' },
    { id: 'axa', reg: 'SP-AXA', type: 'C172', serviceStatus: 'active', dualRequired: false, mhFormat: 'hhmm' },
    { id: 'bkl', reg: 'SP-BKL', type: 'PA-28', serviceStatus: 'active', dualRequired: false, mhFormat: 'hhmm' },
  ],
};

const CTX: OrderRowContext = { lookups: orderLookups(DIRECTORY), viewerId: 'mzi', now: NOW, timezone: TZ };

interface Shape {
  id: string;
  aircraftId: string;
  startsAt: string;
  endsAt: string;
  operation: string;
  fromIcao: string | null;
  toIcao: string | null;
  createdBy?: string;
  status?: OrderListItemDto['order']['status'];
  seats?: OrderListItemDto['order']['seats'];
  addressing?: OrderListItemDto['order']['addressing'];
  audienceLabel?: string;
  closeReason?: string | null;
  pilotId?: string | null;
  dualId?: string | null;
  progress?: OrderListItemDto['progress'];
  me?: OrderMeDto | null;
  unread?: number;
}

function item(s: Shape): OrderListItemDto {
  return {
    day: { date: s.startsAt.slice(0, 10), startsAt: s.startsAt, endsAt: s.endsAt },
    order: {
      id: s.id,
      status: s.status ?? 'open',
      revision: 1,
      createdBy: s.createdBy ?? 'mzi',
      seats: s.seats ?? { pic: 'sought', dual: 'none' },
      addressing: s.addressing ?? 'per_seat',
      editedAt: null,
      createdAt: '2026-10-01T16:40:00Z',
      closedAt: null,
      closedBy: null,
      closeReason: s.closeReason ?? null,
      ...(s.audienceLabel == null ? {} : { audienceLabel: s.audienceLabel }),
    },
    booking: {
      id: `b-${s.id}`,
      aircraftId: s.aircraftId,
      status: 'confirmed',
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      operation: s.operation,
      fromIcao: s.fromIcao,
      toIcao: s.toIcao,
      plannedAirMin: null,
      plannedFuelL: null,
      note: null,
      pilotId: s.pilotId ?? null,
      dualId: s.dualId ?? null,
    },
    me: s.me ?? null,
    progress: s.progress ?? null,
    unread: s.unread ?? 0,
  };
}

const ORDER_B = item({
  id: 'B',
  aircraftId: 'ana',
  startsAt: '2026-10-03T07:00:00Z',
  endsAt: '2026-10-03T11:00:00Z',
  operation: 'skoki',
  fromIcao: 'EPKP',
  toIcao: 'EPKP',
  seats: { pic: 'sought', dual: 'sought' },
  audienceLabel: 'dowódca: Jan Wrona · drugi pilot: Piloci An-2',
  progress: { recipients: 6, seen: 5, volunteers: 2, single: null },
  unread: 1,
});

const ORDER_A = item({
  id: 'A',
  aircraftId: 'axa',
  startsAt: '2026-10-03T08:00:00Z',
  endsAt: '2026-10-03T10:00:00Z',
  operation: 'ferry',
  fromIcao: 'EPKK',
  toIcao: 'EPRJ',
  status: 'filled',
  audienceLabel: 'dowódca: Adam Kowalski',
  pilotId: 'ako',
  progress: {
    recipients: 1,
    seen: 1,
    volunteers: 0,
    single: { pilotId: 'ako', seen: true, answer: 'yes', answeredAt: '2026-10-02T05:40:00Z' },
  },
});

const ORDER_PAWEL = item({
  id: 'P',
  aircraftId: 'bkl',
  startsAt: '2026-10-03T12:00:00Z',
  endsAt: '2026-10-03T13:30:00Z',
  operation: 'techniczny',
  fromIcao: 'EPKK',
  toIcao: 'EPKK',
  status: 'filled',
  createdBy: 'pwi',
  audienceLabel: 'dowódca: Barbara Nowak',
  pilotId: 'bno',
  progress: {
    recipients: 1,
    seen: 1,
    volunteers: 0,
    single: { pilotId: 'bno', seen: true, answer: 'yes', answeredAt: '2026-10-02T14:20:00Z' },
  },
});

const ORDER_INSTRUCTOR = item({
  id: 'I',
  aircraftId: 'bkl',
  startsAt: '2026-10-04T08:00:00Z',
  endsAt: '2026-10-04T09:30:00Z',
  operation: 'ferry',
  fromIcao: 'EPKK',
  toIcao: 'EPKP',
  createdBy: 'ako',
  seats: { pic: 'self', dual: 'sought' },
  audienceLabel: 'drugi pilot: Ewa Sowa',
  pilotId: 'ako',
  progress: { recipients: 1, seen: 0, volunteers: 0, single: { pilotId: 'eso', seen: false, answer: null, answeredAt: null } },
});

/** Kształt zlecenia B bez identyfikatora - warianty niżej różnią się od niego jednym polem. */
const ORDER_B_SHAPE = {
  aircraftId: 'ana',
  startsAt: '2026-10-03T07:00:00Z',
  endsAt: '2026-10-03T11:00:00Z',
  operation: 'skoki',
  fromIcao: 'EPKP',
  toIcao: 'EPKP',
  seats: { pic: 'sought', dual: 'sought' },
  audienceLabel: 'dowódca: Jan Wrona · drugi pilot: Piloci An-2',
  progress: { recipients: 6, seen: 5, volunteers: 2, single: null },
} satisfies Omit<Shape, 'id'>;

describe('„Zlecone" - zlecenia oczami prowadzącego', () => {
  const rows = managedRows([ORDER_INSTRUCTOR, ORDER_PAWEL, ORDER_A, ORDER_B], 'upcoming', CTX);

  it('kolejność terminem - najbliższe na górze', () => {
    expect(rows.map((r) => r.key)).toEqual(['B', 'A', 'P', 'I']);
  });

  it('zlecenie B: fotele z etykiety, liczby odczytów i zielone „mogą lecieć", „Szuka załogi"', () => {
    const b = rows[0]!;
    expect(b).toMatchObject({
      termDay: 'sobota 3 PAŹ',
      termHours: '09:00 → 13:00',
      termRelative: 'jutro',
      reg: 'SP-ANA',
      aircraftType: 'AN-2',
      operation: 'Skoki',
      route: 'EPKP',
      seats: [
        { label: 'Dowódca', who: 'J. Wrona' },
        { label: 'Drugi pilot', who: 'Piloci An-2' },
      ],
      answers: { text: '5 z 6 odczytało', dim: false, volunteers: '2 mogą lecieć' },
      pill: { text: 'Szuka załogi', tone: 'blue' },
      author: { name: 'Ty', code: null },
      unread: true,
      muted: false,
    });
  });

  it('zlecenie A: obsadzony fotel pisze osobę w fotelu, odpowiedź z godziną przyjęcia', () => {
    expect(rows[1]).toMatchObject({
      route: 'EPKK → EPRJ',
      operation: 'Przelot',
      seats: [{ label: 'Dowódca', who: 'A. Kowalski' }],
      answers: { text: 'Przyjęte 07:40', dim: false, volunteers: null },
      pill: { text: 'Komplet załogi', tone: 'green' },
    });
  });

  it('cudze zlecenie mówi, kto zleca - nazwisko z kodem', () => {
    expect(rows[2]!.author).toEqual({ name: 'Paweł Wilk', code: 'PWI' });
    expect(rows[2]!.answers.text).toBe('Przyjęte 16:20');
  });

  it('zlecenie instruktora: fotel „Ja" pisze zlecającego, drugi - imiennie; „Nieodczytane" przygaszone', () => {
    expect(rows[3]).toMatchObject({
      termRelative: null,
      seats: [
        { label: 'Dowódca', who: 'A. Kowalski' },
        { label: 'Drugi pilot', who: 'E. Sowa' },
      ],
      answers: { text: 'Nieodczytane', dim: true, volunteers: null },
      pill: { text: 'Szuka drugiego pilota', tone: 'blue' },
      author: { name: 'Adam Kowalski', code: 'AKO' },
    });
  });

  it('odwołane przed terminem stoi NA KOŃCU, przygaszone, z powodem i kreską w odpowiedziach', () => {
    const cancelled = item({
      ...ORDER_B_SHAPE,
      id: 'X',
      startsAt: '2026-10-03T06:00:00Z',
      status: 'cancelled',
      closeReason: 'Maszyna idzie do serwisu.',
    });
    const list = managedRows([cancelled, ORDER_A], 'upcoming', CTX);
    expect(list.map((r) => r.key)).toEqual(['A', 'X']);
    expect(list[1]).toMatchObject({
      muted: true,
      pill: { text: 'Odwołane', tone: 'dim' },
      pillSub: '„Maszyna idzie do serwisu."',
      answers: { text: '—', dim: false, volunteers: null },
    });
  });

  it('minione: termin za nami, najnowsze pierwsze; wygasłe mówi „bez kompletu załogi"', () => {
    const expired = item({
      id: 'E',
      aircraftId: 'bkl',
      startsAt: '2026-10-01T14:00:00Z',
      endsAt: '2026-10-01T16:00:00Z',
      operation: 'ferry',
      fromIcao: 'EPKK',
      toIcao: 'EPRJ',
      status: 'expired',
      progress: { recipients: 1, seen: 1, volunteers: 0, single: { pilotId: 'jwr', seen: true, answer: null, answeredAt: null } },
    });
    const older = item({ ...ORDER_B_SHAPE, id: 'O', startsAt: '2026-09-30T07:00:00Z', endsAt: '2026-09-30T09:00:00Z' });
    const past = managedRows([older, expired, ORDER_A], 'past', CTX);
    expect(past.map((r) => r.key)).toEqual(['E', 'O']);
    expect(past[0]).toMatchObject({
      muted: false,
      pill: { text: 'Wygasło', tone: 'dim' },
      pillSub: 'bez kompletu załogi',
      answers: { text: 'Odczytane', dim: false, volunteers: null },
    });
    // Minione nie mówią „dziś/jutro" - termin za nami.
    expect(past[0]!.termRelative).toBeNull();
  });

  it('zgłoszenie jednej osoby: odczyt i zielone „może lecieć" z godziną', () => {
    const single = item({
      ...ORDER_B_SHAPE,
      id: 'S',
      progress: { recipients: 1, seen: 1, volunteers: 1, single: { pilotId: 'jwr', seen: true, answer: 'yes', answeredAt: '2026-10-02T19:52:00Z' } },
    });
    expect(managedRows([single], 'upcoming', CTX)[0]!.answers).toEqual({
      text: 'Odczytane',
      dim: false,
      volunteers: 'może lecieć 21:52',
    });
  });

  it('wspólna lista: szukany fotel bez osoby pisze „Wspólna lista"; fotel „brak" wiersza nie ma', () => {
    const shared = item({
      ...ORDER_B_SHAPE,
      id: 'W',
      addressing: 'shared',
      seats: { pic: 'sought', dual: 'sought' },
      audienceLabel: 'wspólna lista: Piloci An-2',
      pilotId: 'jwr',
    });
    expect(seatLines(shared, CTX)).toEqual([
      { label: 'Dowódca', who: 'J. Wrona' },
      { label: 'Drugi pilot', who: 'Wspólna lista' },
    ]);
    expect(seatLines(ORDER_A, CTX)).toEqual([{ label: 'Dowódca', who: 'A. Kowalski' }]);
  });
});

describe('„Do mnie" - zlecenia oczami adresata (Adam Kowalski)', () => {
  const ADAM: OrderRowContext = { ...CTX, viewerId: 'ako' };

  const me = (overrides: Partial<OrderMeDto>): OrderMeDto => ({
    seat: 'dual',
    namedSeat: null,
    direct: false,
    answer: null,
    answerReason: null,
    answeredAt: null,
    previousAnswer: null,
    previousAnswerAt: null,
    previousAnswerReason: null,
    seen: true,
    removed: false,
    removedAt: null,
    removeReason: null,
    inPlay: true,
    staleReason: null,
    assignedSeat: null,
    threadId: null,
    unread: 0,
    lastUnreadAt: null,
    ...overrides,
  });

  const forMe = (id: string, mine: OrderMeDto, extra: Partial<Shape> = {}): OrderListItemDto =>
    item({ ...ORDER_B_SHAPE, id, me: mine, ...extra });

  it('czeka na odpowiedź: błękit, fotel zaproponowany Tobie, kto zleca', () => {
    const [row] = inboxRows([forMe('B', me({}))], 'upcoming', ADAM);
    expect(row).toMatchObject({
      mySeat: 'Drugi pilot',
      author: { name: 'Marta Zięba', code: 'MZI' },
      pill: { text: 'Czeka na odpowiedź', tone: 'blue' },
      pillSub: null,
      href: null,
      muted: false,
    });
  });

  it('wspólna lista albo obie listy: „Termin do potwierdzenia" zamiast fotela', () => {
    expect(inboxRows([forMe('B', me({ seat: null }))], 'upcoming', ADAM)[0]!.mySeat).toBe('Termin do potwierdzenia');
  });

  it('lot już mój: „Przyjęte" przy fotelu imiennym, „Przydzielone" po przydziale - i wiersz otwiera rezerwację', () => {
    const accepted = inboxRows([forMe('A', me({ seat: 'pic', direct: true, assignedSeat: 'pic', answer: 'yes' }))], 'upcoming', ADAM)[0]!;
    expect(accepted).toMatchObject({
      mySeat: 'Dowódca',
      pill: { text: 'Przyjęte', tone: 'green' },
      pillSub: 'lot jest Twoją rezerwacją',
      href: '/kalendarz/b-A',
    });
    const assigned = inboxRows([forMe('B', me({ assignedSeat: 'dual', answer: 'yes' }))], 'upcoming', ADAM)[0]!;
    expect(assigned.pill).toEqual({ text: 'Przydzielone', tone: 'green' });
  });

  it('„Zgłoszone" i „Nie mogę" - neutralnie, zlecenie zostaje na liście', () => {
    const rows = inboxRows(
      [forMe('Y', me({ answer: 'yes' })), forMe('N', me({ answer: 'no' }), { startsAt: '2026-10-03T07:30:00Z' })],
      'upcoming',
      ADAM,
    );
    expect(rows.map((r) => r.pill)).toEqual([
      { text: 'Zgłoszone', tone: 'dim' },
      { text: 'Nie mogę', tone: 'dim' },
    ]);
  });

  it('nieaktualne na końcu, przygaszone - bez słowa, kto dostał fotel (pkt 18)', () => {
    const rows = inboxRows(
      [
        forMe('R', me({ inPlay: false, removed: true, staleReason: 'removed' }), { startsAt: '2026-10-03T06:00:00Z' }),
        forMe('D', me({ inPlay: false, staleReason: 'seat_dropped' }), { startsAt: '2026-10-03T06:30:00Z' }),
        forMe('B', me({})),
      ],
      'upcoming',
      ADAM,
    );
    expect(rows.map((r) => r.key)).toEqual(['B', 'R', 'D']);
    expect(rows[1]).toMatchObject({ muted: true, pill: { text: 'Nieaktualne', tone: 'dim' }, pillSub: 'Zlecenie cofnięte' });
    // Fotel zniesiony wygląda jak obsadzony (decyzja 2026-10-06).
    expect(rows[2]!.pillSub).toBe('Fotel obsadzony');
  });

  it('odwołane mówi „Odwołane" z powodem, także u adresata', () => {
    const [row] = inboxRows(
      [forMe('C', me({ inPlay: false, staleReason: 'closed' }), { status: 'cancelled', closeReason: 'Pogoda.' })],
      'upcoming',
      ADAM,
    );
    expect(row).toMatchObject({ pill: { text: 'Odwołane', tone: 'dim' }, pillSub: '„Pogoda."', muted: true });
  });
});
