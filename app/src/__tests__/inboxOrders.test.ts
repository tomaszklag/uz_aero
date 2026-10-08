/**
 * Ninerdeck - testy WIADOMOŚCI ZLECEŃ W SKRZYNCE (25D, 4.0.0, epik Z-C #247).
 *
 * Pod obserwacją: tytuł rzeczownikiem ze znakiem maszyny, nazwisko w mianowniku za
 * separatorem, para „było → jest" z przekreśleniem, „Do odpowiedzi" z listy „Do mnie"
 * (nie z wiadomości), zdanie „Odpowiedz na nowy termin" wyłącznie tam, gdzie mówi o nim
 * serwer, i cel tapnięcia - ta sama mapa, co budzik.
 */

import type { RemoteNotification } from '../application';
import { inboxRows, type InboxPart, type InboxRowVm } from '../ui/screens/logic/inbox';

const NOW = Date.UTC(2026, 9, 3, 5, 36);

/** Sobota 3 października czasu klubu (UTC+2). */
const DAY = { date: '2026-10-03', startsAt: '2026-10-02T22:00:00Z', endsAt: '2026-10-03T22:00:00Z' };

/** Termin 10:00-12:00 czasu klubu. */
const TERM = { startsAt: '2026-10-03T08:00:00Z', endsAt: '2026-10-03T10:00:00Z' };

function note(kind: string, payload: Record<string, unknown> = {}, over: Partial<RemoteNotification> = {}): RemoteNotification {
  return {
    id: 'n1',
    kind,
    payload: {
      orderId: 'o-1',
      bookingId: 'b-1',
      aircraftId: 'a1',
      operation: 'ferry',
      fromIcao: 'EPKK',
      toIcao: 'EPRJ',
      createdBy: 'mzi',
      ...TERM,
      ...payload,
    },
    createdAt: new Date(NOW - 5 * 60_000).toISOString(),
    readAt: null,
    day: DAY,
    ...over,
  };
}

const row = (n: RemoteNotification, answerIds: string[] = []): InboxRowVm =>
  inboxRows({
    items: [n],
    todoIds: new Set(),
    answerIds: new Set(answerIds),
    now: NOW,
    regOf: (id) => (id === 'a1' ? 'SP-AXA' : null),
    nameOf: (id) => ({ mzi: 'Marta Zięba', ews: 'Ewa Sowa', pwi: 'Paweł Wilk', ako: 'Adam Kowalski' })[id] ?? null,
  })[0]!;

const text = (parts: readonly InboxPart[] | null | undefined): string => (parts ?? []).map((p) => p.text).join('');
const marked = (parts: readonly InboxPart[] | null | undefined, mark: 'strong' | 'strike'): string[] =>
  (parts ?? []).filter((p) => p[mark] === true).map((p) => p.text);

describe('zlecenie lotu (adresat)', () => {
  it('tytuł ze znakiem, termin w podpisie, osoba zlecająca i fotel, o który pytamy', () => {
    const r = row(note('order_offered', { seat: 'dual', reminder: false }));
    expect(r.title).toBe('Zlecenie lotu · SP-AXA');
    expect(r.sub).toBe('sob 3 PAŹ 10:00-12:00');
    expect(text(r.parts)).toBe('Marta Zięba · proponowany fotel: drugi pilot.');
    expect(marked(r.parts, 'strong')).toEqual(['Marta Zięba']);
    expect(r.tone).toBe('ask');
    expect(r.glyph).toBe('order');
    expect(r).toMatchObject({ opens: 'order', orderId: 'o-1' });
  });

  it('„Do odpowiedzi" stoi z LISTY „Do mnie" - także na przeczytanym wierszu, i gaśnie z odpowiedzią', () => {
    const read = note('order_offered', { seat: 'dual' }, { readAt: new Date(NOW).toISOString() });
    expect(row(read, ['o-1'])).toMatchObject({ todo: true, todoLabel: 'Do odpowiedzi', isNew: false });
    expect(row(read).todo).toBe(false);
  });

  it('bez fotela - termin do potwierdzenia; przypomnienie mówi, że prośba nie jest nowa', () => {
    expect(text(row(note('order_offered', { seat: null })).parts)).toBe('Marta Zięba · termin do potwierdzenia.');
    expect(text(row(note('order_offered', { seat: 'pic', reminder: true })).parts)).toBe(
      'Marta Zięba · proponowany fotel: dowódca. Zlecenie czeka na Twoją odpowiedź.',
    );
  });

  it('osoba zlecająca poza pamięcią klubu: zdanie bez nazwiska, z wielkiej litery - nigdy identyfikator', () => {
    const r = row(note('order_offered', { seat: 'dual', createdBy: 'ktos-spoza' }));
    expect(text(r.parts)).toBe('Proponowany fotel: drugi pilot.');
  });

  it('maszyna poza pamięcią floty: „samolot", a nie surowy identyfikator z panelu', () => {
    expect(row(note('order_offered', { seat: 'dual', aircraftId: 'uuid-7c1e' })).title).toBe('Zlecenie lotu · samolot');
  });
});

