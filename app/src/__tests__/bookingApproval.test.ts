/**
 * Ninerdeck - testy STANÓW KARTY REZERWACJI wobec ścieżki (23b–23e, epik R-I).
 *
 * Pod obserwacją: „doszedł krok" poznaje się po kształcie ścieżki (decyzja ZA krokiem
 * bieżącym), odmowa niesie powód i krok, wygaśnięcie mówi, kto nie zdecydował, a klub
 * bez ścieżki dostaje kartę jak w 3.0.0.
 */

import type { RemoteApproval } from '../application';
import { approvalView, termIn } from '../ui/screens/logic/bookingApproval';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const H = 3_600_000;
const NOW = Date.UTC(2026, 8, 24, 8, 0);
const day: ClubDayBounds = {
  date: '2026-09-26',
  startsAt: Date.parse('2026-09-25T22:00:00Z'),
  endsAt: Date.parse('2026-09-26T22:00:00Z'),
};

const step = (
  id: string,
  label: string,
  over: Partial<RemoteApproval['steps'][number]> = {},
): RemoteApproval['steps'][number] => ({ id, label, current: false, decision: null, ...over });

const zgoda = (hoursAgo: number, via: 'person' | 'self' = 'person') => ({
  decision: 'approved' as const,
  via,
  reason: null,
  decidedAt: new Date(NOW - hoursAgo * H).toISOString(),
});

const view = (approval: RemoteApproval | null, status: string) =>
  approvalView({ approval, status, now: NOW, createdAt: NOW - 16 * H, day });

describe('ścieżka na karcie rezerwacji', () => {
  it('czeka na krok 1 z 2: krok bieżący liczy od złożenia, dalszy „nie zaczął"', () => {
    const vm = view({ outcome: 'pending', steps: [step('s1', 'Mechanik', { current: true }), step('s2', 'Szef')] }, 'pending');
    expect(vm.state).toBe('waiting');
    expect(vm.banner?.title).toBe('Czeka na zgodę · krok 1 z 2');
    expect(vm.steps).toEqual([
      { id: 's1', label: 'Mechanik', mark: 'now', when: 'czeka od 16 h temu' },
      { id: 's2', label: 'Szef', mark: 'idle', when: 'nie zaczął' },
    ]);
    expect(vm).toMatchObject({ badge: 'Czeka na zgodę', badgeTone: 'amber', heroTone: 'amber', stepOfN: 'krok 1 z 2' });
  });

  it('po zgodzie kroku 1 krok 2 czeka OD TEJ ZGODY, nie od złożenia', () => {
    const vm = view(
      { outcome: 'pending', steps: [step('s1', 'Mechanik', { decision: zgoda(2) }), step('s2', 'Szef', { current: true })] },
      'pending',
    );
    expect(vm.steps[0]).toEqual({ id: 's1', label: 'Mechanik', mark: 'ok', when: '2 h temu' });
    expect(vm.steps[1]).toEqual({ id: 's2', label: 'Szef', mark: 'now', when: 'czeka od 2 h temu' });
  });

  it('DOSZEDŁ KROK: decyzja stojąca ZA krokiem bieżącym znaczy, że ścieżka urosła', () => {
    const vm = view(
      { outcome: 'pending', steps: [step('s0', 'Szef', { current: true }), step('s1', 'Mechanik', { decision: zgoda(13) })] },
      'pending',
    );
    expect(vm.state).toBe('stepAdded');
    expect(vm.banner?.title).toBe('Doszedł krok akceptacji');
    expect(vm.banner?.text).toContain('krok „Szef"');
    expect(vm.stepOfN).toBe('krok 1 z 2');
  });

  it('odmowa: baner czerwony z krokiem i POWODEM, krok dalszy „nie zaczął", karta wygaszona', () => {
    const vm = view(
      {
        outcome: 'rejected',
        steps: [
          step('s1', 'Mechanik', { decision: { decision: 'rejected', via: 'person', reason: 'Przegląd 100 h.', decidedAt: new Date(NOW - H).toISOString() } }),
          step('s2', 'Szef'),
        ],
      },
      'rejected',
    );
    expect(vm.state).toBe('rejected');
    expect(vm.banner).toEqual({ tone: 'red', title: 'Odmowa zgody · krok „Mechanik"', text: 'Przegląd 100 h.' });
    expect(vm.steps.map((s) => s.mark)).toEqual(['no', 'idle']);
    expect(vm.steps[1]!.when).toBe('nie zaczął');
    expect(vm).toMatchObject({ badge: 'Odrzucona', badgeTone: 'red', heroTone: 'off', stepOfN: null });
  });

  it('wygasła: pierwszy niezdecydowany „nie zdecydował", dalsi „nie zaczął"', () => {
    const vm = view({ outcome: 'pending', steps: [step('s1', 'Mechanik', { current: true }), step('s2', 'Szef')] }, 'expired');
    expect(vm.state).toBe('expired');
    expect(vm.steps.map((s) => s.when)).toEqual(['nie zdecydował', 'nie zaczął']);
    expect(vm).toMatchObject({ badge: 'Wygasła', badgeTone: 'dim', heroTone: 'off' });
    expect(vm.banner?.text).toContain('milczenie nie znaczy zgody');
  });

  it('potwierdzona: pominięcie jest zapisem „przeszedł sam", banera nie ma', () => {
    const vm = view(
      { outcome: 'confirmed', steps: [step('s1', 'Mechanik', { decision: zgoda(5, 'self') }), step('s2', 'Szef', { decision: zgoda(1) })] },
      'confirmed',
    );
    expect(vm.state).toBe('confirmed');
    expect(vm.banner).toBeNull();
    expect(vm.steps.map((s) => s.when)).toEqual(['przeszedł sam', '1 h temu']);
    expect(vm).toMatchObject({ badge: 'Potwierdzona', badgeTone: 'green', heroTone: 'green' });
  });

  it('klub bez ścieżki i serwer sprzed 3.1.0: karta jak w 3.0.0, stan nieznany surowo', () => {
    expect(view(null, 'confirmed')).toMatchObject({ state: 'none', steps: [], banner: null, heroTone: 'green' });
    expect(view({ outcome: 'confirmed', steps: [] }, 'cancelled')).toMatchObject({ badge: 'Odwołana', heroTone: 'off' });
    expect(view(null, 'frozen')).toMatchObject({ badge: 'frozen', badgeTone: 'dim' });
  });
});

describe('odległość terminu', () => {
  it('liczy się na dobach klubu', () => {
    expect(termIn(day, day.startsAt + 3 * H)).toBe('termin dziś');
    expect(termIn(day, day.startsAt - 5 * H)).toBe('termin jutro');
    expect(termIn(day, day.startsAt - 2 * 24 * H)).toBe('termin za 2 dni');
    expect(termIn(day, day.endsAt + H)).toBe('termin minął');
  });
});
