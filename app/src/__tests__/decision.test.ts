/**
 * Ninerdeck - testy EKRANU DECYZJI (26, epik R-I).
 *
 * Pod obserwacją: karta niesie cały plan bez kresek za pola, których nie ma; zdanie pod
 * pasem akcji nazywa NASTĘPNY krok, nie bieżący; pas akcji istnieje wyłącznie przy
 * sprawie w toku.
 */

import type { RemoteApproval } from '../application';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';
import { decisionRefusalText, decisionView } from '../ui/screens/logic/decision';

const H = 3_600_000;
const NOW = Date.UTC(2026, 8, 24, 8, 0);
const day: ClubDayBounds = {
  date: '2026-09-26',
  startsAt: Date.parse('2026-09-25T22:00:00Z'),
  endsAt: Date.parse('2026-09-26T22:00:00Z'),
};

function booking(over: Partial<CalendarBooking> = {}): CalendarBooking {
  return {
    id: 'b1',
    aircraftId: 'a1',
    kind: 'flight',
    status: 'pending',
    startsAt: day.startsAt + 9 * H,
    endsAt: day.startsAt + 12 * H,
    pilotId: 'jwr',
    dualId: 'ako',
    operation: 'ferry',
    fromIcao: 'EPZG',
    toIcao: 'EPRJ',
    plannedAirMin: 120,
    plannedFuelL: 140,
    sessionUuid: null,
    blockReason: null,
    note: 'Odbiór części w Jasionce.',
    createdAt: NOW - 16 * H,
    ...over,
  };
}

const sciezka: RemoteApproval = {
  outcome: 'pending',
  steps: [
    { id: 's1', label: 'Mechanik', current: true, decision: null },
    { id: 's2', label: 'Szef wyszkolenia', current: false, decision: null },
  ],
};

const view = (over: Partial<CalendarBooking> = {}, approval: RemoteApproval | null = sciezka) =>
  decisionView({
    booking: booking(over),
    day,
    approval,
    now: NOW,
    aircraft: { reg: 'SP-AXA', type: 'C172' },
    pilot: { name: 'Jakub Wrona', code: 'JWR' },
    dual: { name: 'Anna Kowal', code: 'AKO' },
  });

describe('karta do rozpatrzenia', () => {
  it('niesie cały plan: samolot, termin klubu, obie osoby, zadanie, trasę, plan, notatkę i czekanie', () => {
    const vm = view();
    expect(vm.rows.map((r) => r.label)).toEqual([
      'Samolot',
      'Termin',
      'Pilot',
      'Drugi pilot',
      'Zadanie',
      'Trasa',
      'Plan lotu',
      'Notatka',
      'Czeka od',
    ]);
    expect(vm.rows[1]).toEqual({ label: 'Termin', value: 'sob 26 WRZ 09:00-12:00', sub: null });
    expect(vm.rows[2]).toEqual({ label: 'Pilot', value: 'Jakub Wrona', sub: 'JWR' });
    expect(vm.rows[6]).toEqual({ label: 'Plan lotu', value: '2:00 · paliwo 140 L', sub: null });
    expect(vm.rows[8]).toEqual({ label: 'Czeka od', value: '16 h temu', sub: 'termin za 2 dni' });
    expect(vm.reference).toBe('SP-AXA · sob 26 WRZ 09:00-12:00');
    expect(vm.decidable).toBe(true);
  });

  it('bez drugiego pilota, planu i notatki wierszy po prostu nie ma - kresek też', () => {
    const vm = view({ dualId: null, plannedAirMin: null, plannedFuelL: null, note: null, createdAt: null });
    expect(vm.rows.map((r) => r.label)).toEqual(['Samolot', 'Termin', 'Pilot', 'Zadanie', 'Trasa']);
  });

  it('zdanie pod pasem akcji nazywa NASTĘPNY krok; przy ostatnim mówi o potwierdzeniu', () => {
    expect(view().footnote).toBe(
      'Po zgodzie rezerwacja idzie do kroku „Szef wyszkolenia". Po odmowie termin wraca do puli, a pilot dostaje powód.',
    );
    const ostatni: RemoteApproval = { outcome: 'pending', steps: [{ id: 's1', label: 'Mechanik', current: true, decision: null }] };
    expect(view({}, ostatni).footnote).toBe(
      'Po zgodzie rezerwacja jest potwierdzona. Po odmowie termin wraca do puli, a pilot dostaje powód.',
    );
  });

  it('pas akcji istnieje wyłącznie przy sprawie W TOKU', () => {
    expect(view({ status: 'confirmed' }, { outcome: 'confirmed', steps: sciezka.steps }).decidable).toBe(false);
    expect(view({ status: 'pending' }, null).decidable).toBe(false);
  });

  it('odmowa serwera dostaje zdanie, nieznana - ogólne', () => {
    expect(decisionRefusalText('reason_required')).toContain('dlaczego nie');
    expect(decisionRefusalText('forbidden')).toContain('administrator klubu');
    expect(decisionRefusalText('weird')).toBe('Nie udało się zapisać decyzji.');
  });
});
