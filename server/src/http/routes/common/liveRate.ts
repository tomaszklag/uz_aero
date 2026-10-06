/**
 * Ninerdeck (serwer) - TEMPO RAMEK OD KLIENTA kanału klubu (4.0.0, `docs/kanal-klubu.md` §5).
 *
 * Od klienta przychodzi wyłącznie uwierzytelnienie i podtrzymanie (K2) - kilka ramek na
 * minutę. Klient, który wysyła ich dziesiątki na sekundę, jest zepsuty albo wrogi i jego
 * połączenie się zamyka: kanał nie ma nic, co mogłoby taki potok przyjąć, a każda ramka
 * kosztuje parsowanie po stronie serwera.
 *
 * Okno PRZESUWNE, a nie kubełek na pełną sekundę - kubełek przepuściłby podwójną serię na
 * styku dwóch okien. Czas podaje wołający, więc reguła jest sprawdzalna testem bez zegara.
 */

export class FrameRate {
  private readonly times: number[] = [];

  constructor(private readonly limit: { frames: number; windowMs: number }) {}

  /** `false` = ramka ponad limit - połączenie do zamknięcia. */
  allow(now: number): boolean {
    while (this.times.length > 0 && this.times[0]! <= now - this.limit.windowMs) this.times.shift();
    if (this.times.length >= this.limit.frames) return false;
    this.times.push(now);
    return true;
  }
}
