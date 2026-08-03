/**
 * UZ Aero — flagi niespójności (§4.5): katalog typów i kształt „na drucie".
 *
 * **Dlaczego w domenie, a nie po którejś stronie.** Ten sam typ opisuje odpowiedź
 * `/sessions/:uuid/sync-status`: serwer go wysyła, aplikacja czyta i pokazuje na
 * ekranie 11. Do 2026-07-31 był przepisany ręcznie w CZTERECH miejscach
 * (`server/src/application/ports.ts` oraz dwa razy `app/src/application/ports/serverPort.ts`
 * i `app/src/ui/store/sessionStore.ts`) — zgodne ze sobą wyłącznie przez przypadek,
 * bo strukturalnie identyczne deklaracje kompilator uznaje za wymienne i nigdy nie
 * powie, że jedną zapomniano zmienić. Cykl życia flagi dokłada tu `status` i `id`,
 * więc rozjazd przestałby być hipotetyczny.
 *
 * **Katalog ma pięć pozycji, choć §4.5 wymienia sześć.** `session_overlap` jest
 * następcą `DOUBLE_CLAIM` i `TIME_OVERLAP`: obie opisywały ten sam fakt — dwie
 * niezamknięte sesje jednego samolotu — a rozdzielanie ich wymagałoby zgadywania,
 * czy nakładka wzięła się z przejęcia, czy z przestawionego zegara. Decyzja
 * 2026-07-31 (log w `docs/_main.md.txt`).
 */

/**
 * Kolejność bez znaczenia. `fuel_mismatch` i `clock_drift` są w katalogu, ale serwer
 * zaczął je liczyć dopiero po decyzji 2026-07-31 — wcześniej żyły wyłącznie jako
 * lokalne ostrzeżenia w telefonie i nigdy nie docierały do tabeli `flags`.
 */
export const FLAG_TYPES = [
  /** Start MH wyższy niż koniec poprzedniej sesji ponad tolerancję — możliwy lot bez aplikacji. */
  'mh_gap',
  /** Odczyt niższy od poprzedniego — cofnięty licznik albo błąd wpisu. */
  'mh_regression',
  /** Dwie niezamknięte sesje jednego samolotu — typowo przejęcie offline. */
  'session_overlap',
  /** Odczyt paliwomierza poza tolerancją względem przekazania. */
  'fuel_mismatch',
  /** |device_time − gps_time| powyżej progu — przestawiony zegar telefonu. */
  'clock_drift',
] as const;

export type FlagType = (typeof FLAG_TYPES)[number];

/** Cykl życia flagi: rozstrzyga ją administrator albo szef wyszkolenia, nie kokpit. */
export type FlagStatus = 'open' | 'resolved';

/**
 * Flaga tak, jak widzi ją aplikacja pilota — dokładnie tyle, ile trzeba, żeby pokazać
 * ją na ekranie 11. Szczegóły rozbieżności (`details`) i tożsamość wpisu (`id`) są
 * sprawą panelu, więc na telefon nie jadą.
 */
export interface SessionFlag {
  type: FlagType;
  sessionUuids: string[];
}

/** Strażnik wejścia z zewnątrz (kolumna `flags.type`, ciało odpowiedzi HTTP). */
export function isFlagType(value: unknown): value is FlagType {
  return typeof value === 'string' && (FLAG_TYPES as readonly string[]).includes(value);
}
