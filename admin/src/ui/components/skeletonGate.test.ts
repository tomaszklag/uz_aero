import { describe, expect, it } from 'vitest';

import { remainingHoldMs, SKELETON_DELAY_MS, SKELETON_MIN_MS } from './skeletonGate';

describe('próg i minimum', () => {
  it('minimum jest DŁUŻSZE od progu', () => {
    // Inaczej plamki gasłyby, zanim oko zdąży je zauważyć - czyli dokładnie tym
    // błyskiem, przed którym oba te progi mają bronić.
    expect(SKELETON_MIN_MS).toBeGreaterThan(SKELETON_DELAY_MS);
  });
});

describe('ile jeszcze trzymać plamki', () => {
  it('nigdy, jeśli nigdy się nie pokazały', () => {
    expect(remainingHoldMs(null, 10_000)).toBe(0);
  });

  it('resztę minimum, gdy dane przyszły zaraz po pokazaniu', () => {
    expect(remainingHoldMs(1_000, 1_100)).toBe(SKELETON_MIN_MS - 100);
  });

  it('zero, gdy minimum już minęło', () => {
    expect(remainingHoldMs(1_000, 1_000 + SKELETON_MIN_MS)).toBe(0);
    expect(remainingHoldMs(1_000, 9_000)).toBe(0);
  });

  it('nigdy wartości ujemnej', () => {
    expect(remainingHoldMs(1_000, 100_000)).toBeGreaterThanOrEqual(0);
  });
});
