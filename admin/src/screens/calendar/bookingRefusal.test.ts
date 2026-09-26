/**
 * Ninerdeck - panel: odmowa zapisu zajętości (issue #160).
 *
 * Pod obserwacją jest jedna strata: serwer dokłada do `slot_taken` KOLIDUJĄCY wiersz
 * (i płaci za to punktem zapisu w transakcji), a panel potrafi go wyrzucić i napisać
 * „kod 409". Wtedy cała tamta praca nic nie daje.
 */

import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import type { BookingDto } from '../../api/dto';
import { bookingErrorMessage, bookingRefusal, takenBooking } from './bookingRefusal';
import type { Person } from './bookingLabels';

const TZ = 'Europe/Warsaw';
const OSOBY: Readonly<Record<string, Person>> = { 'p-1': { name: 'Barbara Nowak', code: 'BNO' } };
const person = (id: string): Person | null => OSOBY[id] ?? null;

const kolidujaca = (over: Partial<BookingDto> = {}): BookingDto =>
  ({
    id: 'b-1', aircraftId: 'a-1', kind: 'flight', status: 'confirmed',
    startsAt: '2026-09-21T06:00:00.000Z', endsAt: '2026-09-21T10:00:00.000Z',
    pilotId: 'p-1', dualId: null, operation: 'egzamin',
    fromIcao: null, toIcao: null, plannedAirMin: null, plannedFuelL: null,
    blockReason: null, note: null, sessionUuid: null,
    createdAt: '2026-09-20T18:00:00.000Z', createdBy: 'p-1',
    ...over,
  }) as BookingDto;

const odmowa = (status: number, body: unknown): HttpError => new HttpError(status, body as never);

describe('rozpoznanie odmowy', () => {
  it('kod reguły rezerwacji wychodzi z ciała, nie ze statusu', () => {
    expect(bookingRefusal(odmowa(409, { error: 'slot_taken' }))).toBe('slot_taken');
    expect(bookingRefusal(odmowa(400, { error: 'booking_in_past' }))).toBe('booking_in_past');
  });

  it('cudzy kod i zwykła awaria nie udają odmowy reguły', () => {
    expect(bookingRefusal(odmowa(409, { error: 'conflict', field: 'reg' }))).toBeNull();
    expect(bookingRefusal(new Error('sieć'))).toBeNull();
  });
});

describe('zdanie pod przyciskiem', () => {
  it('ZAJĘTY TERMIN mówi, co tam stoi - z godziną w strefie klubu', () => {
    const e = odmowa(409, { error: 'slot_taken', taken: kolidujaca() });
    expect(takenBooking(e)).not.toBeNull();
    expect(bookingErrorMessage(e, TZ, person)).toBe(
      'Ten termin jest już zajęty. Od 21 wrz, 08:00 lata Barbara Nowak (egzamin).',
    );
  });

  it('kolizja z WYŁĄCZENIEM Z UŻYTKU nazywa je po imieniu, a nie cudzym lotem', () => {
    const e = odmowa(409, {
      error: 'slot_taken',
      taken: kolidujaca({ kind: 'block', pilotId: null, operation: null, blockReason: 'maintenance' }),
    });
    expect(bookingErrorMessage(e, TZ, person)).toBe(
      'Ten termin jest już zajęty. Od 21 wrz, 08:00 maszyna jest wyłączona z użytku.',
    );
  });

  it('bez dołączonego wiersza zostaje samo „zajęty" - nie zmyślamy, co tam stoi', () => {
    expect(bookingErrorMessage(odmowa(409, { error: 'slot_taken' }), TZ, person)).toBe(
      'Ten termin jest już zajęty.',
    );
  });

  it('pilot spoza cache członków nie zostawia dziury w zdaniu', () => {
    const e = odmowa(409, { error: 'slot_taken', taken: kolidujaca({ pilotId: 'obcy' }) });
    expect(bookingErrorMessage(e, TZ, person)).toBe(
      'Ten termin jest już zajęty. Od 21 wrz, 08:00 stoi inna rezerwacja.',
    );
  });

  it('każdy kod ma własne zdanie, żadne nie jest kodem HTTP', () => {
    const kody = ['aircraft_disabled', 'aircraft_not_found', 'not_your_booking',
                  'booking_in_past', 'booking_order', 'booking_closed', 'reason_required'];
    for (const kod of kody) {
      const zdanie = bookingErrorMessage(odmowa(409, { error: kod }), TZ, person);
      expect(zdanie).not.toMatch(/\d{3}/);
      expect(zdanie.length).toBeGreaterThan(20);
    }
  });
});
