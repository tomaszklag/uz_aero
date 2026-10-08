import { describe, expect, it } from 'vitest';

import type { InboxItemDto } from '../../api/dto';
import {
  inboxPending,
  inboxRows,
  notSentYet,
  unreadIdsOf,
  whenLabel,
  type InboxRowsInput,
  type Segment,
} from './inboxRows';

const TZ = 'Europe/Warsaw';
/** Środa 30 września 2026, 21:30 czasu klubu (19:30 UTC). */
const NOW = Date.UTC(2026, 8, 30, 19, 30);

const NAMES: Record<string, string> = { BNO: 'Barbara Nowak', PLI: 'Piotr Lis', JBA: 'Jan Bąk', AKO: 'Adam Kowalski' };
const REGS: Record<string, string> = { a1: 'SP-ANA', a2: 'SP-DKM' };

function input(items: InboxItemDto[], over: Partial<InboxRowsInput> = {}): InboxRowsInput {
  return {
    items,
    timezone: TZ,
    now: NOW,
    nameOf: (id) => NAMES[id] ?? null,
    regOf: (id) => REGS[id] ?? null,
    mhFormatOf: () => 'hhmm',
    todoIds: new Set(),
    freshIds: new Set(),
    canOpen: { fleet: true, decisions: true },
    ...over,
  };
}

const item = (kind: string, payload: Record<string, unknown>, over: Partial<InboxItemDto> = {}): InboxItemDto => ({
  id: `n-${kind}`,
  kind,
  payload,
  createdAt: new Date(NOW - 60_000).toISOString(),
  readAt: null,
  day: null,
  ...over,
});

const text = (segments: readonly Segment[]): string => segments.map((s) => s.text).join('');

/** Sobota 3 października 09:00-13:00 czasu klubu. */
const TERM = { startsAt: '2026-10-03T07:00:00.000Z', endsAt: '2026-10-03T11:00:00.000Z' };

