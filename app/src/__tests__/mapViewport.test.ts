/**
 * UZ Aero — kadr mapy śladu: przybliżenie i przesunięcie (issue #47 pkt 8).
 *
 * Trzy reguły, które na urządzeniu psują się najciszej i najbardziej wkurzająco:
 * ognisko szczypty ucieka spod palców, mapa daje się odsunąć w pustkę, a powrót do
 * całości nie wraca do całości. Wszystkie trzy dają się przybić liczbą.
 */

import {
  applyViewport,
  clampViewport,
  IDENTITY_VIEWPORT,
  isZoomed,
  MAX_MAP_SCALE,
  panViewport,
  pinchViewport,
  unapplyViewport,
} from '../ui/screens/logic/mapViewport';

const SIZE = { width: 340, height: 300 };

describe('kadr mapy — szczypta', () => {
  it('punkt między palcami zostaje NIERUCHOMY', () => {
    const focus = { x: 120, y: 90 };
    const before = unapplyViewport(focus, IDENTITY_VIEWPORT);

    const zoomed = pinchViewport(IDENTITY_VIEWPORT, focus, 2.4, SIZE);
    const after = applyViewport(before, zoomed);

    expect(after.x).toBeCloseTo(focus.x, 6);
    expect(after.y).toBeCloseTo(focus.y, 6);
  });

  it('składanie szczypt jest przemienne z jednym większym gestem', () => {
    const focus = { x: 200, y: 150 };
    const dwaKroki = pinchViewport(pinchViewport(IDENTITY_VIEWPORT, focus, 1.5, SIZE), focus, 2, SIZE);
    const jeden = pinchViewport(IDENTITY_VIEWPORT, focus, 3, SIZE);

    expect(dwaKroki.scale).toBeCloseTo(jeden.scale, 6);
    expect(dwaKroki.offsetX).toBeCloseTo(jeden.offsetX, 6);
  });

  it('nie przybliża w nieskończoność ani nie oddala poniżej całości', () => {
    const focus = { x: 170, y: 150 };

    let vp = IDENTITY_VIEWPORT;
    for (let i = 0; i < 20; i++) vp = pinchViewport(vp, focus, 2, SIZE);
    expect(vp.scale).toBe(MAX_MAP_SCALE);

    for (let i = 0; i < 20; i++) vp = pinchViewport(vp, focus, 0.5, SIZE);
    expect(vp.scale).toBe(1);
    // Powrót do całości MUSI wrócić do zera — inaczej mapa zostaje przesunięta
    // w bok i pilot widzi pustkę zamiast trasy.
    expect(vp.offsetX).toBe(0);
    expect(vp.offsetY).toBe(0);
  });
});

describe('kadr mapy — przesuwanie', () => {
  it('bez przybliżenia mapa stoi w miejscu', () => {
    const moved = panViewport(IDENTITY_VIEWPORT, 60, -40, SIZE);

    expect(moved).toEqual(IDENTITY_VIEWPORT);
  });

  it('przybliżona mapa nie daje się odsunąć poza własną krawędź', () => {
    const zoomed = pinchViewport(IDENTITY_VIEWPORT, { x: 170, y: 150 }, 3, SIZE);

    const tooFarRight = panViewport(zoomed, 5_000, 0, SIZE);
    const tooFarLeft = panViewport(zoomed, -5_000, 0, SIZE);

    expect(tooFarRight.offsetX).toBe(0);
    expect(tooFarLeft.offsetX).toBeCloseTo(SIZE.width * (1 - zoomed.scale), 6);
  });

  it('przesunięcie w środku zakresu przechodzi bez zmian', () => {
    const zoomed = clampViewport({ scale: 3, offsetX: -300, offsetY: -300 }, SIZE);
    const moved = panViewport(zoomed, 20, 15, SIZE);

    expect(moved.offsetX).toBe(-280);
    expect(moved.offsetY).toBe(-285);
  });
});

describe('kadr mapy — stan', () => {
  it('rozpoznaje przybliżenie z zapasem na błąd zmiennoprzecinkowy', () => {
    expect(isZoomed(IDENTITY_VIEWPORT)).toBe(false);
    expect(isZoomed({ scale: 1.0005, offsetX: 0, offsetY: 0 })).toBe(false);
    expect(isZoomed({ scale: 1.4, offsetX: 0, offsetY: 0 })).toBe(true);
  });

  it('przeliczenie w obie strony jest odwracalne', () => {
    const vp = pinchViewport(IDENTITY_VIEWPORT, { x: 90, y: 220 }, 2.4, SIZE);
    const base = { x: 130, y: 44 };

    const back = unapplyViewport(applyViewport(base, vp), vp);

    expect(back.x).toBeCloseTo(base.x, 6);
    expect(back.y).toBeCloseTo(base.y, 6);
  });
});
