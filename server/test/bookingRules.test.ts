/**
 * Ninerdeck (serwer) - REGUŁY REZERWACJI (`domain/bookings.ts`, issue #158 B3).
 *
 * Czyste funkcje, więc test jest czystą tabelą przypadków - bez bazy i bez Fastify.
 * Nakładania terminów tu NIE MA i nie może być: tego pilnuje ograniczenie bazy
 * (`schema.test.ts`, blok „zajętość maszyny"), bo funkcja czysta nie zna reszty
 * kalendarza.
 */

import { describe, expect, it } from 'vitest';

import {
  SLOT_HOLDING_STATUSES,
  canTransition,
  holdsSlot,
  refuseCancel,
  refuseChange,
  refuseCreate,
  refuseWindow,
  type BookingStatus,
  type BookingSubject,
} from '../src/domain/bookings.ts';

const NOW = Date.parse('2026-10-01T09:00:00Z');
const H = 3_600_000;

const PILOT = { pilotId: 'tmk', manages: false };
const OBCY = { pilotId: 'ako', manages: false };
const ADMIN = { pilotId: 'ako', manages: true };

function booking(over: Partial<BookingSubject> = {}): BookingSubject {
  return {
    kind: 'flight',
    status: 'confirmed',
    pilotId: 'tmk',
    endsAt: NOW + 4 * H,
    ...over,
  };
}

describe('rezerwacja: stany i przejścia', () => {
  it('slot trzymają DOKŁADNIE `pending` i `confirmed`', () => {
    const wszystkie: BookingStatus[] = [
      'pending',
      'confirmed',
      'rejected',
      'cancelled',
      'fulfilled',
      'released',
    ];
    expect(wszystkie.filter(holdsSlot)).toEqual([...SLOT_HOLDING_STATUSES]);
  });

  it('stany końcowe nie prowadzą nigdzie - także `fulfilled`', () => {
    // Odwołanie rezerwacji po locie nie odwołałoby lotu, więc nie ma takiego przejścia.
    for (const from of ['rejected', 'cancelled', 'fulfilled', 'released'] as BookingStatus[]) {
      for (const to of ['pending', 'confirmed', 'cancelled', 'fulfilled'] as BookingStatus[]) {
        expect(canTransition(from, to), `${from} → ${to}`).toBe(false);
      }
    }
  });

  it('czynna rezerwacja idzie do realizacji, odwołania albo zwolnienia', () => {
    expect(canTransition('confirmed', 'fulfilled')).toBe(true);
    expect(canTransition('confirmed', 'cancelled')).toBe(true);
    expect(canTransition('confirmed', 'released')).toBe(true);
    // `pending` nie przeskakuje od razu do realizacji - najpierw zgoda (3.1.0).
    expect(canTransition('pending', 'fulfilled')).toBe(false);
    expect(canTransition('pending', 'confirmed')).toBe(true);
  });
});

describe('rezerwacja: termin', () => {
  it('koniec równy początkowi nie jest terminem', () => {
    expect(refuseWindow({ startsAt: NOW + H, endsAt: NOW + H }, NOW)).toBe('booking_order');
    expect(refuseWindow({ startsAt: NOW + 2 * H, endsAt: NOW + H }, NOW)).toBe('booking_order');
  });

  it('TERMIN, KTÓRY JUŻ SIĘ ZACZĄŁ, PRZECHODZI - odrzucamy dopiero ten, który minął', () => {
    // Pilot bierze maszynę teraz i wpisuje, do której godziny ją trzyma. Reguła
    // postawiona na początku terminu odrzucałaby ten całkiem sensowny wpis.
    expect(refuseWindow({ startsAt: NOW - H, endsAt: NOW + H }, NOW)).toBeNull();
    expect(refuseWindow({ startsAt: NOW - 3 * H, endsAt: NOW - H }, NOW)).toBe('booking_in_past');
  });

  it('wartości nieliczbowe odbijają się jak zła kolejność', () => {
    expect(refuseWindow({ startsAt: Number.NaN, endsAt: NOW + H }, NOW)).toBe('booking_order');
  });

  it('maszyna poza służbą odbija się PRZED sprawdzeniem terminu', () => {
    // Kolejność ma znaczenie: „ten samolot nie lata" jest odpowiedzią, po której nie
    // ma sensu poprawiać godzin.
    const zle = { startsAt: NOW + 2 * H, endsAt: NOW + H, kind: 'flight' as const };
    expect(refuseCreate(zle, NOW, { serviceStatus: 'disabled' })).toBe('aircraft_disabled');
    expect(refuseCreate(zle, NOW, { serviceStatus: null })).toBe('aircraft_not_found');
    expect(refuseCreate(zle, NOW, { serviceStatus: 'active' })).toBe('booking_order');
  });
});

describe('rezerwacja: kto może zmieniać czyj wpis', () => {
  it('właściciel przesuwa swoją, obcy nie', () => {
    expect(refuseChange(booking(), PILOT, NOW)).toBeNull();
    expect(refuseChange(booking(), OBCY, NOW)).toBe('not_your_booking');
    expect(refuseChange(booking(), ADMIN, NOW)).toBeNull();
  });

  it('WYŁĄCZENIA Z UŻYTKU NIE RUSZA NAWET TEN, KTO JE WPISAŁ', () => {
    // To jest stan MASZYNY, nie czyjś plan - własność wpisu nie daje tu praw.
    const blok = booking({ kind: 'block', pilotId: null });
    expect(refuseChange(blok, PILOT, NOW)).toBe('not_your_booking');
    expect(refuseChange(blok, ADMIN, NOW)).toBeNull();
  });

  it('zamkniętej i minionej nie da się zmienić', () => {
    expect(refuseChange(booking({ status: 'cancelled' }), PILOT, NOW)).toBe('booking_closed');
    expect(refuseChange(booking({ status: 'released' }), PILOT, NOW)).toBe('booking_closed');
    expect(refuseChange(booking({ endsAt: NOW - H }), PILOT, NOW)).toBe('booking_in_past');
  });

  it('cudzość wygrywa z wiekiem - odpowiedź ma być tą, którą trzeba przeczytać', () => {
    expect(refuseChange(booking({ endsAt: NOW - H }), OBCY, NOW)).toBe('not_your_booking');
  });
});

describe('rezerwacja: odwołanie', () => {
  it('MINIONĄ WOLNO ODWOŁAĆ - inaczej zapis, po który nikt nie przyszedł, zostaje otwarty', () => {
    expect(refuseCancel(booking({ endsAt: NOW - H }), PILOT, null)).toBeNull();
  });

  it('cudza WYMAGA POWODU, własna nie', () => {
    expect(refuseCancel(booking(), ADMIN, null)).toBe('reason_required');
    expect(refuseCancel(booking(), ADMIN, '   ')).toBe('reason_required');
    expect(refuseCancel(booking(), ADMIN, 'przegląd 100 h')).toBeNull();
    expect(refuseCancel(booking(), PILOT, null)).toBeNull();
  });

  it('zdjęcie wyłączenia z użytku powodu NIE wymaga - nie ma komu tłumaczyć', () => {
    expect(refuseCancel(booking({ kind: 'block', pilotId: null }), ADMIN, null)).toBeNull();
  });

  it('odwołanej nie odwołuje się drugi raz', () => {
    expect(refuseCancel(booking({ status: 'cancelled' }), PILOT, null)).toBe('booking_closed');
  });
});
