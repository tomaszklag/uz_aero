/**
 * Ninerdeck - PORT gniazda KANAŁU KLUBU (4.0.0, `docs/kanal-klubu.md` §3.4; epik KK-C #246).
 *
 * Łącze (`application/live/liveLink.ts`) nie zna gniazda platformy - dostaje to, czego
 * z niego potrzebuje: wysłać napis, zamknąć i trzy zdarzenia. W produkcji implementuje go
 * `infrastructure/live/liveSocket.ts` (JEDYNY plik z gniazdem w aplikacji - pilnuje tego
 * test architektury), w testach - gniazdo w pamięci.
 */

/** Jedno połączenie. Zdarzenia ustawia łącze; wysyła i zamyka przez metody. */
export interface LiveConnection {
  onopen: (() => void) | null;
  /** Ramka od serwera - napis (protokół tekstowy); inny rodzaj danych łącze pomija. */
  onmessage: ((data: unknown) => void) | null;
  /**
   * Koniec połączenia z KAŻDEGO powodu, także nieudanego nawiązania - React Native zgłasza
   * wtedy błąd, a zaraz po nim zamknięcie, więc łączu wystarcza to jedno zdarzenie.
   */
  onclose: (() => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

/** Otwiera połączenie kanału pod adresem - bez tokenu, ten idzie pierwszą ramką. */
export interface LiveSocketPort {
  open(url: string): LiveConnection;
}