describe('wiersz skrzynki panelu', () => {
  it('odpowiedź na zlecenie: tytuł ze znakiem, termin klubu, kto i co', () => {
    const [row] = inboxRows(
      input([item('order_answered', { aircraftId: 'a1', ...TERM, pilotId: 'BNO', answer: 'yes', seat: 'dual', assignedSeat: null })]),
    );
    expect(row).toMatchObject({ tone: 'ok', icon: 'person-check', title: 'Odpowiedź na zlecenie · SP-ANA', isNew: true, href: null });
    expect(text(row!.sub)).toBe('sobota 3 PAŹ · 09:00 → 13:00 · drugi pilot');
    expect(row!.sub[1]).toEqual({ text: '09:00 → 13:00', style: 'mono' });
    expect(text(row!.text)).toBe('Barbara Nowak · może lecieć');
    expect(row!.text[0]).toEqual({ text: 'Barbara Nowak', style: 'b' });
  });

  it('odmowa na zlecenie ma ton neutralny i powód w cudzysłowie', () => {
    const [row] = inboxRows(
      input([item('order_answered', { aircraftId: 'a1', ...TERM, pilotId: 'PLI', answer: 'no', reason: 'W sobotę mam egzamin w Mielcu.' })]),
    );
    expect(row).toMatchObject({ tone: 'plain', icon: 'person-x' });
    expect(text(row!.text)).toBe('Piotr Lis · nie może - „W sobotę mam egzamin w Mielcu."');
  });

  it('prośba o zgodę na MOIM kroku: „Do decyzji" i kolejka decyzji; bez kroku - szuflada rezerwacji', () => {
    const request = item('approval_requested', { bookingId: 'b1', aircraftId: 'a2', ...TERM, pilotId: 'PLI' });
    const [mine] = inboxRows(input([request], { todoIds: new Set(['b1']) }));
    expect(mine).toMatchObject({
      tone: 'ask',
      icon: 'clock',
      title: 'Piotr Lis prosi o zgodę na lot',
      pill: { text: 'Do decyzji', tone: 'green' },
      href: '/kalendarz/decyzje',
    });
    expect(text(mine!.sub)).toBe('SP-DKM · sobota 3 PAŹ · 09:00 → 13:00');

    const [other] = inboxRows(input([request]));
    expect(other).toMatchObject({ pill: null, href: '/kalendarz/b1' });
  });

  it('rezerwacja odwołana (§12.9): rzeczownik z odwołującym, powód jako treść; bez powodu - skutek', () => {
    const [byClub] = inboxRows(
      input([item('booking_cancelled', { bookingId: 'b1', aircraftId: 'a2', ...TERM, pilotId: 'PLI', reason: 'Wymiana opony.', cancelledBy: 'JBA' })]),
    );
    expect(byClub).toMatchObject({ tone: 'no', icon: 'cross', title: 'Rezerwacja odwołana · Jan Bąk', href: '/kalendarz/b1' });
    expect(text(byClub!.sub)).toBe('SP-DKM · sobota 3 PAŹ · 09:00 → 13:00');
    expect(text(byClub!.text)).toBe('Wymiana opony.');

    const [own] = inboxRows(
      input([item('booking_cancelled', { bookingId: 'b2', aircraftId: 'a2', ...TERM, pilotId: 'PLI', reason: null, cancelledBy: 'ghost' })]),
    );
    expect(own!.title).toBe('Rezerwacja odwołana');
    expect(text(own!.text)).toBe('Termin się zwolnił.');
  });

  it('zdana maszyna: chwila z rejestru w UTC, blok i loty, odczyty w formacie licznika maszyny', () => {
    const [row] = inboxRows(
      input([
        item('aircraft_released', {
          aircraftId: 'a2',
          at: new Date(Date.UTC(2026, 8, 30, 17, 5)).toISOString(),
          pilotId: 'JBA',
          blockMs: 72 * 60_000,
          flights: 2,
          fuelEndL: 64,
          mhEnd: 2118.5,
        }),
      ]),
    );
    expect(row).toMatchObject({ tone: 'ok', icon: 'check', title: 'Zdana · SP-DKM', href: '/samoloty/a2' });
    expect(text(row!.sub)).toBe('dziś 17:05 UTC · Jan Bąk · blok 1:12 · 2 loty');
    expect(text(row!.text)).toBe('Paliwo 64 L · licznik 2118:30');
  });

  it('karta samolotu tylko z dostępem do modułu Samoloty', () => {
    const [row] = inboxRows(
      input([item('aircraft_not_taken', { aircraftId: 'a2', ...TERM, pilotId: 'JBA' })], { canOpen: { fleet: false, decisions: false } }),
    );
    expect(row).toMatchObject({ title: 'Nie odebrano · SP-DKM', href: null });
  });

  it('zlecenie edytowane: stara wartość przekreślona, nowa pogrubiona', () => {
    const [row] = inboxRows(
      input([item('order_changed', { aircraftId: 'a1', ...TERM, term: false, changes: { plannedAirMin: { from: 120, to: 180 } } })]),
    );
    expect(row).toMatchObject({ tone: 'plain', icon: 'pencil', title: 'Zlecenie edytowane · SP-ANA' });
    expect(row!.text).toEqual([
      { text: 'Plan lotu ' },
      { text: '2:00', style: 's' },
      { text: ' → ' },
      { text: '3:00', style: 'b' },
    ]);
  });

  it('zmiana terminu zlecenia: „było → jest" i prośba o ponowną odpowiedź', () => {
    const changes = {
      term: {
        from: { startsAt: '2026-10-03T07:00:00.000Z', endsAt: '2026-10-03T09:00:00.000Z' },
        to: { startsAt: '2026-10-03T08:00:00.000Z', endsAt: '2026-10-03T10:00:00.000Z' },
      },
    };
    const [row] = inboxRows(input([item('order_changed', { aircraftId: 'a1', ...TERM, term: true, changes })]));
    expect(row!.title).toBe('Zlecenie zmienione · SP-ANA');
    expect(text(row!.text)).toBe('Termin 09:00-11:00 → 10:00-12:00. Odpowiedz na nowy termin.');
  });

  it('rozmowa: autor pogrubiony, ostatnia wiadomość cytatem i plakietka z liczbą nowych', () => {
    const [row] = inboxRows(
      input([item('order_message', { aircraftId: 'a1', ...TERM, authorId: 'BNO', unread: 2, preview: 'Mogę od 10.' })]),
    );
    expect(row).toMatchObject({ tone: 'ask', icon: 'chat', pill: { text: '2 nowe wiadomości', tone: 'blue' } });
    expect(text(row!.text)).toBe('Barbara Nowak · „Mogę od 10."');
  });

  it('rozmowa: licznik świeci, póki wiersz jest nowy', () => {
    const [row] = inboxRows(
      input([item('order_message', { aircraftId: 'a1', ...TERM, authorId: 'BNO', unread: 2 }, { readAt: new Date(NOW).toISOString() })]),
    );
    expect(row?.pill).toBeNull();
  });

  it('rozmowa prowadzi do szuflady rozmowy - nad połową listy tego, kto czyta', () => {
    const order = { orderId: 'o1', bookingId: 'b1', aircraftId: 'a1', ...TERM };
    const hrefs = inboxRows(
      input([
        // pisał adresat - czyta autor
        item('order_message', { ...order, recipientId: 'BNO', authorId: 'BNO', unread: 1 }),
        // pisał autor - czyta adresat
        item('order_message', { ...order, recipientId: 'BNO', authorId: 'MZI', unread: 1 }),
        // wiadomość bez wskazania rozmowy - wiersz nie jest linkiem
        item('order_message', { ...order, authorId: 'MZI', unread: 1 }),
      ]),
    ).map((row) => row.href);
    expect(hrefs).toEqual(['/zlecenia/o1/rozmowa/BNO?widok=zlecone', '/zlecenia/o1/rozmowa/BNO?widok=do-mnie', null]);
  });

  it('zlecenie otwiera się nad połową listy, z której perspektywy mówi wiadomość', () => {
    const order = { orderId: 'o1', bookingId: 'b1', aircraftId: 'a1', ...TERM };
    const hrefs = inboxRows(
      input([
        item('order_offered', order),
        item('order_changed', { ...order, term: true, changes: {} }),
        item('order_filled', order),
        item('order_removed', order),
        item('order_unassigned', order),
        item('order_cancelled', order),
        item('order_answered', { ...order, pilotId: 'BNO', answer: 'yes' }),
        item('order_withdrawn', { ...order, pilotId: 'BNO' }),
        item('order_unfilled', { ...order, openSeats: ['dual'] }),
        item('order_expired', order),
        item('order_assigned', { ...order, seat: 'pic' }),
      ]),
    ).map((row) => row.href);
    expect(hrefs).toEqual([
      // do adresata
      '/zlecenia/o1?widok=do-mnie',
      '/zlecenia/o1?widok=do-mnie',
      '/zlecenia/o1?widok=do-mnie',
      '/zlecenia/o1?widok=do-mnie',
      '/zlecenia/o1?widok=do-mnie',
      '/zlecenia/o1?widok=do-mnie',
      // do prowadzącego
      '/zlecenia/o1?widok=zlecone',
      '/zlecenia/o1?widok=zlecone',
      '/zlecenia/o1?widok=zlecone',
      '/zlecenia/o1?widok=zlecone',
      // lot już mój - rezerwacja w kalendarzu (§14.3)
      '/kalendarz/b1',
    ]);
  });

  it('brak kompletu: brakujące fotele w dopełniaczu', () => {
    const [row] = inboxRows(input([item('order_unfilled', { aircraftId: 'a1', ...TERM, openSeats: ['dual'] })]));
    expect(text(row!.text)).toBe(
      'Brakuje drugiego pilota. Jeśli do początku terminu nikt się nie znajdzie, zlecenie wygaśnie, a termin się zwolni.',
    );
  });

  it('przeczytana wiadomość nie jest nowa - chyba że była nowa w chwili otwarcia skrzynki', () => {
    const read = item('booking_approved', { bookingId: 'b2', aircraftId: 'a2', ...TERM }, { readAt: new Date(NOW).toISOString() });
    expect(inboxRows(input([read]))[0]!.isNew).toBe(false);
    expect(inboxRows(input([read], { freshIds: new Set([read.id]) }))[0]!.isNew).toBe(true);
  });

  it('rodzaj nieznany temu wydaniu nie znika: tytuł ogólny i szuflada rezerwacji', () => {
    const [row] = inboxRows(input([item('cos_nowego', { bookingId: 'b3', aircraftId: 'a2', ...TERM })]));
    expect(row).toMatchObject({ title: 'Wiadomość z klubu', icon: 'info', href: '/kalendarz/b3' });
  });

  it('nazwisko i znak spoza słownika - zdanie ogólne zamiast identyfikatora', () => {
    const [row] = inboxRows(input([item('approval_requested', { bookingId: 'b1', aircraftId: 'x', ...TERM, pilotId: 'X' })]));
    expect(row!.title).toBe('Prośba o zgodę na lot');
    expect(text(row!.sub)).toBe('sobota 3 PAŹ · 09:00 → 13:00');
  });

  it('do przeczytania przy otwarciu - wyłącznie nieprzeczytane', () => {
    expect(
      unreadIdsOf([
        item('a', {}, { id: 'n1' }),
        item('b', {}, { id: 'n2', readAt: new Date(NOW).toISOString() }),
      ]),
    ).toEqual(['n1']);
  });

  it('każda wiadomość przeczytuje się RAZ na wizytę', () => {
    // Drugi przebieg efektu (StrictMode) i odczyt w locie, który przyniósł stan sprzed
    // przeczytania, widzą te same nieprzeczytane - wysłanych nie wysyłamy drugi raz.
    expect(notSentYet(['n1', 'n3'], new Set())).toEqual(['n1', 'n3']);
    expect(notSentYet(['n1', 'n3'], new Set(['n1', 'n3']))).toEqual([]);
    expect(notSentYet(['n1', 'n3', 'n4'], new Set(['n1', 'n3']))).toEqual(['n4']);
  });
});

