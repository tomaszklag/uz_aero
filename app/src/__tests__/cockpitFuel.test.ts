/**
 * UZ Aero — paliwo na ekranie 04: jedna liczba, jedno miejsce.
 *
 * Test pilnuje reguły, a nie napisów: **litry nie mają prawa pojawić się dwa razy na
 * jednym ekranie, ale nie mają też prawa zniknąć**. Pasek paliwa istnieje tylko wtedy,
 * gdy mówi coś ponad liczbę (jest norma → jest wystarczalność), a kafelek „Tankowanie"
 * przejmuje stan zbiorników dokładnie wtedy, gdy paska nie ma — również po tankowaniu,
 * bo to najłatwiejszy sposób zgubienia FOB z całego kokpitu.
 */

import { buildCockpitFuel } from '../ui/screens/logic/cockpitFuel';
import type { ConsumptionNorm } from '../domain';

/** Norma SP-AXA z mockupu 06: pasmo 15–17 L/h, okno 90 dni. */
const norm = (over: Partial<ConsumptionNorm> = {}): ConsumptionNorm => ({
  windowDays: 90,
  blockLPerHLow: 15,
  blockLPerHHigh: 17,
  blockLPerH: 16,
  airLPerH: 20,
  litersPerFlight: 22,
  intervals: 96,
  engineMs: 118 * 3_600_000,
  computedAt: Date.UTC(2026, 5, 21, 17, 30),
  ...over,
});

describe('samolot Z normą — pasek jest przyrządem', () => {
  it('pasek dostaje szacunek i adnotację o źródle', () => {
    const view = buildCockpitFuel({ fobL: 111, addedL: 0, norm: norm() });

    expect(view.strip).not.toBeNull();
    expect(view.strip!.endurance).toMatch(/^wystarczy na ~/);
    expect(view.strip!.source).toBe(
      'szacunek z normy samolotu (90 dni) — decyduje paliwomierz',
    );
  });

  it('kafelek NIE powtarza litrów paska — zaprasza do akcji', () => {
    expect(buildCockpitFuel({ fobL: 111, addedL: 0, norm: norm() }).refuelSub).toBe(
      'Dolej i zapisz odczyt',
    );
  });

  it('dzisiejsza dolewka to fakt, którego pasek nie zna — kafelek ją melduje', () => {
    expect(buildCockpitFuel({ fobL: 156, addedL: 45, norm: norm() }).refuelSub).toBe(
      'Dolane dziś: 45 L',
    );
  });
});

describe('samolot BEZ normy — paska nie ma, litry niesie kafelek', () => {
  it('pasek bez szacunku byłby samą liczbą, więc go nie ma', () => {
    expect(buildCockpitFuel({ fobL: 111, addedL: 0, norm: null }).strip).toBeNull();
  });

  it('kafelek przejmuje stan zbiorników', () => {
    expect(buildCockpitFuel({ fobL: 111, addedL: 0, norm: null }).refuelSub).toBe(
      'Na pokładzie: 111 L',
    );
  });

  it('po tankowaniu kafelek niesie OBIE liczby — inaczej FOB znika z ekranu', () => {
    // Sedno tego testu: „Dolane dziś" jako jedyny podpis wypychało stan na pokładzie
    // z kokpitu, w którym nie ma już paska.
    expect(buildCockpitFuel({ fobL: 156, addedL: 45, norm: null }).refuelSub).toBe(
      'Na pokładzie: 156 L · dolane 45 L',
    );
  });

  it('brak odczytu mówi „—", zamiast udawać zero litrów', () => {
    expect(buildCockpitFuel({ fobL: null, addedL: 0, norm: null }).refuelSub).toBe(
      'Na pokładzie: —',
    );
  });

  it('norma bez policzalnej wystarczalności też nie stawia paska', () => {
    // Pusty zbiornik: norma jest, ale nie ma z czego liczyć zapasu nad rezerwą.
    expect(buildCockpitFuel({ fobL: 0, addedL: 0, norm: norm() }).strip).toBeNull();
  });
});
