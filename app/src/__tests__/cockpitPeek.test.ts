/**
 * UZ Aero — test treści podglądu cudzej sesji (ekran 04b).
 *
 * Ten ekran jest jedynym miejscem, w którym pilot ocenia CUDZY samolot przed decyzją
 * o przejęciu — a przejęcie odbiera poprzednikowi prawo zapisu (§4.4). Jedyne
 * zabezpieczenie przed złą decyzją to uczciwy opis wieku danych: różnica między
 * „silnik wyłączony (pobrano minutę temu)" a „silnik wyłączony (stan sprzed doby)"
 * jest tu całą informacją.
 *
 * Dlatego testujemy przede wszystkim to, że stan `live` NIGDY nie powstaje ze starej
 * migawki ani bez sieci, i że każdy stan ma niepustą stopkę o pochodzeniu danych (§4.8).
 *
 * Liczby scenariusza pochodzą z mockupu `design/04b-cockpit-readonly.html`:
 * meldunek 07:10, pobrano 09:41, ostatnia aktywność 09:38, 1 cykl 07:22 → 08:31, 1 T/O.
 */

import {
  LIVE_MAX_AGE_MS,
  cyclesLabel,
  peekBanner,
  peekFreshness,
  peekLogTitle,
  peekStatusChip,
  snapshotAgeLabel,
  takeoverHint,
  takeoverWarning,
  type PeekSnapshot,
} from '../ui/screens/logic/cockpitPeek';
import { projectSession, type Event, type SessionState } from '../domain';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event<T extends Event['type']>(type: T, time: number, payload: unknown = {}): Event {
  seq += 1;
  return {
    uuid: `e-${seq}-${type}`,
    sessionUuid: 'krz-1',
    aircraftId: 'SP-FGK',
    picId: 'KRZ',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    // Migawka przychodzi z serwera, więc jej zdarzenia są z definicji wysłane.
    syncedAt: time,
  } as Event;
}

/** Dzień KRZ z mockupu: meldunek 07:10, jeden cykl 07:22 → 08:31 z jednym lotem. */
const krzEvents: Event[] = [
  event('preflight_confirm', at(7, 10), {
    operation: 'skoki',
    dutyStart: at(7, 10),
    reading: { fuelL: 176, mh: 4512 },
  }),
  event('engine_start', at(7, 22)),
  event('takeoff', at(7, 35), { method: 'auto' }),
  event('landing', at(8, 20), { method: 'auto' }),
  event('engine_stop', at(8, 31)),
];

const snapshot: PeekSnapshot = { events: krzEvents, fetchedAt: at(9, 41) };
const krzState: SessionState = projectSession(krzEvents);

describe('stan świeżości migawki', () => {
  it('bez migawki nie ma czego pokazać — stan „brak"', () => {
    expect(peekFreshness(null, true, at(9, 41))).toBe('brak');
  });

  it('świeżo pobrana migawka przy działającej sieci to „live"', () => {
    expect(peekFreshness(snapshot, true, at(9, 41))).toBe('live');
  });

  it('brak sieci degraduje nawet świeżą migawkę do „cache"', () => {
    expect(peekFreshness(snapshot, false, at(9, 41))).toBe('cache');
  });

  it('migawka starsza niż próg przestaje być „live", choć sieć działa', () => {
    const stale = at(9, 41) + LIVE_MAX_AGE_MS + 1;
    expect(peekFreshness(snapshot, true, stale)).toBe('cache');
  });
});

describe('wiek migawki słowami', () => {
  it.each([
    [30_000, 'sprzed chwili'],
    [12 * 60_000, 'sprzed 12 min'],
    [3 * 3_600_000, 'sprzed 3 h'],
    [30 * 3_600_000, 'sprzed ponad doby'],
  ])('%i ms → %s', (ms, label) => {
    expect(snapshotAgeLabel(ms as number)).toBe(label);
  });
});

describe('baner podglądu', () => {
  const base = {
    picCode: 'KRZ',
    claimSince: at(7, 10),
    fetchedAt: snapshot.fetchedAt,
    lastActivityAt: krzState.lastEventAt,
    now: at(9, 41),
  };

  it('live: informuje o prowadzącym, godzinie pobrania i ostatniej aktywności', () => {
    const model = peekBanner({ ...base, freshness: 'live' });
    expect(model.tone).toBe('blue');
    expect(model.warning).toBeNull();
    expect(model.meta).toBe('Dane z serwera · pobrano 09:41 · ostatnia aktywność KRZ 08:31');
    expect(model.text.find((s) => s.strong === true)?.text).toBe('KRZ · od 07:10');
  });

  it('cache: ostrzega, czego ten stan może już nie obejmować', () => {
    const model = peekBanner({ ...base, freshness: 'cache', now: at(9, 41) + 30 * 3_600_000 });
    expect(model.tone).toBe('amber');
    expect(model.meta).toBe('Ostatnie pobrane dane · 22 CZE 09:41 · stan sprzed ponad doby');
    expect(model.warning).toContain('ostatni znany stan');
  });

  it('brak: mówi wprost, że przebiegu dnia nie znamy — zamiast pustego logu', () => {
    const model = peekBanner({ ...base, freshness: 'brak', fetchedAt: null, lastActivityAt: null });
    expect(model.meta).toContain('Brak danych z serwera');
    expect(model.warning).not.toBeNull();
  });

  it('każdy stan ma niepustą stopkę o pochodzeniu danych (§4.8)', () => {
    for (const freshness of ['live', 'cache', 'brak'] as const) {
      expect(peekBanner({ ...base, freshness }).meta.length).toBeGreaterThan(0);
    }
  });

  it('nieznany kod pilota nie robi dziury w zdaniu', () => {
    const model = peekBanner({ ...base, freshness: 'live', picCode: null, claimSince: null });
    expect(model.text.find((s) => s.strong === true)?.text).toBe('inny pilot');
    expect(model.meta).not.toContain('null');
  });
});

