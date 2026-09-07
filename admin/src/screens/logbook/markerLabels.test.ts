import { describe, expect, it } from 'vitest';

import { LABEL_OFFSET_X, visibleLabels, type LabelCandidate } from './markerLabels';

const at = (x: number, y: number, label = 'T/O 1'): LabelCandidate => ({ x, y, label });

describe('podpisy znaczników na śladzie', () => {
  it('lot po trasie zachowuje WSZYSTKIE podpisy - znaczniki stoją osobno', () => {
    expect(visibleLabels([at(100, 100), at(400, 250), at(700, 120)])).toEqual([true, true, true]);
  });

  it('dzień skokowy: kilkanaście znaczników w jednym miejscu daje JEDEN podpis', () => {
    // Dwanaście startów i lądowań z tego samego placu - rozrzut kilku pikseli.
    const cluster = Array.from({ length: 12 }, (_, i) =>
      at(300 + (i % 3), 200 + (i % 4), i % 2 === 0 ? `T/O ${i}` : `LDG ${i}`),
    );
    expect(visibleLabels(cluster).filter(Boolean)).toHaveLength(1);
  });

  it('podpis dostaje WCZEŚNIEJSZY znacznik - pierwszy start dnia nigdy nie gaśnie', () => {
    expect(visibleLabels([at(300, 200, 'T/O 1'), at(302, 201, 'LDG 1')])).toEqual([true, false]);
  });

  it('kropka zostaje zawsze - gasimy podpis, a lista ma tyle pozycji, co znaczniki', () => {
    const markers = [at(300, 200), at(301, 200), at(302, 200)];
    expect(visibleLabels(markers)).toHaveLength(markers.length);
  });

  it('rozsunięcie w PIONIE wystarcza - napis rośnie tylko w bok', () => {
    // 13 px w pionie to więcej niż pas napisu (2 × 6 px), więc oba się mieszczą.
    expect(visibleLabels([at(300, 200), at(300, 213)])).toEqual([true, true]);
  });

  it('rozsunięcie w POZIOMIE o tyle samo NIE wystarcza - „T/O 1" jest szerszy', () => {
    expect(visibleLabels([at(300, 200), at(313, 200)])).toEqual([true, false]);
  });

  it('miejsce zwalnia się dokładnie na SZEROKOŚCI napisu', () => {
    // „T/O 1" to 5 znaków × 6 px. Oba napisy stoją o `LABEL_OFFSET_X` od swojej kropki,
    // więc odsunięcie się skraca i decyduje sama długość tekstu.
    expect(LABEL_OFFSET_X).toBeGreaterThan(0);
    const justClear = 300 + 5 * 6;
    expect(visibleLabels([at(300, 200, 'T/O 1'), at(justClear, 200, 'T/O 2')])).toEqual([
      true,
      true,
    ]);
    expect(visibleLabels([at(300, 200, 'T/O 1'), at(justClear - 2, 200, 'T/O 2')])).toEqual([
      true,
      false,
    ]);
  });

  it('pusta lista nie wywraca przebiegu', () => {
    expect(visibleLabels([])).toEqual([]);
  });
});
