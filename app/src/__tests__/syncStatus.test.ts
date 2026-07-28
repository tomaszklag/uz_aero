/**
 * UZ Aero — testy logiki prezentacji ekranu 11 (`screens/syncStatus.ts`).
 *
 * Warte pilnowania: odmiana liczebników (etykiety idą wprost do pilota), konwencja
 * nazwy karty arkusza §4.7 (musi być bajt w bajt zgodna z tym, co wygeneruje serwer)
 * i przycinanie licznika wysyłki, gdy outbox niesie ogon poprzednich dni.
 */

import type { SessionState } from '../domain';
import {
  dropsShort,
  dropsSummary,
  eventsCount,
  flagLabel,
  fuelEquation,
  fuelSummary,
  sentLabel,
  sentProgress,
  sheetTabName,
} from '../ui/screens/syncStatus';

describe('eventsCount — polska liczba mnoga', () => {
  it.each([
    [1, '1 zdarzenie'],
    [2, '2 zdarzenia'],
    [4, '4 zdarzenia'],
    [5, '5 zdarzeń'],
    [12, '12 zdarzeń'], // 12–14 to zawsze „zdarzeń", mimo końcówki 2–4
    [14, '14 zdarzeń'],
    [22, '22 zdarzenia'],
    [47, '47 zdarzeń'],
  ])('%i → %s', (n, expected) => {
    expect(eventsCount(n)).toBe(expected);
  });
});

describe('sheetTabName — konwencja §4.7', () => {
  it('YYYY-MM-DD_REG z daty UTC (dopełnianie zerami)', () => {
    expect(sheetTabName(Date.UTC(2026, 5, 22, 8, 0), 'SP-AXA')).toBe('2026-06-22_SP-AXA');
    expect(sheetTabName(Date.UTC(2026, 0, 3), 'SP-FGK')).toBe('2026-01-03_SP-FGK');
  });

  it('granica doby liczy się w UTC, nie w czasie lokalnym', () => {
    // 23:59 UTC to wciąż 22 czerwca, niezależnie od strefy telefonu.
    expect(sheetTabName(Date.UTC(2026, 5, 22, 23, 59), 'SP-AXA')).toBe('2026-06-22_SP-AXA');
  });

  it('bez dnia albo samolotu nie ma nazwy — null, nie zlepek z „null"', () => {
    expect(sheetTabName(null, 'SP-AXA')).toBeNull();
    expect(sheetTabName(Date.UTC(2026, 5, 22), null)).toBeNull();
  });
});

describe('sentProgress + sentLabel', () => {
  it('komplet: 47/47 z dopiskiem „na serwer" (mockup 11)', () => {
    const p = sentProgress(47, 0);
    expect(p).toEqual({ sent: 47, total: 47, fraction: 1 });
    expect(sentLabel(p.sent, p.total)).toBe('47 / 47 zdarzeń wysłanych na serwer');
  });

  it('zaległość: 35/47 bez dopisku (mockup 11a)', () => {
    const p = sentProgress(47, 12);
    expect(p.sent).toBe(35);
    expect(p.fraction).toBeCloseTo(35 / 47, 5);
    expect(sentLabel(p.sent, p.total)).toBe('35 / 47 zdarzeń wysłanych');
  });

  it('outbox z ogonem poprzednich dni nie robi ujemnych „wysłanych"', () => {
    expect(sentProgress(3, 10)).toEqual({ sent: 0, total: 3, fraction: 0 });
  });

  it('pusta sesja = komplet (nie dzielimy przez zero)', () => {
    expect(sentProgress(0, 0).fraction).toBe(1);
  });
});

describe('flagLabel', () => {
  it('typy §4.5 mają polskie nazwy z mockupu', () => {
    expect(flagLabel('mh_gap')).toBe('dziura MH');
    expect(flagLabel('mh_regression')).toBe('cofnięty licznik');
    expect(flagLabel('session_overlap')).toBe('nakładka czasowa');
  });

  it('nieznany typ wraca surowy — lepszy kod niż zgadywana etykieta', () => {
    expect(flagLabel('clock_drift')).toBe('clock_drift');
  });
});

const FUEL: SessionState['fuel'] = {
  startL: 150,
  addedL: 48,
  endL: 88,
  consumedL: 110,
  lastReadingL: 88,
};

describe('paliwo — stopka podglądu i wiersz karty lokalnej', () => {
  it('kanoniczny dzień: 150 → 88 L · dolane +48 L · zużyte 110 L', () => {
    expect(fuelSummary(FUEL)).toBe('150 → 88 L · dolane +48 L · zużyte 110 L');
    expect(fuelEquation(FUEL)).toBe('150 +48 −110 = 88 L');
  });

  it('dzień bez tankowania i bez odczytu końcowego — bez pustych członów', () => {
    const open: SessionState['fuel'] = {
      startL: 150,
      addedL: 0,
      endL: null,
      consumedL: null,
      lastReadingL: 150,
    };
    expect(fuelSummary(open)).toBe('150 → — L');
    expect(fuelEquation(open)).toBe('150 = — L');
  });

  it('przed preflightem nie ma nic do pokazania', () => {
    expect(
      fuelEquation({ startL: null, addedL: 0, endL: null, consumedL: null, lastReadingL: null }),
    ).toBe('—');
  });
});

describe('zrzuty — rozliczenie w stopce', () => {
  const drops: SessionState['drops'] = {
    count: 6,
    totalJumpers: 22,
    jumpers: { tandem: 12, aff: 6, solo: 4 },
    avgAltitudeFt: 13000,
  };

  it('kanoniczny dzień z klientem (mockup 11)', () => {
    expect(dropsSummary(drops, 'SKY CAMP 2026/114')).toBe(
      '6 wyniesień · 22 skoczków (12 tandem / 6 AFF / 4 solo) · klient SKY CAMP 2026/114',
    );
  });

  it('zerowe typy skoków i brak klienta znikają z opisu', () => {
    const tandemOnly: SessionState['drops'] = {
      count: 2,
      totalJumpers: 4,
      jumpers: { tandem: 4, aff: 0, solo: 0 },
      avgAltitudeFt: null,
    };
    expect(dropsSummary(tandemOnly, null)).toBe('2 wyniesienia · 4 skoczków (4 tandem)');
  });

  it('odmiana: 1 wyniesienie / 1 skoczek', () => {
    const single: SessionState['drops'] = {
      count: 1,
      totalJumpers: 1,
      jumpers: { tandem: 0, aff: 0, solo: 1 },
      avgAltitudeFt: null,
    };
    expect(dropsShort(single)).toBe('1 wyniesienie · 1 skoczek');
  });
});
