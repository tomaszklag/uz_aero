/**
 * UZ Aero — panel: testy kart „Dziś w liczbach" i „Ostatni dzień lotny" (`A01`, `A01a`).
 *
 * Najważniejszy przypadek jest o BRAKU: komórka „Zrzuty · skoczkowie" z mockupu stoi
 * z kreską, bo projekcja `sessions` nie niesie `DropSummary`. Zero byłoby twierdzeniem,
 * że dziś nikt nie skakał — a tego nie wiemy.
 */

import { describe, expect, it } from 'vitest';

import type { DayTotalsDto } from '../../api/dto';
import { dayView } from './dashboardToday';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60_000;

const totals = (over: Partial<DayTotalsDto> = {}): DayTotalsDto => ({
  day: '2026-07-31',
  fromMs: Date.UTC(2026, 6, 31),
  toMs: Date.UTC(2026, 6, 31) + 24 * HOUR - 1,
  sessions: 3,
  aircraft: 3,
  flights: 17,
  blockMs: 9 * HOUR + 47 * MINUTE,
  eventsAccepted: 184,
  ...over,
});

describe('cztery komórki mockupu, w tej samej kolejności', () => {
  const view = dayView(totals());

  it('zdarzenia, loty i blok pochodzą wprost z odpowiedzi serwera', () => {
    expect(view.cells.map((c) => c.key)).toEqual(['zdarzenia', 'loty', 'blok', 'zrzuty']);
    expect(view.cells[0]?.value).toBe('184');
    expect(view.cells[1]?.value).toBe('17');
    // Blok formatuje `duration` z `@uzaero/format` — ten sam kod, co ekran 10 telefonu.
    expect(view.cells[2]?.value).toBe('9:47');
  });

  it('zrzuty pokazują KRESKĘ i karta mówi dlaczego', () => {
    // To jest reguła, nie wymówka: `null` znaczy „nie wiemy", a zero byłoby
    // twierdzeniem o świecie.
    expect(view.cells[3]?.value).toBe('—');
    expect(view.note).toContain('projekcja `sessions` nie niesie takich kolumn');
    expect(view.note).toContain('zamiast zera stoi kreska');
  });
});

describe('karta prowadzi do dni, które policzyła', () => {
  it('przejście zawęża listę dni do DOKŁADNIE tej doby UTC', () => {
    // Kafel liczący jedno, a prowadzący do czegoś innego, jest gorszy od kafla bez
    // przejścia: obiecuje i nie dotrzymuje.
    expect(dayView(totals()).to).toBe('/dni?od=2026-07-31&do=2026-07-31');
    expect(dayView(totals()).day).toBe('2026-07-31');
  });
});

describe('doba bez lotów', () => {
  it('mówi o braku PRZEJĘĆ, a nie wypisuje samych zer bez komentarza', () => {
    // Jednostką jest sesja, nie „dzień lotny": jedna maszyna bierze w dobie dwie
    // zmiany, a jeden pilot potrafi objąć dwie maszyny jedną służbą (§3.6a).
    const view = dayView(totals({ sessions: 0, aircraft: 0, flights: 0, blockMs: 0, eventsAccepted: 0 }));
    expect(view.note).toContain('Żadnej maszyny nie przejęto w tej dobie.');
    // Zera SĄ tu poprawne: serwer je policzył i wie, że nic nie było.
    expect(view.cells[1]?.value).toBe('0');
    expect(view.cells[2]?.value).toBe('0:00');
  });

  it('opisuje, że „zdarzenia" liczą PRZYJĘCIE, a nie czas zdarzenia', () => {
    // Paczka z wczoraj przyjęta dziś liczy się do dziś — bez tego zdania liczba
    // wyglądałaby na sprzeczną z listą dni.
    expect(dayView(totals()).note).toContain('paczka z wczoraj przyjęta dziś liczy się do dziś');
  });
});
