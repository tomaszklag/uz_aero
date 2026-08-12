/**
 * UZ Aero — pasek sesji cudzego samolotu (04B) i decyzja o wznowieniu po restarcie.
 *
 * Oba moduły pilnują tej samej granicy: **kokpit opisuje SAMOLOT, nie dzień pilota**.
 * Pasek mówi, czyja jest maszyna i ile zrobiła; bramka wznowienia pyta, czy pilot ją
 * jeszcze trzyma. Żadne z nich nie ma prawa sięgnąć po dawną klamrę służby — ta znikła
 * z modelu w całości (issue #23), a dzień pilota to lista sesji.
 *
 * Wariant WŁASNEJ sesji (`buildClaimStrip`, mockupy 04/04A) miał tu własny blok testów —
 * zniknął razem z funkcją 2026-08-10, gdy kokpit stał się stanem modalnym bez drogi
 * powrotnej na 01. Odmiana liczebnika i zerowy licznik LOTÓW przeszły do bloku 04B,
 * bo to jedyny pasek, który dziś istnieje.
 */

import { buildPeekStrip } from '../ui/screens/logic/claimStrip';
import { holdsAircraft, resumeTarget } from '../ui/navigation/resumeTarget';
import { emptySessionState } from '../domain';
import type { Flight, SessionState } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0);
const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
};

let flightSeq = 0;

// Lot start → lądowanie (model 2026-08-10: licznik paska zlicza LOTY sesji).
const flight = (from: string, to: string): Flight => ({
  index: ++flightSeq,
  method: 'auto',
  takeoffAt: at(from),
  landingAt: at(to),
  durationMs: at(to) - at(from),
  takeoffUuid: `to-${flightSeq}`,
  landingUuid: `ldg-${flightSeq}`,
});

const session = (over: Partial<SessionState> = {}): SessionState => ({
  ...emptySessionState(),
  sessionUuid: 's-axa',
  aircraftId: 'SP-AXA',
  sessionPicId: 'TMK',
  picId: 'TMK',
  claimedAt: at('08:04'),
  ...over,
});

beforeEach(() => {
  flightSeq = 0;
});

describe('pasek sesji — cudzy samolot (04B)', () => {
  it('opisuje maszynę, a NIE czas pracy tamtego pilota', () => {
    // Wcześniej stało tu „Duty KRZ 02:31". Czas pracy innego pilota nie jest informacją
    // o samolocie i nie wnosi nic do decyzji o przejęciu.
    const vm = buildPeekStrip(
      session({
        aircraftId: 'SP-FGK',
        claimedAt: at('07:10'),
        flights: [flight('07:35', '08:20')],
      }),
      'KRZ',
    )!;

    expect(vm.label).toBe('SP-FGK · KRZ od 07:10 UTC');
    expect(vm.flights).toBe('1 lot');
    expect(vm.trailing).toBe('zajęty');
  });

  it('maszyna, która dziś nic nie zrobiła, mówi to wprost — zero nie jest wynikiem', () => {
    expect(buildPeekStrip(session({ aircraftId: 'SP-FGK' }), 'KRZ')!.flights).toBe(
      'jeszcze żadnego lotu',
    );
  });

  it('polska odmiana liczebnika: 1 / 2 / 5', () => {
    const withFlights = (n: number) =>
      buildPeekStrip(
        session({ flights: Array.from({ length: n }, () => flight('08:00', '08:30')) }),
        'KRZ',
      )!.flights;

    expect(withFlights(1)).toBe('1 lot');
    expect(withFlights(2)).toBe('2 loty');
    expect(withFlights(5)).toBe('5 lotów');
  });

  it('bez chwili przejęcia mówi mniej, zamiast podstawiać czas pierwszego startu', () => {
    const vm = buildPeekStrip(
      session({ claimedAt: null, flights: [flight('08:12', '09:05')] }),
      'KRZ',
    )!;

    expect(vm.label).toBe('SP-AXA · KRZ od — UTC');
  });

  it('brak samolotu to brak paska', () => {
    expect(buildPeekStrip(emptySessionState(), 'KRZ')).toBeNull();
  });
});

describe('wznowienie po restarcie', () => {
  it('trzymany samolot wraca do kokpitu', () => {
    expect(resumeTarget(session())).toBe('Cockpit');
  });

  it('ZDANY samolot wraca do „Mój dzień", nie do kokpitu', () => {
    // Sedno: pytamy o `closed` (fakt zdania), nie o dawną klamrę służby — historyczny
    // warunek `dutyEnd == null` wrzucał pilota do kokpitu maszyny, której już nie ma.
    const released = session({ closed: true });

    expect(holdsAircraft(released)).toBe(false);
    expect(resumeTarget(released)).toBe('MyDay');
  });

  it('brak sesji zaczyna od „Mój dzień"', () => {
    expect(resumeTarget(null)).toBe('MyDay');
    expect(resumeTarget(emptySessionState())).toBe('MyDay');
  });
});
