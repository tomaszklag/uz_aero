/**
 * Ninerdeck (serwer) - DANE BUDZIKA (issue #228): `data` push niesie dokładnie to, co
 * telefon czyta w `pushTarget.ts` - `kind`, `orgId`, `bookingId`, `aircraftId` - i nic
 * z reszty payloadu wiadomości. Payloady w teście są kopią kształtów z `bookingNotices.ts`
 * i `aircraftNotices.ts`, żeby było widać, CO zostaje za drzwiami.
 */

import { describe, expect, it } from 'vitest';

import { pushData } from '../src/application/common/notify/pushData.ts';

const ORG = 'org-alfa';

describe('pushData - dane budzika (#228)', () => {
  it('odmowa: zostają identyfikatory rezerwacji i maszyny; powód, osoba, krok i godziny NIE jadą', () => {
    const data = pushData(ORG, {
      kind: 'booking_rejected',
      payload: {
        bookingId: 'b-1',
        aircraftId: 'SP-AXA',
        pilotId: 'AKO',
        startsAt: '2026-06-22T08:00:00.000Z',
        endsAt: '2026-06-22T10:00:00.000Z',
        reason: 'brak badań lotniczo-lekarskich',
        decidedBy: 'JBA',
        stepLabel: 'Szef wyszkolenia',
      },
    });
    expect(data).toEqual({ kind: 'booking_rejected', orgId: ORG, bookingId: 'b-1', aircraftId: 'SP-AXA' });
  });

  it('zdanie samolotu: odczyty, czasy silnika i osoby zostają w skrzynce', () => {
    const data = pushData(ORG, {
      kind: 'aircraft_released',
      payload: {
        sessionUuid: 'sess-1',
        aircraftId: 'SP-AXA',
        pilotId: 'AKO',
        dualId: 'BNO',
        at: '2026-06-22T10:12:00.000Z',
        engineStartAt: '2026-06-22T08:12:00.000Z',
        engineStopAt: '2026-06-22T10:05:00.000Z',
        blockMs: 6_780_000,
        flights: 3,
        fuelEndL: 128,
        mhEnd: 1236.5,
        noFlightReason: null,
        closedBy: 'pilot',
        reason: null,
      },
    });
    expect(data).toEqual({ kind: 'aircraft_released', orgId: ORG, aircraftId: 'SP-AXA' });
  });

  it('uruchomienie poza planem: `bookingId: null` nie daje klucza', () => {
    const data = pushData(ORG, {
      kind: 'aircraft_engine_started',
      payload: { sessionUuid: 'sess-1', aircraftId: 'SP-AXA', pilotId: 'AKO', dualId: null, planned: false, bookingId: null },
    });
    expect(data).toEqual({ kind: 'aircraft_engine_started', orgId: ORG, aircraftId: 'SP-AXA' });
    expect('bookingId' in data).toBe(false);
  });

  it('pusty napis i wartość innego typu liczą się jak brak', () => {
    const data = pushData(ORG, {
      kind: 'approval_requested',
      payload: { bookingId: '', aircraftId: 42, stepId: 's-1', stepLabel: 'Mechanik' },
    });
    expect(data).toEqual({ kind: 'approval_requested', orgId: ORG });
  });

  it('klucze wyniku są ZAWSZE podzbiorem czterech dozwolonych', () => {
    const data = pushData(ORG, {
      kind: 'booking_approved',
      payload: { bookingId: 'b-1', aircraftId: 'SP-AXA', pilotId: 'AKO', anything: { nested: true } },
    });
    for (const key of Object.keys(data)) expect(['kind', 'orgId', 'bookingId', 'aircraftId']).toContain(key);
  });
});
