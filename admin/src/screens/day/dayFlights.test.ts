/**
 * UZ Aero — panel: tabela lotów karty dnia (moduł czysty).
 *
 * Loty i ich czasy policzyła projekcja — tutaj sprawdzamy wyłącznie to, czego typy
 * nie pilnują: przypisanie lotu do cyklu silnika, lot trwający (który nie ma jeszcze
 * czego mierzyć) i lot spoza cykli (wpis ręczny).
 */

import type { SessionState } from '@uzaero/domain';
import { describe, expect, it } from 'vitest';

import { flightRows } from './dayFlights';

const DAY = Date.UTC(2026, 6, 30);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

const run = (from: [number, number], to: [number, number] | null) => ({
  startedAt: at(from[0], from[1]),
  stoppedAt: to == null ? null : at(to[0], to[1]),
  durationMs: to == null ? 0 : at(to[0], to[1]) - at(from[0], from[1]),
});

const flight = (
  index: number,
  takeoff: [number, number],
  landing: [number, number] | null,
  method: 'auto' | 'manual' = 'auto',
) => ({
  index,
  method,
  takeoffAt: at(takeoff[0], takeoff[1]),
  landingAt: landing == null ? null : at(landing[0], landing[1]),
  durationMs: landing == null ? 0 : at(landing[0], landing[1]) - at(takeoff[0], takeoff[1]),
  takeoffUuid: `to-${index}`,
  landingUuid: landing == null ? null : `ldg-${index}`,
});

const state = (over: Partial<SessionState>): SessionState =>
  ({ engineRuns: [], flights: [], ...over }) as unknown as SessionState;

describe('flightRows', () => {
  it('przypisuje lot do CYKLU SILNIKA, w którym się zaczął', () => {
    // To jest przypisanie, nie wyliczenie: obie strony policzyła projekcja,
    // a warunek jest zawarciem startu w przedziale cyklu.
    const rows = flightRows(
      state({
        engineRuns: [run([6, 31], [8, 41]), run([9, 12], [11, 38]), run([11, 56], [13, 13])],
        flights: [
          flight(1, [6, 38], [7, 2]),
          flight(2, [9, 20], [9, 44]),
          flight(3, [12, 3], [12, 28]),
        ],
      }),
    );

    expect(rows.map((r) => r.cycle)).toEqual(['1', '2', '3']);
  });

  it('cykl TRWAJĄCY obejmuje wszystko po swoim starcie', () => {
    // Tak samo traktuje go `projectSession` przy liczeniu czasu blokowego.
    const rows = flightRows(
      state({ engineRuns: [run([11, 56], null)], flights: [flight(1, [12, 3], null)] }),
    );
    expect(rows[0]!.cycle).toBe('1');
  });

  it('lot POZA cyklami mówi „—" i to jest prawdziwa odpowiedź', () => {
    // Wpis ręczny (`manual_log_entry`) wnosi lot bez pary zdarzeń silnika, więc do
    // żadnego cyklu nie należy. „1" byłoby zmyśleniem, a puste pole — brakiem danych.
    const rows = flightRows(
      state({ engineRuns: [run([6, 31], [8, 41])], flights: [flight(9, [12, 35], [12, 59], 'manual')] }),
    );
    expect(rows[0]!.cycle).toBe('—');
    expect(rows[0]!.method).toEqual({ label: 'ręcznie', tone: 'amber' });
  });

  it('lot W POWIETRZU nie pokazuje „00:00" — nie ma jeszcze czego mierzyć', () => {
    // Projekcja trzyma `durationMs === 0` dla lotu otwartego („wartości na żywo NIE
    // wchodzą do sum"). Wypisanie zera sugerowałoby lot zerowej długości.
    const rows = flightRows(
      state({ engineRuns: [run([11, 56], null)], flights: [flight(1, [12, 3], null)] }),
    );

    expect(rows[0]!.open).toBe(true);
    expect(rows[0]!.landing).toBe('—');
    expect(rows[0]!.duration).toBe('—');
  });

  it('czasy lotów mają sekundy i wiodące zero, jak reszta karty dnia', () => {
    const rows = flightRows(
      state({ engineRuns: [run([6, 31], [8, 41])], flights: [flight(1, [6, 38], [7, 2])] }),
    );

    expect(rows[0]!.takeoff).toBe('06:38:00');
    expect(rows[0]!.landing).toBe('07:02:00');
    expect(rows[0]!.duration).toBe('00:24');
  });
});
