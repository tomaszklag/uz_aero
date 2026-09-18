/**
 * Ninerdeck (serwer) - PRZEPUSTNICA „ostatnio aktywny" (2.1.0, issue #133 C5; §6).
 *
 * `login_sessions.last_seen_at` odpowiada na pytanie „kiedy to urządzenie ostatnio
 * pracowało" i pada w karcie członka jako „3 min temu". Gdyby zapisywać je przy KAŻDYM
 * żądaniu, telefon w locie (sync co minutę, ingest paczkami) dokładałby `UPDATE` do każdej
 * operacji odczytu - a różnica między „teraz" a „minutę temu" nie zmienia ani jednego
 * napisu na ekranie.
 *
 * ══ W PAMIĘCI PROCESU, JAK `AttemptLimiter` ══
 * Serwer chodzi w jednej instancji (`docs/architektura-panelu-serwer.md` §8.8), więc
 * tabela kosztowałaby zapis, przed którym ta klasa broni. Restart gubi stan i to jest
 * poprawne: po restarcie pierwsze żądanie każdej sesji zapisze `last_seen_at` i przepustnica
 * zaczyna od nowa - zgubienie tej wiedzy nie zmienia niczego poza jednym dodatkowym zapisem.
 *
 * ══ MAPA NIE ROŚNIE W NIESKOŃCZONOŚĆ ══
 * Wpis starszy niż okno jest bezużyteczny (i tak odpowiedziałby „pora"), więc zamiatanie
 * co okno kasuje wszystko, co przeterminowane. Bez tego proces trzymałby identyfikator
 * każdej sesji widzianej od startu - a te są uuid-ami i przybywa ich z każdym logowaniem.
 */

/** Najwyżej jeden zapis na sesję na minutę - tyle, ile wynosi najdrobniejszy napis („3 min temu"). */
export const LAST_SEEN_THROTTLE_MS = 60_000;

export class LastSeenThrottle {
  private readonly written = new Map<string, number>();
  private sweptAt = 0;

  constructor(private readonly windowMs: number = LAST_SEEN_THROTTLE_MS) {}

  /**
   * `true` = pora zapisać (i wtedy przepustnica liczy od nowa). Woła się JEDEN RAZ na
   * żądanie, bo samo pytanie jest zapisem decyzji - dwa wywołania „czy pora" pod rząd
   * dałyby dwa różne wyniki i drugi czytelnik uznałby, że zapisu nie trzeba.
   */
  due(sessionId: string, now: Date): boolean {
    const at = now.getTime();
    this.sweep(at);
    const last = this.written.get(sessionId);
    if (last != null && at - last < this.windowMs) return false;
    this.written.set(sessionId, at);
    return true;
  }

  /**
   * Zdejmuje sesję z przepustnicy - po unieważnieniu nie ma czego dotykać, a wpis
   * trzymałby identyfikator sesji, która już nie istnieje.
   */
  forget(sessionId: string): void {
    this.written.delete(sessionId);
  }

  private sweep(at: number): void {
    if (at - this.sweptAt < this.windowMs) return;
    this.sweptAt = at;
    for (const [id, last] of this.written) {
      if (at - last >= this.windowMs) this.written.delete(id);
    }
  }
}
