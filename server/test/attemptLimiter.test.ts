/**
 * Ninerdeck (serwer) - licznik prób w oknie przesuwnym (`application/mobile/attemptLimiter.ts`).
 *
 * Jednostkowo, na sterowanym zegarze: trasa `POST /auth/join` ma własny przekrój
 * w `joinClub.test.ts`, a tu stoją własności SAMEGO licznika, które trudno pokazać
 * przez HTTP - kilka kluczy naraz, próba odbita bez wpływu na okno, sprzątanie.
 */

import { describe, expect, it } from 'vitest';

import { AttemptLimiter } from '../src/application/mobile/attemptLimiter.ts';
import { TestClock } from './helpers.ts';

const WINDOW = 60_000;

describe('AttemptLimiter', () => {
  it('przepuszcza do limitu, odbija następną z czasem do wygaśnięcia NAJSTARSZEJ próby', () => {
    const clock = new TestClock();
    const limiter = new AttemptLimiter(clock, WINDOW);
    const key = [{ key: 'person:a', limit: 3 }];

    expect(limiter.attempt(key)).toEqual({ allowed: true });
    clock.advance(10_000);
    expect(limiter.attempt(key)).toEqual({ allowed: true });
    clock.advance(10_000);
    expect(limiter.attempt(key)).toEqual({ allowed: true });

    // Trzy próby w oknie = limit: czwarta czeka, aż pierwsza (sprzed 20 s) wypadnie.
    expect(limiter.attempt(key)).toEqual({ allowed: false, retryAfterMs: WINDOW - 20_000 });

    clock.advance(WINDOW - 20_000 - 1);
    expect(limiter.attempt(key).allowed).toBe(false);
    clock.advance(1);
    expect(limiter.attempt(key)).toEqual({ allowed: true });
  });

  it('próba ODBITA nie liczy się do okna - blokada nie przedłuża się sama', () => {
    const clock = new TestClock();
    const limiter = new AttemptLimiter(clock, WINDOW);
    const key = [{ key: 'person:a', limit: 2 }];
    limiter.attempt(key);
    limiter.attempt(key);

    for (let i = 0; i < 5; i += 1) {
      clock.advance(1_000);
      expect(limiter.attempt(key).allowed).toBe(false);
    }
    // Pięć odbitych prób nic nie dołożyło: po oknie od DRUGIEJ dozwolonej droga jest wolna.
    clock.advance(WINDOW - 5_000);
    expect(limiter.attempt(key)).toEqual({ allowed: true });
  });

  it('kilka kluczy naraz: odmawia, gdy KTÓRYKOLWIEK jest pełny, i podaje dłuższe odczekanie', () => {
    const clock = new TestClock();
    const limiter = new AttemptLimiter(clock, WINDOW);
    const person = { key: 'person:a', limit: 10 };
    const ip = { key: 'ip:x', limit: 2 };

    expect(limiter.attempt([person, ip])).toEqual({ allowed: true });
    clock.advance(5_000);
    expect(limiter.attempt([person, ip])).toEqual({ allowed: true });
    // Osoba ma zapas, adres nie: odmowa liczona po adresie (najstarsza próba sprzed 5 s).
    expect(limiter.attempt([person, ip])).toEqual({ allowed: false, retryAfterMs: WINDOW - 5_000 });
    // Sama osoba bez tego adresu przechodzi - klucze są niezależne.
    expect(limiter.attempt([person])).toEqual({ allowed: true });
    // Próba odbita nie dopisała się osobie: 3 dozwolone z 10.
    expect(limiter.attempt([{ ...person, limit: 3 }]).allowed).toBe(false);
  });

  it('klucze bez prób w oknie znikają z pamięci - licznik nie rośnie bez końca', () => {
    const clock = new TestClock();
    const limiter = new AttemptLimiter(clock, WINDOW);
    for (let i = 0; i < 6_000; i += 1) limiter.attempt([{ key: `ip:${i}`, limit: 5 }]);
    clock.advance(WINDOW + 1);
    // Przy następnej próbie sprzątanie obejmuje wszystkie klucze, nie tylko dotknięty.
    limiter.attempt([{ key: 'ip:nowy', limit: 5 }]);
    const size = (limiter as unknown as { hits: Map<string, number[]> }).hits.size;
    expect(size).toBe(1);
  });
});
