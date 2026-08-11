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
 * **`session_overlap` ROZDZIELONE na dwie flagi** (2026-08-07, §4.7). Do tej pory jedna
 * pozycja udawała dwie różne patologie, bo przy długich sesjach zbiegały się w praktyce:
 * dwie niezamknięte sesje na jednej maszynie prawie zawsze znaczyły też, że któryś pilot
 * „lata dwiema naraz". Po §3.6a sesje są krótkie i to przestało być prawdą — pilot
 * legalnie zdaje jedną maszynę i bierze drugą **co do minuty**, a jedna maszyna bywa
 * zajęta przez dwa telefony bez żadnego udziału zegarów.
 *
 * Stąd `aircraft_overlap` (kto pisze do MASZYNY) i `pilot_overlap` (co robi PILOT).
 * Rozróżnienie nie jest kosmetyczne: pierwsza blokuje kartę arkusza tej maszyny, druga
 * nie ma z arkuszem nic wspólnego — opisuje grafik człowieka.
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
  /**
   * Dwie NIEZAMKNIĘTE sesje jednego SAMOLOTU — dwa telefony piszą do tej samej maszyny
   * (typowo przejęcie offline, §4.4). Jedyna flaga bramkująca kartę arkusza: dopóki nie
   * wiadomo, który strumień opisuje maszynę, doba tej maszyny nie ma jednej prawdy.
   */
  'aircraft_overlap',
  /**
   * Sesje jednego PILOTA nachodzące na siebie w czasie — rzekomo lata dwiema maszynami
   * naraz. To anomalia GRAFIKU, nie danych maszyny, więc arkusza NIE blokuje.
   * Zetknięcie się co do minuty (zdał jedną, wziął drugą) nie jest nakładką.
   */
  'pilot_overlap',
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
