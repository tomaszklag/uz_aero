/**
 * Ninerdeck - ŚWIAT TESTOWY ZLECEŃ NA LOT (epik Z-C #247): ten sam piątek i ta sama
 * sobota, co makiety Z-A (`design/28*`, `30`, `32*`).
 *
 * Klub w strefie Europe/Warsaw (październik - UTC+2). Sobota 3 października 2026 to doba
 * klubu od `2026-10-02T22:00Z` do `2026-10-03T22:00Z`; „teraz" leży zwykle w piątek
 * wieczorem. Zlecenie B: skoki SP-ANA 09:00-13:00, dowódca imiennie (Jakub Wrona), drugi
 * pilot z grupy „Piloci An-2"; zlecenie A: przelot SP-AXA. Zleca Marta Zięba.
 *
 * Moduł pomocniczy, nie test - każdy plik testów składa z niego tylko to, czego potrzebuje.
 */

import type {
  RemoteOrder,
  RemoteOrderBooking,
  RemoteOrderCard,
  RemoteOrderMe,
  RemoteOrderRecipient,
} from '../../application';

/** Doba klubu „sobota 3 października". */
export const SATURDAY = { date: '2026-10-03', startsAt: '2026-10-02T22:00:00.000Z', endsAt: '2026-10-03T22:00:00.000Z' };

const SATURDAY_MIDNIGHT = Date.parse(SATURDAY.startsAt);

/** Chwila czasem klubu: `local(-1, '21:48')` = piątek 21:48 w Warszawie, jako ISO. */
export function local(dayOffset: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(SATURDAY_MIDNIGHT + dayOffset * 86_400_000 + (h! * 60 + m!) * 60_000).toISOString();
}

/** To samo w milisekundach - „teraz" testu. */
export function localMs(dayOffset: number, hhmm: string): number {
  return Date.parse(local(dayOffset, hhmm));
}

export const PEOPLE: Readonly<Record<string, { name: string; code: string }>> = {
  AKO: { name: 'Adam Kowalski', code: 'AKO' },
  MZI: { name: 'Marta Zięba', code: 'MZI' },
  JWR: { name: 'Jakub Wrona', code: 'JWR' },
  AKW: { name: 'Anna Kowal', code: 'AKW' },
  BNO: { name: 'Barbara Nowak', code: 'BNO' },
  ESO: { name: 'Ewa Sowa', code: 'ESO' },
  PLI: { name: 'Piotr Lis', code: 'PLI' },
  PWL: { name: 'Paweł Wilk', code: 'PWL' },
};

export const nameOf = (id: string): string | null => PEOPLE[id]?.name ?? null;
export const codeOf = (id: string): string | null => PEOPLE[id]?.code ?? null;

const FLEET: Readonly<Record<string, { reg: string; type: string }>> = {
  'ac-ana': { reg: 'SP-ANA', type: 'An-2' },
  'ac-axa': { reg: 'SP-AXA', type: 'Cessna 172' },
  'ac-bkl': { reg: 'SP-BKL', type: 'Cessna 152' },
};

export const regOf = (id: string): string | null => FLEET[id]?.reg ?? null;
export const aircraftOf = (id: string): { reg: string; type: string } | null => FLEET[id] ?? null;

const AIRFIELDS: Readonly<Record<string, string>> = {
  EPKP: 'Kraków-Pobiednik Wielki',
  EPKK: 'Kraków-Balice',
  EPRJ: 'Rzeszów-Jasionka',
};

export const airfieldName = (icao: string): string | null => AIRFIELDS[icao] ?? null;

export function order(over: Partial<RemoteOrder> = {}): RemoteOrder {
  return {
    id: 'o-b',
    status: 'open',
    revision: 1,
    createdBy: 'MZI',
    seats: { pic: 'sought', dual: 'sought' },
    addressing: 'per_seat',
    editedAt: null,
    createdAt: local(-1, '18:40'),
    closedAt: null,
    closedBy: null,
    closeReason: null,
    ...over,
  };
}

export function booking(over: Partial<RemoteOrderBooking> = {}): RemoteOrderBooking {
  return {
    id: 'b-b',
    aircraftId: 'ac-ana',
    status: 'confirmed',
    startsAt: local(0, '09:00'),
    endsAt: local(0, '13:00'),
    operation: 'skoki',
    fromIcao: 'EPKP',
    toIcao: 'EPKP',
    plannedAirMin: 180,
    plannedFuelL: 600,
    note: 'Sobotni dzień skokowy - dwa wyloty przed południem, grupa kursowa AFF.',
    pilotId: null,
    dualId: null,
    ...over,
  };
}

export function me(over: Partial<RemoteOrderMe> = {}): RemoteOrderMe {
  return {
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
    ...over,
  };
}

export function recipient(pilotId: string, over: Partial<RemoteOrderRecipient> = {}): RemoteOrderRecipient {
  return {
    pilotId,
    seat: 'dual',
    namedSeat: null,
    direct: false,
    viaGroupId: 'g-an2',
    answer: null,
    previousAnswer: null,
    answerReason: null,
    answeredAt: null,
    seen: false,
    seenAt: null,
    lastSeenAt: null,
    editUnseen: false,
    inPlay: true,
    staleReason: null,
    assignedSeat: null,
    removed: false,
    removedAt: null,
    conflict: null,
    threadId: null,
    unread: 0,
    ...over,
  };
}

export function card(over: Partial<RemoteOrderCard> = {}): RemoteOrderCard {
  return {
    timezone: 'Europe/Warsaw',
    day: SATURDAY,
    order: order(),
    booking: booking(),
    viewer: { leads: false, recipient: me() },
    lastEdit: null,
    lastTermChange: null,
    myConflicts: [],
    recipients: null,
    history: null,
    ...over,
  };
}
