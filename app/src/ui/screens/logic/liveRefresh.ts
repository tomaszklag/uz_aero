/**
 * Ninerdeck - CICHE ODŚWIEŻENIE ekranu po sygnale kanału klubu (4.0.0,
 * `docs/kanal-klubu.md` §3.4, K2; epik KK-C #246).
 *
 * Wejście na ekran czyta jak dotąd: plamki w miejscu treści, potem odpowiedź albo „nie
 * wiem". Sygnał z kanału to co innego - ekran STOI z danymi przed oczami pilota, więc:
 *  - nie wraca do plamek - szkielet mrugałby przy każdej cudzej rezerwacji;
 *  - odpowiedź, której nie było (chwilowa awaria, odmowa), NIE zamienia wiedzy
 *    w niewiedzę: ekran zostaje przy tym, co pokazywał, a zapyta znowu następny sygnał
 *    albo następne wejście. Ekran, który nie wiedział, przyjmuje odpowiedź jak każdą.
 */

/** Stan odczytu ekranu: dane, `null` = nie wiadomo, `undefined` = pytanie w toku. */
export type Reading<T> = T | null | undefined;

export function quietResult<T>(previous: Reading<T>, next: T | null): Reading<T> {
  return next == null && previous != null ? previous : next;
}
