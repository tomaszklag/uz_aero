/**
 * Ninerdeck (serwer) - TEMATY KANAŁU KLUBU (4.0.0, `docs/kanal-klubu.md` §4; epik Z-E #246).
 *
 * Jedno miejsce na nazwy tematów sygnału `changed`. Klient (telefon, panel) mapuje je na
 * ekrany i zapytania, więc napis tematu jest częścią kontraktu jak nazwa trasy - literówka
 * w jednym producencie nie wywróciłaby niczego, tylko ekran przestałby się odświeżać
 * i nikt by tego nie zauważył.
 *
 * Doba kalendarza jest dobą KLUBU (strefa z ustawień klubu, jak siatka kalendarza),
 * doba dziennika - dobą UTC chwili przejęcia (tak dziennik grupuje operacje).
 */

export const topic = {
  /** Karta zlecenia (`docs/zlecenia.md` §11). */
  order: (id: string): string => `order:${id}`,
  /** Listy zleceń i karta „Zlecenia" na Pulpicie. */
  orders: 'orders',
  /** Rezerwacja, wyłączenie z użytku albo rezerwacja zlecenia - karta i jej ścieżka zgód. */
  booking: (id: string): string => `booking:${id}`,
  /** Doba kalendarza klubu, `YYYY-MM-DD` w strefie klubu. */
  calendar: (clubDate: string): string => `calendar:${clubDate}`,
  /** Karta samolotu i jego wiersz na liście obserwowanych. */
  aircraft: (id: string): string => `aircraft:${id}`,
  /** Doba dziennika, `YYYY-MM-DD` w UTC - listy operacji w panelu. */
  log: (utcDate: string): string => `log:${utcDate}`,
  /** Jedna operacja lotnicza - ekran operacji w dzienniku panelu. */
  session: (uuid: string): string => `session:${uuid}`,
  /** Moduł „Do sprawdzenia" i jego licznik w kolumnie panelu. */
  attention: 'attention',
} as const;
