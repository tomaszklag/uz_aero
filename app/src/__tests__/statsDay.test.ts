/**
 * UZ Aero — test treści ekranu 10 (statystyki dnia).
 *
 * Ekran 10 jest ostatnim miejscem, w którym pilot widzi liczby dnia, zanim trafią do
 * arkusza — a jednocześnie jedynym, w którym może je jeszcze poprawić. Błąd tutaj nie
 * objawia się niczym: dzień „zgadza się" na ekranie i rozjeżdża w rozliczeniu miesiąca.
 *
 * Liczby scenariusza są te same, co w `projections.test.ts` i w mockupie: block 6:39,
 * 6 lotów, paliwo 150 +48 −110 = 88 L, MH 1234:30 → 1241:09.
 */

import {
  buildCrewCards,
  buildFlightRows,
  dateTimeUtcShort,
  flightsBadge,
  fuelPerHour,
  hhmm,
  jumperBreakdown,
} from '../ui/screens/statsDay';
import type { Flight, SessionState } from '../domain';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

function flight(index: number, from: [number, number], to: [number, number] | null, method: 'auto' | 'manual' = 'auto'): Flight {
  const takeoffAt = at(from[0], from[1]);
  const landingAt = to != null ? at(to[0], to[1]) : null;
  return {
    index,
    method,
    takeoffAt,
    landingAt,
    durationMs: landingAt != null ? landingAt - takeoffAt : 0,
    takeoffUuid: `to-${index}`,
    landingUuid: landingAt != null ? `ldg-${index}` : null,
  };
}

/** Minimalna projekcja — `buildCrewCards` czyta z niej tylko załogę i liczniki. */
function projection(over: Partial<SessionState> = {}): SessionState {
  return {
    picId: 'TMK',
    dualId: 'AKO',
    blockTimeMs: (6 * 60 + 39) * 60_000,
    takeoffCount: 6,
    landingCount: 6,
    ...over,
  } as SessionState;
}

describe('formaty ekranu 10', () => {
  it('czasy mają wiodące zero — kolumna cyfr ma się wyrównywać', () => {
    // `format.duration` daje „0:53" (04/09); tabela 10 wymaga „00:53".
    expect(hhmm(53 * 60_000)).toBe('00:53');
    expect(hhmm((6 * 60 + 39) * 60_000)).toBe('06:39');
    expect(hhmm((8 * 60 + 45) * 60_000)).toBe('08:45');
    expect(hhmm(-1)).toBe('00:00');
  });

  it('termin okna korekty niesie datę, bo prawie zawsze wypada nazajutrz', () => {
    expect(dateTimeUtcShort(at(16, 45) + 24 * 3_600_000)).toBe('23 JUN 16:45');
  });

  it('badge lotów odmienia się przez trzy formy liczby mnogiej', () => {
    expect(flightsBadge(1)).toBe('1 lot');
    expect(flightsBadge(3)).toBe('3 loty');
    expect(flightsBadge(6)).toBe('6 lotów');
    expect(flightsBadge(0)).toBe('0 lotów');
    // 12–14 są wyjątkiem od reguły „końcówka 2–4".
    expect(flightsBadge(12)).toBe('12 lotów');
    expect(flightsBadge(22)).toBe('22 loty');
  });
});

describe('lista lotów', () => {
  const flights = [
    flight(1, [8, 25], [9, 18]),
    flight(2, [9, 35], [10, 22]),
    flight(5, [14, 21], [15, 3], 'manual'),
  ];

  it('przepisuje czasy w UTC i długość lotu z projekcji', () => {
    const rows = buildFlightRows(flights);
    expect(rows.map((r) => [r.no, r.takeoff, r.landing, r.time])).toEqual([
      ['1', '08:25', '09:18', '00:53'],
      ['2', '09:35', '10:22', '00:47'],
      ['5', '14:21', '15:03', '00:42'],
    ]);
  });

  it('rozróżnia wzlot wykryty od wpisanego ręcznie', () => {
    const rows = buildFlightRows(flights);
    expect(rows.map((r) => r.methodLabel)).toEqual(['AUTO', 'AUTO', 'RĘCZNIE']);
  });

  it('zostawia lot bez lądowania w tabeli — to on wymaga korekty', () => {
    const rows = buildFlightRows([flight(1, [8, 25], null)]);
    expect(rows[0]!.landing).toBe('—');
    expect(rows[0]!.time).toBe('—');
  });
});

