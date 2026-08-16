/**
 * UZ Aero — podziałka ODLEGŁOŚCI na profilu (issue #47, trzecia tura przeglądu).
 *
 * Profil ma oś czasu, a podziałka pokazuje drogę — więc łatwo tu o liczbę, która nie
 * opisuje niczego. Test pilnuje, że pasek jest prawdziwy DLA MIEJSCA, w którym stoi:
 * ładna liczba mil, a długość paska wzięta z faktycznego przebiegu, nie ze średniej.
 */

import { distanceScaleBar } from '../ui/components/data/distanceScaleBar';

const PLOT_W = 260;

/** Lot ze stałą prędkością: droga rośnie liniowo z X. */
const liniowo = (nmNaCalosc: number) => (x: number) => (x / PLOT_W) * nmNaCalosc;

describe('podziałka odległości', () => {
  it('podaje ładną liczbę mil z ciągu 1-2-5', () => {
    const scale = distanceScaleBar(liniowo(38), PLOT_W, 70)!;

    const mantissa = scale.nm / 10 ** Math.floor(Math.log10(scale.nm));
    expect([1, 2, 5]).toContain(Math.round(mantissa));
    expect(scale.label).toBe(`${scale.nm} NM`);
  });

  it('pasek mieści się w limicie i odpowiada zadeklarowanej drodze', () => {
    const distance = liniowo(38);
    const scale = distanceScaleBar(distance, PLOT_W, 70)!;

    expect(scale.pixels).toBeLessThanOrEqual(70);
    // Na tym końcu paska droga ma wynosić dokładnie tyle, ile mówi podpis.
    expect(distance(scale.pixels)).toBeCloseTo(scale.nm, 1);
  });

  it('DŁUGOŚĆ PASKA zależy od miejsca lotu, nie od średniej', () => {
    // Pierwsza połowa kadru: 2 NM (krążenie). Druga: 20 NM (przelot).
    const zmienna = (x: number) =>
      x <= PLOT_W / 2 ? (x / (PLOT_W / 2)) * 2 : 2 + ((x - PLOT_W / 2) / (PLOT_W / 2)) * 20;

    const wolno = distanceScaleBar(zmienna, PLOT_W, 70)!;
    const szybko = distanceScaleBar((x) => zmienna(x + PLOT_W / 2) - 2, PLOT_W / 2, 70)!;

    // Ta sama mila zajmuje na wolnym odcinku WIĘCEJ ekranu niż na szybkim.
    expect(wolno.pixels / wolno.nm).toBeGreaterThan(szybko.pixels / szybko.nm);
  });

  it('postój przy pracującym silniku NIE dostaje podziałki', () => {
    // Samolot stoi: droga się nie zmienia, więc „ile pikseli na milę" nie istnieje.
    expect(distanceScaleBar(() => 12.5, PLOT_W, 70)).toBeNull();
  });

  it('brak śladu nie produkuje paska', () => {
    expect(distanceScaleBar(() => null, PLOT_W, 70)).toBeNull();
    expect(distanceScaleBar(liniowo(38), 0, 70)).toBeNull();
  });

  it('bardzo krótki odcinek dostaje krok w dziesiątych częściach mili', () => {
    const scale = distanceScaleBar(liniowo(0.9), PLOT_W, 70)!;

    expect(scale.nm).toBeLessThan(1);
    expect(scale.label).toMatch(/^0\.[125] NM$/);
  });
});