describe('zmiana zlecenia', () => {
  const moved = {
    term: true,
    changes: {
      term: {
        from: { startsAt: '2026-10-03T07:00:00Z', endsAt: '2026-10-03T09:00:00Z' },
        to: { startsAt: TERM.startsAt, endsAt: TERM.endsAt },
      },
    },
  };

  it('termin: stary przekreślony, nowy pogrubiony; podpis - dzień, zadanie i trasa (25D, 25E)', () => {
    const r = row(note('order_changed', { ...moved, respond: true }), ['o-1']);
    expect(r.title).toBe('Zlecenie zmienione · SP-AXA');
    expect(r.sub).toBe('sob 3 PAŹ · przelot EPKK → EPRJ');
    expect(text(r.parts)).toBe('Termin 09:00-11:00 → 10:00-12:00. Odpowiedz na nowy termin.');
    expect(marked(r.parts, 'strike')).toEqual(['09:00-11:00']);
    expect(marked(r.parts, 'strong')).toEqual(['10:00-12:00']);
    expect(r).toMatchObject({ tone: 'warn', glyph: 'clock', todo: true, todoLabel: 'Do odpowiedzi' });
  });

  it('„Odpowiedz na nowy termin" tylko, gdy mówi o tym serwer - nie u przydzielonego ani u autora', () => {
    expect(text(row(note('order_changed', { ...moved, respond: false })).parts)).toBe('Termin 09:00-11:00 → 10:00-12:00.');
  });

  it('termin przeniesiony na inny dzień: godziny niosą dzień, inaczej lot „zostałby" w sobotę', () => {
    const r = row(
      note('order_changed', {
        term: true,
        respond: true,
        changes: {
          term: {
            from: { startsAt: '2026-10-02T07:00:00Z', endsAt: '2026-10-02T09:00:00Z' },
            to: { startsAt: TERM.startsAt, endsAt: TERM.endsAt },
          },
        },
      }),
    );
    expect(marked(r.parts, 'strike')).toEqual(['pt 2 PAŹ 09:00-11:00']);
    expect(marked(r.parts, 'strong')).toEqual(['sob 3 PAŹ 10:00-12:00']);
  });

  it('edycja inna niż termin: CO zmieniono, bez nazwiska i BEZ plakietki sprawy (§5.2, pkt 31)', () => {
    const r = row(
      note('order_changed', { term: false, respond: false, changes: { plannedAirMin: { from: 120, to: 180 }, note: { from: null, to: 'x' } } }),
      ['o-1'],
    );
    expect(r.title).toBe('Zlecenie edytowane · SP-AXA');
    expect(r.sub).toBe('sob 3 PAŹ 10:00-12:00');
    expect(text(r.parts)).toBe('Plan lotu 2:00 → 3:00 · nowy opis.');
    expect(marked(r.parts, 'strike')).toEqual(['2:00']);
    expect(r).toMatchObject({ tone: 'info', glyph: 'edit', todo: false });
  });
});

