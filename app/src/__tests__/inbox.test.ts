/**
 * Ninerdeck - testy SKRZYNKI (25, epik R-I).
 *
 * Pod obserwacją: „nowe" i „do decyzji" to dwa różne znaki z dwóch różnych źródeł,
 * termin pisze się czasem KLUBU z doby dołączonej do wiadomości, a rodzaj nieznany
 * temu wydaniu nie znika z listy.
 */

import type { RemoteNotification } from '../application';
import { agoLabel, inboxRows, termLabel, unreadIds } from '../ui/screens/logic/inbox';

const H = 3_600_000;
const NOW = Date.UTC(2026, 8, 24, 8, 0);

/** Sobota 26 września czasu klubu (UTC+2). */
const DAY = { date: '2026-09-26', startsAt: '2026-09-25T22:00:00Z', endsAt: '2026-09-26T22:00:00Z' };

function note(over: Partial<RemoteNotification> & { payload?: Record<string, unknown> } = {}): RemoteNotification {
  return {
    id: 'n1',
    kind: 'approval_requested',
    payload: {
      bookingId: 'b1',
      aircraftId: 'a1',
      pilotId: 'jwr',
      startsAt: '2026-09-26T07:00:00Z',
      endsAt: '2026-09-26T10:00:00Z',
      ...over.payload,
    },
    createdAt: new Date(NOW - 12 * 60_000).toISOString(),
    readAt: null,
    day: DAY,
    ...over,
    ...(over.payload == null ? {} : {}),
  };
}

const rows = (items: RemoteNotification[], todo: string[] = []) =>
  inboxRows({
    items,
    todoIds: new Set(todo),
    now: NOW,
    regOf: (id) => (id === 'a1' ? 'SP-AXA' : null),
    nameOf: (id) => ({ jwr: 'Jakub Wrona', akw: 'Anna Kowal' })[id] ?? null,
  });

describe('wiek wiadomości', () => {
  it('minuty, godziny, dni - i „przed chwilą" pod minutą', () => {
    expect(agoLabel(NOW - 20_000, NOW)).toBe('przed chwilą');
    expect(agoLabel(NOW - 12 * 60_000, NOW)).toBe('12 min temu');
    expect(agoLabel(NOW - 3 * H, NOW)).toBe('3 h temu');
    expect(agoLabel(NOW - 26 * H, NOW)).toBe('wczoraj');
    expect(agoLabel(NOW - 49 * H, NOW)).toBe('2 dni temu');
    expect(agoLabel(NOW - 5 * 24 * H, NOW)).toBe('5 dni temu');
  });
});

describe('termin czasem klubu', () => {
  it('liczy godziny odejmowaniem od granic doby, a bez doby milczy', () => {
    const day = { date: DAY.date, startsAt: Date.parse(DAY.startsAt), endsAt: Date.parse(DAY.endsAt) };
    expect(termLabel(day, Date.parse('2026-09-26T07:00:00Z'), Date.parse('2026-09-26T10:00:00Z'))).toBe(
      'sob 26 WRZ 09:00-12:00',
    );
    expect(termLabel(null, Date.parse('2026-09-26T07:00:00Z'), Date.parse('2026-09-26T10:00:00Z'))).toBeNull();
  });
});

describe('wiersze skrzynki', () => {
  it('prośba o zgodę: nazwisko rezerwującego, znak i termin, „do decyzji" TYLKO ze sprawą w kolejce', () => {
    const [czeka] = rows([note()], ['b1']);
    expect(czeka).toMatchObject({
      tone: 'ask',
      title: 'Jakub Wrona prosi o zgodę na lot',
      sub: 'SP-AXA · sob 26 WRZ 09:00-12:00',
      when: '12 min temu',
      isNew: true,
      todo: true,
      opens: 'decision',
    });
    // Ta sama wiadomość, sprawa już rozstrzygnięta: plakietka gaśnie, tapnięcie
    // prowadzi w kartę rezerwacji, nie w decyzję.
    const [po] = rows([note({ readAt: '2026-09-24T07:00:00Z' })]);
    expect(po).toMatchObject({ isNew: false, todo: false, opens: 'booking' });
  });

  it('odmowa niesie POWÓD i decydującego rzeczownikiem; zgoda i wygaśnięcie mają swoje zdania', () => {
    const [odmowa, zgoda, wygasla] = rows([
      note({ id: 'n2', kind: 'booking_rejected', payload: { decidedBy: 'akw', reason: 'Maszyna idzie na przegląd.' } }),
      note({ id: 'n3', kind: 'booking_approved' }),
      note({ id: 'n4', kind: 'booking_expired' }),
    ]);
    expect(odmowa).toMatchObject({ tone: 'no', title: 'Odmowa zgody · Anna Kowal', reason: 'Maszyna idzie na przegląd.', todo: false });
    expect(zgoda).toMatchObject({ tone: 'ok', title: 'Twoja rezerwacja jest zatwierdzona', reason: null });
    expect(wygasla).toMatchObject({ tone: 'warn', title: 'Termin minął, zanim ktokolwiek zdecydował' });
    expect(wygasla!.reason).toContain('złóż rezerwację jeszcze raz');
  });

  it('osoba poza cache’em nie daje surowego identyfikatora, a rodzaj nieznany nie znika', () => {
    const [bezNazwiska, obcy] = rows([
      note({ payload: { pilotId: 'ghost' } }),
      note({ id: 'n9', kind: 'booking_moved' }),
    ]);
    expect(bezNazwiska!.title).toBe('Prośba o zgodę na lot');
    expect(obcy).toMatchObject({ tone: 'info', title: 'Wiadomość z klubu', opens: 'booking' });
  });

  it('do przeczytania idą wyłącznie nieprzeczytane', () => {
    expect(unreadIds([note(), note({ id: 'n2', readAt: '2026-09-24T07:00:00Z' })])).toEqual(['n1']);
  });
});
