/**
 * Ninerdeck (serwer) - tempo ramek od klienta kanału klubu (`docs/kanal-klubu.md` §5).
 * Okno przesuwne: na styku dwóch okien nie przechodzi podwójna seria.
 */

import { describe, expect, it } from 'vitest';

import { FrameRate } from '../src/http/routes/common/liveRate.ts';

describe('tempo ramek od klienta', () => {
  it('przepuszcza limit w oknie, odrzuca następną, a po upływie okna znów przepuszcza', () => {
    const rate = new FrameRate({ frames: 3, windowMs: 1_000 });
    expect([rate.allow(0), rate.allow(100), rate.allow(200)]).toEqual([true, true, true]);
    expect(rate.allow(300)).toBe(false);
    // Pierwsza ramka wypada z okna dokładnie po `windowMs` - miejsce na jedną.
    expect(rate.allow(1_000)).toBe(true);
    expect(rate.allow(1_050)).toBe(false);
  });

  it('seria na styku dwóch okien nie przechodzi podwójnie', () => {
    const rate = new FrameRate({ frames: 2, windowMs: 1_000 });
    expect([rate.allow(900), rate.allow(950)]).toEqual([true, true]);
    // Kubełek „na pełną sekundę" przepuściłby tu dwie kolejne - okno przesuwne nie.
    expect([rate.allow(1_001), rate.allow(1_002)]).toEqual([false, false]);
  });
});
