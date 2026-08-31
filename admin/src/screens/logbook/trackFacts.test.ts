/**
 * UZ Aero - panel 2.0: liczby pod śladem sesji.
 */

import { describe, expect, it } from 'vitest';

import type { SessionTrackDto } from '../../api/dto';
import { hasTrack, noTrackReason, trackFacts } from './trackFacts';

function track(over: Partial<SessionTrackDto> = {}): SessionTrackDto {
  return {
    sessionUuid: 'sess',
    line: [{ lat: 52, lon: 15, time: 1, altitudeFt: 1000, groundSpeedKt: 80 }],
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
    distanceNm: 12.34,
    maxAltitudeFt: 12000,
    startedAt: 1,
    endedAt: 2,
    totalCount: 1,
    usableCount: 1,
    stats: {
      speed: {
        maxGroundSpeedKt: 118.6,
        averageInFlightKt: 92,
        maxClimbFtPerMin: 800,
        maxDescentFtPerMin: -900,
      },
      phases: null,
      level: null,
    },
    ...over,
  };
}

describe('trackFacts', () => {
  it('podaje trzy liczby, po których się ten lot poznaje', () => {
    expect(trackFacts(track())).toEqual([
      { label: 'Dystans', value: '12.3 NM' },
      { label: 'Pułap', value: '12 000 ft' },
      { label: 'Prędkość maks.', value: '119 kt' },
    ]);
  });

  it('blok bez danych NIE ISTNIEJE - kreska wyglądałaby jak usterka', () => {
    const facts = trackFacts(
      track({ maxAltitudeFt: null, stats: { speed: null, phases: null, level: null } }),
    );

    expect(facts.map((f) => f.label)).toEqual(['Dystans']);
  });
});

describe('hasTrack', () => {
  it('pusta linia znaczy brak rysunku, nie pusty rysunek', () => {
    expect(hasTrack(track({ line: [] }))).toBe(false);
    expect(hasTrack(undefined)).toBe(false);
    expect(hasTrack(track())).toBe(true);
  });
});

describe('noTrackReason', () => {
  it('rozróżnia wpis ręczny od braku nagrania - to nie jest ten sam stan', () => {
    expect(noTrackReason(true)).not.toBe(noTrackReason(false));
    expect(noTrackReason(true)).toContain('ręcznie');
  });
});
