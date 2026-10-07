/**
 * Napisy zlecenia - termin czasem KLUBU, „kogo brakuje", trasa i etykieta adresowania
 * rozpisana na fotele. Strefa klubu w testach to Warszawa (CEST w październiku 2026,
 * UTC+2), żeby granica doby klubu NIE pokrywała się z północą UTC.
 */

import { describe, expect, it } from 'vitest';

import {
  audienceBySeat,
  dayMonthLabel,
  momentLabel,
  routeLabel,
  seekingLabel,
  termDayLabel,
  termHoursLabel,
  termRelative,
  termShortDay,
} from './orderLabels';

const TZ = 'Europe/Warsaw';
const at = (iso: string): number => Date.parse(iso);

describe('kogo brakuje - te same słowa, co pasek kalendarza', () => {
  it('dwa fotele - załogi, jeden - nazwany, żaden - nic', () => {
    expect(seekingLabel(['pic', 'dual'])).toBe('Szuka załogi');
    expect(seekingLabel(['pic'])).toBe('Szuka dowódcy');
    expect(seekingLabel(['dual'])).toBe('Szuka drugiego pilota');
    expect(seekingLabel([])).toBeNull();
  });
});

describe('trasa', () => {
  it('skoki to jedno lotnisko, przelot to para, brak to nic', () => {
    expect(routeLabel('EPKP', 'EPKP')).toBe('EPKP');
    expect(routeLabel('EPKP', null)).toBe('EPKP');
    expect(routeLabel('EPKK', 'EPRJ')).toBe('EPKK → EPRJ');
    expect(routeLabel(null, null)).toBeNull();
  });
});

describe('termin czasem klubu', () => {
  it('„sobota 3 PAŹ" - doba klubu, nie UTC', () => {
    expect(termDayLabel(at('2026-10-03T07:00:00Z'), TZ)).toBe('sobota 3 PAŹ');
    // 23:30 UTC w piątek to już sobota 01:30 w Warszawie - liczy się doba klubu.
    expect(termDayLabel(at('2026-10-02T23:30:00Z'), TZ)).toBe('sobota 3 PAŹ');
  });

  it('godziny klubu; termin przez północ niesie dzień końca', () => {
    expect(termHoursLabel(at('2026-10-03T07:00:00Z'), at('2026-10-03T11:00:00Z'), TZ)).toBe('09:00 → 13:00');
    expect(termHoursLabel(at('2026-10-03T20:00:00Z'), at('2026-10-03T23:00:00Z'), TZ)).toBe(
      '22:00 → niedziela 4 PAŹ 01:00',
    );
  });

  it('„dziś" i „jutro" liczą się dobą klubu, dalej - nic', () => {
    const now = at('2026-10-02T19:45:00Z'); // piątek 21:45 w klubie
    expect(termRelative(at('2026-10-03T07:00:00Z'), now, TZ)).toBe('jutro');
    expect(termRelative(at('2026-10-02T20:00:00Z'), now, TZ)).toBe('dziś');
    expect(termRelative(at('2026-10-04T08:00:00Z'), now, TZ)).toBe('za 2 dni');
    expect(termRelative(at('2026-10-01T08:00:00Z'), now, TZ)).toBeNull();
    // Po północy klubu (00:30 w sobotę) sobotni termin jest już „dziś", choć w UTC
    // to wciąż piątek.
    expect(termRelative(at('2026-10-03T07:00:00Z'), at('2026-10-02T22:30:00Z'), TZ)).toBe('dziś');
  });

  it('chwila odpowiedzi: dziś sama godzina, wczoraj słowem, dalej z datą', () => {
    const now = at('2026-10-02T19:45:00Z');
    expect(momentLabel(at('2026-10-02T05:40:00Z'), now, TZ)).toBe('07:40');
    expect(momentLabel(at('2026-10-01T17:14:00Z'), now, TZ)).toBe('wczoraj 19:14');
    expect(momentLabel(at('2026-09-29T05:40:00Z'), now, TZ)).toBe('29 WRZ 07:40');
  });

  it('pasek nad rozmową: skrót dnia z telefonu, doba klubu', () => {
    expect(termShortDay(at('2026-10-03T08:00:00Z'), TZ)).toBe('sob 3 PAŹ');
    // Niedziela 01:30 w klubie, choć w UTC to wciąż sobota.
    expect(termShortDay(at('2026-10-03T23:30:00Z'), TZ)).toBe('nd 4 PAŹ');
    expect(dayMonthLabel(at('2026-09-29T05:40:00Z'), TZ)).toBe('29 WRZ');
  });
});

describe('etykieta adresowania rozpisana na fotele', () => {
  const members = new Set(['Jan Wrona', 'Anna Nowak']);

  it('per fotel: nazwisko członka skrócone jak na pasku, nazwa grupy cała', () => {
    expect(audienceBySeat('dowódca: Jan Wrona · drugi pilot: Piloci An-2', members)).toEqual({
      pic: 'J. Wrona',
      dual: 'Piloci An-2',
    });
  });

  it('kilka adresatów jednego fotela zostaje listą', () => {
    expect(audienceBySeat('drugi pilot: Piloci An-2, Anna Nowak', members)).toEqual({
      dual: 'Piloci An-2, A. Nowak',
    });
  });

  it('wspólna lista to sposób trzeci - bez rozpisywania na fotele', () => {
    expect(audienceBySeat('wspólna lista: Piloci An-2, Jan Wrona', members)).toBe('shared');
  });

  it('bez etykiety (adresat, nie prowadzący) - nic do rozpisania', () => {
    expect(audienceBySeat(undefined, members)).toEqual({});
  });
});