describe('plamki szuflady', () => {
  const loaded = { inbox: false, directory: false, queue: false, canDecide: true };

  it('czeka na skrzynkę, słownik i kolejkę - bez nich zdanie przeskoczyłoby z ogólnego na pełne', () => {
    expect(inboxPending(loaded)).toBe(false);
    expect(inboxPending({ ...loaded, inbox: true })).toBe(true);
    expect(inboxPending({ ...loaded, directory: true })).toBe(true);
    expect(inboxPending({ ...loaded, queue: true })).toBe(true);
  });

  it('kolejka wyłączona nie trzyma plamek - zapytanie bez prawa czeka bez końca', () => {
    expect(inboxPending({ ...loaded, queue: true, canDecide: false })).toBe(false);
  });
});

describe('kiedy przyszła wiadomość', () => {
  it('minuty, potem „dziś" i „wczoraj" dobą klubu, dalej data', () => {
    expect(whenLabel(NOW - 20_000, NOW, TZ)).toBe('przed chwilą');
    expect(whenLabel(NOW - 39 * 60_000, NOW, TZ)).toBe('39 min temu');
    expect(whenLabel(Date.UTC(2026, 8, 30, 18, 12), NOW, TZ)).toBe('dziś 20:12');
    expect(whenLabel(Date.UTC(2026, 8, 29, 17, 48), NOW, TZ)).toBe('wczoraj 19:48');
    expect(whenLabel(Date.UTC(2026, 8, 28, 12, 2), NOW, TZ)).toBe('28 WRZ 14:02');
  });
});