describe('nagłówek logu', () => {
  // Mockup 04b mówi „Log SP-FGK · KRZ · …", a nie „Log dnia KRZ · …", i to nie jest
  // kosmetyka: podgląd opisuje SESJĘ JEDNEJ MASZYNY, a dzień KRZ-a po §3.6a może objąć
  // kilka samolotów. „Log dnia KRZ" obiecywał przekrój, którego ten ekran nie pokazuje.
  it('odwzorowuje mockup 04b: „Log SP-FGK · KRZ · UTC · 1 cykl · 1 T/O"', () => {
    expect(peekLogTitle('SP-FGK', 'KRZ', krzState)).toBe('Log SP-FGK · KRZ · UTC · 1 cykl · 1 T/O');
  });

  it('bez migawki nie udaje pustej sesji', () => {
    expect(peekLogTitle('SP-FGK', 'KRZ', null)).toBe('Log SP-FGK · KRZ · UTC · brak danych');
  });

  it.each([
    [1, '1 cykl'],
    [3, '3 cykle'],
    [6, '6 cykli'],
    [12, '12 cykli'],
    [22, '22 cykle'],
  ])('%i → %s', (n, label) => {
    expect(cyclesLabel(n as number)).toBe(label);
  });
});

describe('chip stanu', () => {
  it('po zamkniętym cyklu: ziemia, silnik wyłączony — zawsze z adnotacją „wg serwera"', () => {
    expect(peekStatusChip(krzState)).toEqual({
      label: 'Ground · silnik wyłączony · wg serwera',
      tone: 'neutral',
    });
  });

  it('otwarty cykl to RUNNING', () => {
    const running = projectSession(krzEvents.slice(0, 2));
    expect(peekStatusChip(running).label).toContain('Running');
  });

  it('otwarty lot bije otwarty cykl — pilot ma wiedzieć, że samolot jest w powietrzu', () => {
    const airborne = projectSession(krzEvents.slice(0, 3));
    expect(peekStatusChip(airborne)).toEqual({ label: 'W powietrzu · wg serwera', tone: 'blue' });
  });

  it('sesja zamknięta mówi o SAMOLOCIE, nie o dniu poprzednika', () => {
    // §3.6a: `day_close` zdaje MASZYNĘ i nie kończy dnia pilota — KRZ może za chwilę
    // wziąć drugi samolot. Napis „Dzień zamknięty" mówił o cudzej służbie coś, czego
    // ten strumień nie wie, i to na ekranie, którego tematem jest jedna maszyna.
    const released = projectSession([
      ...krzEvents,
      event('day_close', at(8, 40), { finalReading: { fuelL: 150, mh: 4513.2 } }),
    ]);

    expect(peekStatusChip(released)).toEqual({
      label: 'Samolot zdany · wg serwera',
      tone: 'neutral',
    });
  });

  it('bez migawki nie zmyśla stanu', () => {
    expect(peekStatusChip(null).label).toContain('nieznany');
  });
});

describe('przejęcie samolotu z podglądu (issue #12)', () => {
  it('ostrzeżenie zawsze mówi o niewysłanych danych poprzednika', () => {
    expect(takeoverWarning('live', 'KRZ')).toContain('niewysłane dane');
    expect(takeoverWarning('live', 'KRZ')).toContain('KRZ');
  });

  it('offline mówi wprost, że przejęcie DZIAŁA — claim jest optymistyczny (§4.4)', () => {
    expect(takeoverWarning('cache', 'KRZ')).toContain('bez sieci');
    expect(takeoverWarning('brak', 'KRZ')).toContain('bez sieci');
  });

  it('bez kodu poprzednika ostrzeżenie nadal jest zdaniem, nie dziurą', () => {
    expect(takeoverWarning('live', null)).toContain('poprzedni PIC');
  });

  it('podpis pod przyciskiem mówi, że rejestru to jeszcze nie dotyka', () => {
    const hint = takeoverHint('SP-FGK');
    expect(hint).toContain('SP-FGK');
    expect(hint).toContain('preflightu');
    expect(hint).toContain('po potwierdzeniu');
  });
});
