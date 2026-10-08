/**
 * Ninerdeck - testy TAPNIĘCIA W POWIADOMIENIE i PROŚBY O ZGODĘ (epik R-J).
 *
 * Pod obserwacją: prośba o zgodę otwiera ekran decyzji, wiadomość o własnej rezerwacji
 * jej kartę, a wszystko nieznane - skrzynkę; prośba o zgodę na powiadomienia pada
 * wyłącznie w dwóch momentach i raz na uruchomienie.
 */

import {
  optInAfterBooking,
  optInAfterWatch,
  optInOnDashboard,
  PushOptInGate,
} from '../ui/screens/logic/pushOptIn';
import { isActiveClubPush, pushTarget } from '../ui/screens/logic/pushTarget';

describe('dokąd prowadzi tapnięcie', () => {
  it('prośba o zgodę otwiera EKRAN DECYZJI tej rezerwacji', () => {
    expect(pushTarget({ kind: 'approval_requested', bookingId: 'b1', aircraftId: 'a1' })).toEqual({
      screen: 'Decision',
      params: { bookingId: 'b1' },
    });
  });

  it('decyzja, wygaśnięcie i odwołanie (§12.9) otwierają KARTĘ rezerwacji', () => {
    for (const kind of ['booking_approved', 'booking_rejected', 'booking_expired', 'booking_cancelled']) {
      expect(pushTarget({ kind, bookingId: 'b2' })).toEqual({
        screen: 'BookingDetails',
        params: { bookingId: 'b2' },
      });
    }
  });

  it('prośba WYCOFANA otwiera skrzynkę - sprawy do rozstrzygnięcia już nie ma (issue #233)', () => {
    expect(pushTarget({ kind: 'approval_withdrawn', bookingId: 'b3' })).toEqual({ screen: 'Notifications' });
  });

  it('pięć wiadomości o maszynie otwiera KARTĘ MASZYNY; bez identyfikatora - skrzynkę', () => {
    for (const kind of ['aircraft_flight_soon', 'aircraft_flight_cancelled', 'aircraft_engine_started', 'aircraft_released', 'aircraft_not_taken']) {
      expect(pushTarget({ kind, aircraftId: 'a1', bookingId: 'b1' })).toEqual({ screen: 'Aircraft', params: { aircraftId: 'a1' } });
    }
    expect(pushTarget({ kind: 'aircraft_released', sessionUuid: 's1' })).toEqual({ screen: 'Notifications' });
  });

  it('dwanaście rodzajów zlecenia otwiera KARTĘ ZLECENIA; rozmowa - od razu rozmowę (4.0.0)', () => {
    for (const kind of [
      'order_offered',
      'order_changed',
      'order_answered',
      'order_assigned',
      'order_filled',
      'order_removed',
      'order_withdrawn',
      'order_unassigned',
      'order_cancelled',
      'order_unfilled',
      'order_expired',
    ]) {
      expect(pushTarget({ kind, orderId: 'o-1', bookingId: 'b1', aircraftId: 'a1' })).toEqual({
        screen: 'Order',
        params: { orderId: 'o-1' },
      });
    }
    // Wątek to para zlecenie × adresat (§7.1) - budzik niesie obu.
    expect(pushTarget({ kind: 'order_message', orderId: 'o-1', recipientId: 'ako' })).toEqual({
      screen: 'OrderThread',
      params: { orderId: 'o-1', recipientId: 'ako' },
    });
    // Bez adresata rozmowy - karta zlecenia; bez zlecenia - skrzynka; rodzaj nieznany - skrzynka.
    expect(pushTarget({ kind: 'order_message', orderId: 'o-1' })).toEqual({ screen: 'Order', params: { orderId: 'o-1' } });
    expect(pushTarget({ kind: 'order_offered', bookingId: 'b1' })).toEqual({ screen: 'Notifications' });
    expect(pushTarget({ kind: 'order_cos_nowego', orderId: 'o-1' })).toEqual({ screen: 'Notifications' });
  });

  it('klub z budzika INNY niż aktywny → skrzynka z instrukcją; ten sam albo brak → jak dotąd (R6)', () => {
    const data = { kind: 'aircraft_engine_started', aircraftId: 'a1', orgId: 'club-b' };
    expect(pushTarget(data, 'club-a')).toEqual({ screen: 'Notifications', params: { foreignClub: true } });
    expect(pushTarget({ kind: 'approval_requested', bookingId: 'b1', orgId: 'club-b' }, 'club-a')).toEqual({
      screen: 'Notifications',
      params: { foreignClub: true },
    });
    expect(pushTarget(data, 'club-b')).toEqual({ screen: 'Aircraft', params: { aircraftId: 'a1' } });
    // Bez klubu w danych (serwer sprzed 3.2.0) i bez klubu aktywnego nie ma czego porównać.
    expect(pushTarget({ kind: 'aircraft_engine_started', aircraftId: 'a1' }, 'club-a').screen).toBe('Aircraft');
    expect(pushTarget(data, null).screen).toBe('Aircraft');
  });

  it('push klubu AKTYWNEGO odświeża skrzynkę i dzwonek; z innego klubu - nie (kanał klubu 4.0.0)', () => {
    // Push na wierzchu znaczy chwilę bez łącza: skrzynka i dzwonek dostają ten sam sygnał,
    // co od ramki. Wiadomość z innego klubu do nich nie należy - liczą klub aktywny.
    expect(isActiveClubPush({ kind: 'approval_requested', orgId: 'club-a' }, 'club-a')).toBe(true);
    expect(isActiveClubPush({ kind: 'approval_requested', orgId: 'club-b' }, 'club-a')).toBe(false);
    // Serwer sprzed 3.2.0 klubu w budziku nie wozi - wtedy był tylko klub aktywny.
    expect(isActiveClubPush({ kind: 'approval_requested' }, 'club-a')).toBe(true);
    // Bez klubu aktywnego nie ma skrzynki, którą dałoby się odświeżyć; śmieci - nic.
    expect(isActiveClubPush({ kind: 'approval_requested', orgId: 'club-a' }, null)).toBe(false);
    expect(isActiveClubPush(null, 'club-a')).toBe(false);
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

  it('po WŁĄCZENIU obserwowania - trzeci moment; wyłączenie nie pyta', () => {
    expect(optInAfterWatch(true)).toBe('watching');
    expect(optInAfterWatch(false)).toBeNull();
  });

  it('bramka pyta RAZ na uruchomienie i nigdy bez powodu', () => {
    const gate = new PushOptInGate();
    expect(gate.take(null)).toBe(false);
    expect(gate.take('approver')).toBe(true);
    expect(gate.take('pending_booking')).toBe(false);
    expect(gate.take('approver')).toBe(false);
  });
});