describe('rozliczenia dnia', () => {
  it('średnie zużycie liczy się na block time, nie na czas lotu', () => {
    // 110 L na 6:39 bloku ≈ 16,5 L/h → 17 L/H (liczba z mockupu).
    expect(fuelPerHour(110, (6 * 60 + 39) * 60_000)).toBe('17 L/H');
  });

  it('bez odczytu końcowego albo bez pracy silnika nie zmyśla wyniku', () => {
    expect(fuelPerHour(null, (6 * 60 + 39) * 60_000)).toBeNull();
    expect(fuelPerHour(110, 0)).toBeNull();
  });

  it('rozbicie skoczków pomija typy, których nie było', () => {
    expect(jumperBreakdown({ tandem: 12, aff: 6, solo: 4 })).toBe('12 TANDEM · 6 AFF · 4 SOLO');
    expect(jumperBreakdown({ tandem: 12, aff: 0, solo: 4 })).toBe('12 TANDEM · 4 SOLO');
    expect(jumperBreakdown({ tandem: 0, aff: 0, solo: 0 })).toBe('—');
  });
});

describe('karty załogi', () => {
  it('oznacza kartę zalogowanego i tłumaczy identyfikatory na kody', () => {
    const [pic, dual] = buildCrewCards(projection(), 'TMK', (id) => `${id}`, false);

    expect(pic!.role).toBe('PIC · zalogowany (Ty)');
    expect(pic!.active).toBe(true);
    expect(pic!.code).toBe('TMK');
    expect(dual!.role).toBe('Dual · drugi pilot');
    expect(dual!.code).toBe('AKO');
    expect(dual!.active).toBe(false);
  });

  it('nie przypisuje Dualowi startów i lądowań PIC-a', () => {
    const [pic, dual] = buildCrewCards(projection(), 'TMK', (id) => id, false);

    // Ten sam czas na pokładzie…
    expect(pic!.stats[0]).toEqual({ key: 'Block time', value: '06:39' });
    expect(dual!.stats[0]).toEqual({ key: 'Block time', value: '06:39' });
    // …ale wzloty zapisuje PIC (single-writer §4.1) i tylko jemu są przypisane.
    expect(pic!.stats[1]).toEqual({ key: 'St / Ld', value: '6 / 6' });
    expect(dual!.stats[1]).toEqual({ key: 'St / Ld', value: '0 / 0' });
  });

  it('nie mówi „(Ty)" na cudzej karcie PIC (podgląd read-only)', () => {
    const [pic] = buildCrewCards(projection(), 'KRZ', (id) => id, false);
    expect(pic!.role).toBe('PIC · zalogowany');
  });

  it('po zmianie załogi milczy zamiast obiecywać pełny dzień', () => {
    const [pic, dual] = buildCrewCards(projection(), 'TMK', (id) => id, true);
    expect(pic!.tag).toBeNull();
    expect(dual!.tag).toBeNull();

    const [picFull] = buildCrewCards(projection(), 'TMK', (id) => id, false);
    expect(picFull!.tag).toBe('Pełny dzień');
  });

  it('dzień jednoosobowy pokazuje pustą kartę Duala, a nie wyzerowane statystyki', () => {
    const [, dual] = buildCrewCards(projection({ dualId: null }), 'TMK', (id) => id, false);
    expect(dual!.emptyText).not.toBeNull();
    expect(dual!.stats).toEqual([]);
    expect(dual!.tag).toBeNull();
  });
});
