/**
 * Ninerdeck - testy TAPNIĘCIA W POWIADOMIENIE i PROŚBY O ZGODĘ (epik R-J).
 *
 * Pod obserwacją: prośba o zgodę otwiera ekran decyzji, wiadomość o własnej rezerwacji
 * jej kartę, a wszystko nieznane - skrzynkę; prośba o zgodę na powiadomienia pada
 * wyłącznie w dwóch momentach i raz na uruchomienie.
 */

import {
  optInAfterBooking,
  optInOnDashboard,
  PushOptInGate,
} from '../ui/screens/logic/pushOptIn';
import { pushTarget } from '../ui/screens/logic/pushTarget';

describe('dokąd prowadzi tapnięcie', () => {
  it('prośba o zgodę otwiera EKRAN DECYZJI tej rezerwacji', () => {
    expect(pushTarget({ kind: 'approval_requested', bookingId: 'b1', aircraftId: 'a1' })).toEqual({
      screen: 'Decision',
      params: { bookingId: 'b1' },
    });
  });

  it('decyzja i wygaśnięcie otwierają KARTĘ własnej rezerwacji', () => {
    for (const kind of ['booking_approved', 'booking_rejected', 'booking_expired']) {
      expect(pushTarget({ kind, bookingId: 'b2' })).toEqual({
        screen: 'BookingDetails',
        params: { bookingId: 'b2' },
      });
    }
  });

  it('rodzaj nieznany, brak identyfikatora albo śmieci - SKRZYNKA, nigdy wywrotka', () => {
    expect(pushTarget({ kind: 'booking_moved', bookingId: 'b3' })).toEqual({ screen: 'Notifications' });
    expect(pushTarget({ kind: 'approval_requested' })).toEqual({ screen: 'Notifications' });
    expect(pushTarget({ kind: 'approval_requested', bookingId: 7 })).toEqual({ screen: 'Notifications' });
    expect(pushTarget(null)).toEqual({ screen: 'Notifications' });
    expect(pushTarget('x')).toEqual({ screen: 'Notifications' });
  });
});

describe('kiedy prosić o zgodę na powiadomienia', () => {
  it('na Pulpicie - wyłącznie akceptującego; bez odpowiedzi serwera nie pyta', () => {
    expect(optInOnDashboard(true)).toBe('approver');
    expect(optInOnDashboard(false)).toBeNull();
    expect(optInOnDashboard(undefined)).toBeNull();
  });

  it('po rezerwacji - wyłącznie takiej, która CZEKA; potwierdzona od razu nie rodzi powiadomień', () => {
    expect(optInAfterBooking('pending')).toBe('pending_booking');
    expect(optInAfterBooking('confirmed')).toBeNull();
  });

  it('bramka pyta RAZ na uruchomienie i nigdy bez powodu', () => {
    const gate = new PushOptInGate();
    expect(gate.take(null)).toBe(false);
    expect(gate.take('approver')).toBe(true);
    expect(gate.take('pending_booking')).toBe(false);
    expect(gate.take('approver')).toBe(false);
  });
});
