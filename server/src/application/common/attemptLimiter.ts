/**
 * Ninerdeck (serwer) - OGRANICZENIE TEMPA prób w oknie czasu (wielofirmowość §3.8, §5:
 * `POST /auth/join` - 10 prób na osobę i 30 na adres IP w 15 minut).
 *
 * ══ LICZNIK W PAMIĘCI PROCESU I TO JEST DECYZJA ══
 * `docs/architektura-panelu-serwer.md` §8.8: instancja serwera jest JEDNA, więc tabela
 * w Postgresie byłaby kosztem bez zysku. Gdy instancji będzie więcej, ten moduł zmienia
 * adapter, nie wołających: komenda zna wyłącznie `attempt()`. Restart procesu zeruje
 * liczniki - i to jest przyjęte: kod klubu daje najwyżej zgłoszenie do rozpatrzenia,
 * a ograniczenie ma zniechęcić do zgadywania, nie zastąpić sekret.
 *
 * ══ OKNO PRZESUWNE, PRÓBA ZABLOKOWANA NIE LICZY SIĘ ══
 * Liczą się próby DOZWOLONE (udane i nieudane razem); próba odbita `429` nie przedłuża
 * blokady, bo wtedy pilot, który pomylił się kilka razy i tapie dalej, nigdy by z niej
 * nie wyszedł. Czas odczekania mówi, kiedy najstarsza z ostatnich `limit` prób wypadnie
 * z okna - dokładnie wtedy następna próba przejdzie.
 *
 * Moduł CZYSTY: zegar przychodzi portem, więc test przesuwa okno jawnie, bez spania.
 */

import type { Clock } from '../common/ports.ts';

export interface AttemptKey {
  /** Np. `person:<id>` albo `ip:<adres>` - przestrzenie nazw rozdziela wołający. */
  key: string;
  limit: number;
}

export type AttemptVerdict = { allowed: true } | { allowed: false; retryAfterMs: number };

/** Powyżej tylu kluczy w pamięci sprzątamy wszystkie naraz, nie tylko dotknięte. */
const SWEEP_ABOVE_KEYS = 5_000;

export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly clock: Clock,
    private readonly windowMs: number,
  ) {}

  /**
   * Jedna próba pod KAŻDYM z kluczy naraz. Przekroczony choć jeden limit = odmowa
   * z najdłuższym czasem odczekania; inaczej próba zapisuje się pod wszystkimi.
   */
  attempt(keys: readonly AttemptKey[]): AttemptVerdict {
    const now = this.clock.now().getTime();
    const since = now - this.windowMs;
    if (this.hits.size > SWEEP_ABOVE_KEYS) this.sweep(since);

    let retryAfterMs = 0;
    const pruned: { key: string; recent: number[] }[] = [];
    for (const { key, limit } of keys) {
      const recent = (this.hits.get(key) ?? []).filter((at) => at > since);
      pruned.push({ key, recent });
      if (recent.length >= limit) {
        // Kolejna próba przejdzie, gdy z okna wypadnie tyle prób, żeby zostało `limit - 1`:
        // czyli gdy wygaśnie ta o indeksie `length - limit` (od najstarszej).
        const oldestBlocking = recent[recent.length - limit]!;
        retryAfterMs = Math.max(retryAfterMs, oldestBlocking + this.windowMs - now);
      }
    }
    if (retryAfterMs > 0) {
      for (const { key, recent } of pruned) this.store(key, recent);
      return { allowed: false, retryAfterMs };
    }

    for (const { key, recent } of pruned) {
      recent.push(now);
      this.store(key, recent);
    }
    return { allowed: true };
  }

  private store(key: string, recent: number[]): void {
    if (recent.length === 0) this.hits.delete(key);
    else this.hits.set(key, recent);
  }

  private sweep(since: number): void {
    for (const [key, at] of this.hits) this.store(key, at.filter((t) => t > since));
  }
}
