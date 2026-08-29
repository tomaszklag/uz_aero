/**
 * UZ Aero - panel: testy werdyktu ciszy (`A01a`).
 *
 * ══ CO TU TAK NAPRAWDĘ TESTUJEMY ══
 * Że panel odróżnia dwie rzeczy, które w bazie offline-first zapisują się IDENTYCZNIE -
 * jako nic: „dziś nikt nie lata" od „nic do nas nie dociera". Sam brak wierszy nie
 * rozstrzyga niczego; rozstrzyga to, CZYM SKOŃCZYŁ SIĘ OSTATNI STRUMIEŃ.
 *
 * Każdy z czterech warunków ma własny przypadek, bo pęknięcie każdego z osobna musi
 * wystarczyć do zmiany werdyktu - werdykt reagujący tylko na koniunkcję byłby
 * bezużyteczny dokładnie wtedy, gdy jest potrzebny.
 */

import { describe, expect, it } from 'vitest';

import type { DashboardDto } from '../../api/dto';
import { dashboardFixture } from '../../../test/fixtures/dashboard';
import { SUSPICIOUS_AFTER_MS, quietView, isQuiet } from './dashboardQuiet';

const NOW = Date.UTC(2026, 6, 31, 14, 22, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Klub, w którym poprzedni dzień urwał się CZYSTO - wzorzec ciszy spodziewanej. */
function quiet(): DashboardDto {
  const data = dashboardFixture();
  data.counts.aircraftClaimed = 0;
  data.counts.openDays = 0;
  data.counts.openFlags = 0;
  data.counts.exports = {
    total: 3,
    current: 3,
    blocked: 0,
    missing: 0,
    waiting: 0,
    impossible: 0,
    revised: 0,
    overwritten: 0,
  };
  data.attention = { flags: [], failedExports: [], staleOpenDays: [] };
  for (const row of data.fleet) {
    row.engine = null;
    row.aircraft.claim = null;
  }
  data.recent = [
    {
      uuid: 'ev-close',
      sessionUuid: 'sess-yesterday',
      aircraftId: 'ac-free',
      reg: 'SP-DEF',
      type: 'day_close',
      eventTime: NOW - 19 * HOUR,
      receivedAt: new Date(NOW - 19 * HOUR).toISOString(),
      picId: 'KSO',
      picCode: 'KSO',
      picName: 'Katarzyna Sobczak',
    },
  ];
  return data;
}

describe('kiedy pulpit jest w ciszy', () => {
  it('cisza wymaga ZERA claimów i ZERA otwartych dni', () => {
    expect(isQuiet(quiet())).toBe(true);
    // Dopóki cokolwiek lata, pytanie „czy to cisza spodziewana" nie ma sensu.
    expect(isQuiet(dashboardFixture())).toBe(false);

    const halfway = quiet();
    halfway.counts.openDays = 1;
    expect(isQuiet(halfway)).toBe(false);
  });
});

describe('cisza SPODZIEWANA', () => {
  const view = quietView(quiet());

  it('werdykt zielony, zero powodów, zdanie o domkniętym dniu', () => {
    expect(view.verdict).toBe('expected');
    expect(view.label).toBe('Cisza spodziewana');
    expect(view.reasons).toEqual([]);
    expect(view.headline).toContain('Każda sesja z ostatniego dnia lotnego jest domknięta');
    expect(view.headline).toContain('nie dlatego, że coś przestało działać');
  });

  it('fakty są ZIELONE - to potwierdzenie, że sprawdziliśmy, a nie brak treści', () => {
    const tones = Object.fromEntries(view.facts.map((f) => [f.key, f.tone]));
    expect(tones['ostatnie-zdarzenie']).toBe('green');
    expect(tones['bez-day-close']).toBe('green');
    expect(tones['claimy']).toBe('green');
    expect(tones['karty']).toBe('green');
  });

  it('karta wypisuje PRÓG, wobec którego wydano werdykt', () => {
    // Administrator ma widzieć, na jakiej podstawie panel go uspokaja.
    const prog = view.facts.find((f) => f.key === 'prog');
    expect(prog?.value).toContain('48 godz.');
    expect(SUSPICIOUS_AFTER_MS).toBe(48 * HOUR);
  });
});

describe('cisza PODEJRZANA - cztery warunki, każdy osobno wystarcza', () => {
  it('1. claim otwarty, a od niego zero zdarzeń', () => {
    const data = quiet();
    data.fleet[0]!.engine = {
      sessionUuid: 'sess-stranded',
      engineRunning: false,
      inFlight: false,
      flightsCount: 0,
      openTakeoffAt: null,
      engineStoppedAt: null,
      lastEventAt: null,
      claimedAt: null,
      departureIcao: null,
      dualId: null,
      dualName: null,
      eventCount: 0,
    };

    const view = quietView(data);
    expect(view.verdict).toBe('suspicious');
    expect(view.reasons.map((r) => r.key)).toContain('claim-bez-zdarzen');
    expect(view.reasons[0]?.text).toContain('SP-ABC');
  });

  it('2. sesja bez `day_close` starsza niż okno korekty', () => {
    const data = quiet();
    data.attention.staleOpenDays = dashboardFixture().attention.staleOpenDays;

    const view = quietView(data);
    expect(view.verdict).toBe('suspicious');
    expect(view.reasons.map((r) => r.key)).toContain('dzien-bez-zamkniecia');
  });

  it('3. ostatnie zdarzenie starsze niż próg podejrzenia', () => {
    const data = quiet();
    data.recent[0]!.receivedAt = new Date(NOW - 3 * DAY).toISOString();

    const view = quietView(data);
    expect(view.verdict).toBe('suspicious');
    expect(view.reasons.map((r) => r.key)).toContain('stary-rejestr');
    expect(view.facts.find((f) => f.key === 'ostatnie-zdarzenie')?.tone).toBe('amber');
  });

  it('3a. dokładnie NA progu cisza jest jeszcze spodziewana - granica jest ostra', () => {
    const data = quiet();
    data.recent[0]!.receivedAt = new Date(NOW - SUSPICIOUS_AFTER_MS).toISOString();
    expect(quietView(data).verdict).toBe('expected');
  });

  it('4. karta dnia bez arkusza - i osobno: karta zablokowana flagą', () => {
    const missing = quiet();
    missing.counts.exports.missing = 1;
    expect(quietView(missing).reasons.map((r) => r.key)).toContain('karta-bez-arkusza');

    const blocked = quiet();
    blocked.counts.exports.blocked = 2;
    expect(quietView(blocked).reasons.map((r) => r.key)).toContain('karta-zablokowana');
  });

  it('nagłówek MÓWI, że pustka nie tłumaczy się sama', () => {
    const data = quiet();
    data.counts.exports.missing = 1;
    expect(quietView(data).headline).toContain('NIE jest zgodna z projektem');
  });
});

describe('pusty rejestr to TRZECI stan, nie cisza', () => {
  it('brak jakiegokolwiek zdarzenia daje werdykt „nie wiemy", nie „spodziewana"', () => {
    // Uspokajanie w sprawie, o której nic nie wiadomo, jest gorsze od milczenia:
    // to jest stan sprzed pierwszego synchronizowania telefonu, a nie po dniu lotnym.
    const data = quiet();
    data.recent = [];
    data.lastFlyingDay = null;
    data.counts.exports = {
      total: 0,
      current: 0,
      blocked: 0,
      missing: 0,
      waiting: 0,
      impossible: 0,
      revised: 0,
      overwritten: 0,
    };

    const view = quietView(data);
    expect(view.verdict).toBe('unknown');
    expect(view.label).toBe('Rejestr pusty');
    expect(view.headline).toContain('sprzed pierwszego synchronizowania');
    expect(view.facts.find((f) => f.key === 'ostatnie-zdarzenie')?.value).toBe(
      'brak - rejestr pusty',
    );
    expect(view.facts.find((f) => f.key === 'ostatni-dzien')?.value).toContain(
      'żaden dzień lotny jeszcze nie powstał',
    );
  });
});
