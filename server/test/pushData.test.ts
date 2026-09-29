/**
 * Ninerdeck (serwer) - DANE BUDZIKA (issue #228): `data` push niesie dokładnie to, co
 * telefon czyta w `pushTarget.ts` - `kind`, `orgId`, `bookingId`, `aircraftId`, a od
 * zleceń (4.0.0) także `orderId` i `recipientId` - i nic z reszty payloadu wiadomości. Payloady w teście są kopią kształtów z `bookingNotices.ts`
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

  it('wiadomość w zleceniu: zlecenie i ADRESAT wątku jadą, treść i autor zostają w skrzynce (pkt 43)', () => {
    const data = pushData(ORG, {
      kind: 'order_message',
      payload: {
        orderId: 'o-1',
        bookingId: 'b-1',
        aircraftId: 'SP-AXA',
        startsAt: '2026-06-24T10:00:00.000Z',
        endsAt: '2026-06-24T12:00:00.000Z',
        operation: 'przelot',
        createdBy: 'JSE',
        threadId: 't-1',
        recipientId: 'PWI',
        authorId: 'PWI',
        unread: 2,
      },
    });
    expect(data).toEqual({
      kind: 'order_message',
      orgId: ORG,
      bookingId: 'b-1',
      aircraftId: 'SP-AXA',
      orderId: 'o-1',
      recipientId: 'PWI',
    });
  });

  it('zmiana zlecenia: co się zmieniło, zostaje w skrzynce', () => {
    const data = pushData(ORG, {
      kind: 'order_changed',
      payload: { orderId: 'o-1', bookingId: 'b-1', aircraftId: 'SP-AXA', term: true, changes: { note: { from: null, to: 'x' } } },
    });
    expect(data).toEqual({ kind: 'order_changed', orgId: ORG, bookingId: 'b-1', aircraftId: 'SP-AXA', orderId: 'o-1' });
  });

  it('klucze wyniku są ZAWSZE podzbiorem sześciu dozwolonych', () => {
    const data = pushData(ORG, {
      kind: 'booking_approved',
      payload: { bookingId: 'b-1', aircraftId: 'SP-AXA', pilotId: 'AKO', anything: { nested: true } },
    });
    for (const key of Object.keys(data)) {
      expect(['kind', 'orgId', 'bookingId', 'aircraftId', 'orderId', 'recipientId']).toContain(key);
    }
  });
});