describe('wiadomości autora', () => {
  it('odpowiedź „może lecieć" zielenią, z fotelem w podpisie', () => {
    const r = row(note('order_answered', { pilotId: 'ews', answer: 'yes', reason: null, assignedSeat: null, seat: 'dual' }));
    expect(r.title).toBe('Odpowiedź na zlecenie · SP-AXA');
    expect(r.sub).toBe('sob 3 PAŹ 10:00-12:00 · drugi pilot');
    expect(text(r.parts)).toBe('Ewa Sowa · może lecieć');
    expect(r.parts?.find((p) => p.tone === 'ok')?.text).toBe('może lecieć');
    expect(r).toMatchObject({ tone: 'ok', glyph: 'person-ok' });
  });

  it('przyjęcie imienne obsadza fotel; odmowa bez koloru, z powodem w cudzysłowie (słowa jak w panelu)', () => {
    expect(text(row(note('order_answered', { pilotId: 'ews', answer: 'yes', assignedSeat: 'pic', seat: 'pic' })).parts)).toBe(
      'Ewa Sowa · przyjęte - fotel obsadzony',
    );
    const no = row(note('order_answered', { pilotId: 'ews', answer: 'no', reason: 'Dyżur', assignedSeat: null, seat: 'dual' }));
    expect(text(no.parts)).toBe('Ewa Sowa · nie może - „Dyżur"');
    expect(no).toMatchObject({ tone: 'info', glyph: 'person-off' });
  });

  it('rezygnacja: fotel wraca do szukania - bursztyn, bo coś przepadło', () => {
    const r = row(note('order_withdrawn', { pilotId: 'ews', seat: 'dual', reason: null }));
    expect(r.title).toBe('Rezygnacja z lotu · SP-AXA');
    expect(text(r.parts)).toBe('Ewa Sowa · fotel znów jest do obsadzenia');
    expect(r).toMatchObject({ tone: 'warn', glyph: 'resign' });
  });

  it('brak kompletu mówi, KOGO brakuje i co się stanie - bez skrótów do czynności', () => {
    expect(text(row(note('order_unfilled', { openSeats: ['dual'] })).parts)).toBe(
      'Brakuje drugiego pilota. Jeśli do początku terminu nikt się nie znajdzie, zlecenie wygaśnie, a termin się zwolni.',
    );
    expect(text(row(note('order_unfilled', { openSeats: ['pic', 'dual'] })).parts)).toContain('Brakuje dowódcy i drugiego pilota.');
    expect(text(row(note('order_unfilled', { openSeats: [] })).parts)).toContain('Załoga nie jest kompletna.');
  });

  it('wygaśnięcie zrobił zegar - bez nazwiska i bez koloru', () => {
    const r = row(note('order_expired'));
    expect(r).toMatchObject({ title: 'Zlecenie wygasło · SP-AXA', tone: 'info', glyph: 'expired' });
    expect(text(r.parts)).toBe('Do początku terminu nie zebrała się cała załoga - termin się zwolnił.');
  });
});

describe('los zlecenia u adresata', () => {
  it('przydział: lot jest Twoją rezerwacją', () => {
    expect(text(row(note('order_assigned', { seat: 'dual' })).parts)).toBe('Drugi pilot · lot jest Twoją rezerwacją.');
  });

  it('nieaktualne - BEZ nazwiska osoby, która dostała fotel (pkt 18); odebrane - z powodem', () => {
    expect(text(row(note('order_filled', { reason: 'seat_filled' })).parts)).toBe('Fotel jest już obsadzony.');
    expect(text(row(note('order_filled', { reason: 'seat_dropped' })).parts)).toBe('Fotel nie jest już potrzebny.');
    expect(row(note('order_filled', { reason: 'seat_filled' })).title).toBe('Zlecenie nieaktualne · SP-AXA');
    expect(text(row(note('order_removed', { reason: 'Jednak Tomek' })).parts)).toBe('Zlecenie nie jest już do Ciebie - „Jednak Tomek".');
    expect(text(row(note('order_removed', { reason: null })).parts)).toBe('Zlecenie nie jest już do Ciebie.');
  });

  it('cofnięty przydział i odwołanie - powód jest treścią wiadomości', () => {
    expect(text(row(note('order_unassigned', { seat: 'dual', reason: null })).parts)).toBe('Lot nie jest już Twoją rezerwacją.');
    const cancelled = row(note('order_cancelled', { cancelledBy: 'pwi', reason: 'Przegląd 50 h' }));
    expect(text(cancelled.parts)).toBe('Paweł Wilk · „Przegląd 50 h"');
    expect(cancelled.tone).toBe('no');
    // Bez powodu linia treści niesie samo nazwisko (25D).
    expect(text(row(note('order_cancelled', { cancelledBy: 'pwi', reason: null })).parts)).toBe('Paweł Wilk');
  });
});

describe('rozmowa w zleceniu', () => {
  const message = note('order_message', { recipientId: 'ako', authorId: 'mzi', unread: 1, preview: 'Przesunęłam na 10:00-12:00.' });

  it('ostatnia wiadomość z nazwiskiem, licznik w błękicie - i tapnięcie od razu w rozmowę', () => {
    const r = row(message);
    expect(r.title).toBe('Wiadomość w zleceniu · SP-AXA');
    expect(text(r.parts)).toBe('Marta Zięba · „Przesunęłam na 10:00-12:00."');
    expect(r).toMatchObject({ count: '1 nowa wiadomość', tone: 'news', glyph: 'message' });
    expect(r).toMatchObject({ opens: 'thread', orderId: 'o-1', recipientId: 'ako' });
  });

  it('licznik świeci, póki wiersz jest nowy - przeczytany mówi samą wiadomość', () => {
    expect(row({ ...message, readAt: new Date(NOW).toISOString() }).count).toBeNull();
    expect(row(note('order_message', { recipientId: 'ako', authorId: 'mzi', unread: 3 })).count).toBe('3 nowe wiadomości');
  });
});

describe('rodzaj zlecenia nieznany temu wydaniu', () => {
  it('nie znika - dostaje tytuł ogólny', () => {
    expect(row(note('order_cos_nowego')).title).toBe('Wiadomość z klubu');
  });
});
