/**
 * UZ Aero - panel 2.0: znaczniki na śladzie sesji.
 *
 * Sedno: znacznik ma stać tam, gdzie samolot BYŁ, albo nie stać wcale. Test pilnuje obu
 * połówek tego zdania - dopasowania po czasie i milczenia, gdy nagranie chwili nie
 * obejmuje.
 */

import { describe, expect, it } from 'vitest';

import type { SessionTrackDto } from '../../api/dto';
import { MAX_MATCH_MS, trackMarkers } from './trackMarkers';

const T = Date.UTC(2026, 5, 22, 8, 0);
const min = (m: number): number => T + m * 60_000;

function track(times: number[]): SessionTrackDto {
  return {
    sessionUuid: 'sess',
    line: times.map((time, i) => ({
      lat: 52 + i / 100,
      lon: 15 + i / 100,
      time,
      altitudeFt: 1000,
      groundSpeedKt: 80,
    })),
    profile: {
      samples: [],
      peakAt: null,
      peakAltitudeFt: null,
      timeToPeakMs: null,
      startAltitudeFt: null,
      endAltitudeFt: null,
      averageClimbFtPerMin: null,
      averageDescentFtPerMin: null,
    },
    distanceNm: 0,
    maxAltitudeFt: null,
    startedAt: times[0] ?? null,
    endedAt: times[times.length - 1] ?? null,
    totalCount: times.length,
    usableCount: times.length,
    stats: { speed: null, phases: null, level: null },
  };
}

describe('trackMarkers', () => {
  it('stawia parę znaczników na każdy lot i numeruje je lotem', () => {
    const markers = trackMarkers(track([min(0), min(10), min(20), min(30)]), [
      { index: 1, takeoffAt: min(0), landingAt: min(10) },
      { index: 2, takeoffAt: min(20), landingAt: min(30) },
    ]);

    expect(markers.map((m) => m.label)).toEqual(['T/O 1', 'LDG 1', 'T/O 2', 'LDG 2']);
  });

  it('wybiera wierzchołek NAJBLIŻSZY w czasie, nie pierwszy z brzegu', () => {
    const markers = trackMarkers(track([min(0), min(1), min(2)]), [
      { index: 1, takeoffAt: min(2), landingAt: null },
    ]);

    // Trzeci wierzchołek: lat 52.02 (i = 2).
    expect(markers[0]!.position.lat).toBeCloseTo(52.02, 5);
  });

  it('nie stawia znacznika, gdy nagranie nie obejmuje tej chwili', () => {
    // Ślad urywa się na 10. minucie, lądowanie jest na 40.
    const markers = trackMarkers(track([min(0), min(10)]), [
      { index: 1, takeoffAt: min(0), landingAt: min(40) },
    ]);

    expect(markers.map((m) => m.label)).toEqual(['T/O 1']);
  });

  it('granica dopasowania jest domknięta - dokładnie `MAX_MATCH_MS` jeszcze liczy', () => {
    const markers = trackMarkers(track([min(0)]), [
      { index: 1, takeoffAt: min(0) + MAX_MATCH_MS, landingAt: null },
    ]);

    expect(markers).toHaveLength(1);
  });

  it('lot bez lądowania (operacja w toku) daje sam start', () => {
    const markers = trackMarkers(track([min(0), min(5)]), [
      { index: 1, takeoffAt: min(0), landingAt: null },
    ]);

    expect(markers.map((m) => m.label)).toEqual(['T/O 1']);
  });

  it('pierścień dostaje WYŁĄCZNIE pierwszy start - w dniu skokowym reszta byłaby szumem', () => {
    const markers = trackMarkers(track([min(0), min(10), min(20), min(30)]), [
      { index: 1, takeoffAt: min(0), landingAt: min(10) },
      { index: 2, takeoffAt: min(20), landingAt: min(30) },
    ]);

    expect(markers.filter((m) => m.ring === true).map((m) => m.label)).toEqual(['T/O 1']);
  });

  it('operacja bez nagrania nie ma ani jednego znacznika', () => {
    const markers = trackMarkers(track([]), [{ index: 1, takeoffAt: min(0), landingAt: min(10) }]);

    expect(markers).toEqual([]);
  });
});
