/**
 * Ninerdeck - testy SKRZYNKI (25, epik R-I).
 *
 * Pod obserwacją: „nowe" i „do decyzji" to dwa różne znaki z dwóch różnych źródeł,
 * termin pisze się czasem KLUBU z doby dołączonej do wiadomości, a rodzaj nieznany
 * temu wydaniu nie znika z listy.
 */

import type { RemoteNotification } from '../application';
import { agoLabel, inboxRows, lateNote, termLabel, unreadIds } from '../ui/screens/logic/inbox';

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
    mhFormatOf: (id) => (id === 'a1' ? 'hhmm' : null),
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

/** Termin z `note()` - pomocnik nadpisuje payload w całości, więc gałęzie o terminie podają go jawnie. */
const TERM = { bookingId: 'b1', aircraftId: 'a1', pilotId: 'jwr', startsAt: '2026-09-26T07:00:00Z', endsAt: '2026-09-26T10:00:00Z' };

describe('wiadomości o obserwowanej maszynie (3.2.0)', () => {
  it('„zbliża się lot" i „nie odebrano": tytuł rzeczownikiem ze znakiem, termin czasem klubu i nazwisko, kartę maszyny', () => {
    const [soon, notTaken] = rows([
      note({ kind: 'aircraft_flight_soon' }),
      note({ id: 'n2', kind: 'aircraft_not_taken' }),
    ]);
    expect(soon).toMatchObject({
      tone: 'news',
      title: 'Zbliża się lot · SP-AXA',
      sub: 'sob 26 WRZ 09:00-12:00 · Jakub Wrona',
      reason: null,
      aircraftId: 'a1',
      opens: 'aircraft',
      todo: false,
    });
    expect(notTaken).toMatchObject({
      tone: 'warn',
      title: 'Nie odebrano · SP-AXA',
      reason: 'Maszyna stała godzinę bez przejęcia - termin wrócił do puli.',
      opens: 'aircraft',
    });
  });

  it('„uruchomienie": CZAS Z REJESTRU w UTC, zadanie, „poza planem" bursztynem i „zapis dotarł" przy zwłoce', () => {
    const [late, planned] = rows([
      note({
        kind: 'aircraft_engine_started',
        day: null,
        createdAt: '2026-09-24T09:40:00Z',
        payload: { sessionUuid: 's1', aircraftId: 'a1', pilotId: 'jwr', at: '2026-09-24T08:12:00Z', operation: 'skoki', planned: false, bookingId: null },
      }),
      note({
        id: 'n2',
        kind: 'aircraft_engine_started',
        day: null,
        createdAt: '2026-09-24T08:13:00Z',
        payload: { sessionUuid: 's1', aircraftId: 'a1', pilotId: 'jwr', at: '2026-09-24T08:12:00Z', operation: null, planned: true, bookingId: 'b1' },
      }),
    ]);
    expect(late).toMatchObject({
      tone: 'news',
      title: 'Uruchomienie · SP-AXA',
      sub: '08:12 UTC · Jakub Wrona · skoki',
      lead: { text: 'Poza planem', tone: 'amber' },
      reason: ' - na tę godzinę nie było rezerwacji.',
      late: 'zapis dotarł 09:40 UTC',
      opens: 'aircraft',
    });
    expect(planned).toMatchObject({ sub: '08:12 UTC · Jakub Wrona', lead: { text: 'Zgodnie z planem', tone: 'green' }, late: null });
  });

  it('„zdana": blok i loty w podpisie, odczyty zielenią z licznikiem w formacie maszyny; z panelu - powód bez odczytów', () => {
    const base = { sessionUuid: 's1', aircraftId: 'a1', pilotId: 'jwr', dualId: null, at: '2026-09-23T16:40:00Z', engineStartAt: '2026-09-23T14:58:00Z', engineStopAt: '2026-09-23T16:40:00Z', blockMs: 102 * 60_000, flights: 1 };
    const [pilot, noFlight, admin] = rows([
      note({ kind: 'aircraft_released', day: null, createdAt: '2026-09-23T16:41:00Z', payload: { ...base, fuelEndL: 128, mhEnd: 1234.8, noFlightReason: null, closedBy: 'pilot', reason: null } }),
      note({ id: 'n2', kind: 'aircraft_released', day: null, createdAt: '2026-09-23T16:41:00Z', payload: { ...base, flights: 0, blockMs: 0, fuelEndL: 150, mhEnd: 1234.5, noFlightReason: 'weather', closedBy: 'pilot', reason: null } }),
      note({ id: 'n3', kind: 'aircraft_released', day: null, createdAt: '2026-09-19T15:30:00Z', payload: { ...base, at: '2026-09-19T15:30:00Z', fuelEndL: null, mhEnd: null, noFlightReason: null, closedBy: 'admin', reason: 'pilot zapomniał zdać, maszyna stoi w hangarze' } }),
    ]);
    expect(pilot).toMatchObject({
      tone: 'ok',
      title: 'Zdana · SP-AXA',
      sub: '16:40 UTC · Jakub Wrona · blok 1:42 · 1 lot',
      lead: { text: 'Paliwo 128 L', tone: 'green' },
      reason: ' · licznik 1234:48',
      late: null,
      opens: 'aircraft',
    });
    expect(noFlight!.reason).toBe('Zdana bez lotu - pogoda. Paliwo 150 L · licznik 1234:30');
    expect(admin).toMatchObject({
      tone: 'warn',
      sub: '15:30 UTC · zakończył administrator',
      lead: null,
      reason: 'Bez odczytów - „pilot zapomniał zdać, maszyna stoi w hangarze".',
    });
  });

  it('„odwołany lot": ile przed startem, po przypomnieniu; przesunięcie nazywa nowy termin', () => {
    const [cancelled, moved] = rows([
      note({ kind: 'aircraft_flight_cancelled', createdAt: '2026-09-26T06:20:00Z', payload: { ...TERM, movedTo: null } }),
      note({
        id: 'n2',
        kind: 'aircraft_flight_cancelled',
        createdAt: '2026-09-26T06:20:00Z',
        payload: { ...TERM, movedTo: { startsAt: '2026-09-27T07:00:00Z', endsAt: '2026-09-27T09:00:00Z' } },
      }),
    ]);
    expect(cancelled).toMatchObject({
      tone: 'warn',
      title: 'Odwołany lot · SP-AXA',
      sub: 'sob 26 WRZ 09:00-12:00 · Jakub Wrona',
      reason: 'Odwołany 40 min przed startem - po przypomnieniu.',
      opens: 'aircraft',
    });
    expect(moved!.reason).toBe('Przesunięty 40 min przed startem - nowy termin nd 27 WRZ 09:00-11:00, po przypomnieniu.');
  });

  it('dopisek o zwłoce pada dopiero ponad kwadrans; maszyna poza cache’em dostaje słowo, nie identyfikator', () => {
    const at = Date.parse('2026-09-24T08:12:00Z');
    expect(lateNote(at, at + 14 * 60_000)).toBeNull();
    expect(lateNote(at, at + 16 * 60_000)).toBe('zapis dotarł 08:28 UTC');
    expect(lateNote(null, at)).toBeNull();
    const [row] = rows([note({ kind: 'aircraft_flight_soon', payload: { aircraftId: 'ghost' } })]);
    expect(row!.title).toBe('Zbliża się lot · ghost');
  });

  it('przeczytane liczą się jak dotąd', () => {
    expect(unreadIds([note(), note({ id: 'n2', readAt: '2026-09-24T07:00:00Z' })])).toEqual(['n1']);
  });
});
