/**
 * UZ Aero — KAFELEK SESJI: jeden model widoku dla „Mój dzień" (01) i „Poprzednich
 * dni" (12).
 *
 * DLACZEGO WSPÓLNY (issue #42, 2026-08-13): oba ekrany opisują to samo — jeden bieg
 * silnika z lotami w środku — i do 2026-08-13 robiły to na dwa sposoby. Ekran 01 miał
 * własną tabelę (`.leg-row`: numer, czasy nad rejestracją, trójka mikro-metryk,
 * ołówek), ekran 12 kartę (`.day-card`). Te same trzy wielkości, dwa układy, dwa
 * zestawy napisów — pilot musiał sprawdzać, czy „Blok" znaczy tam to samo, co tutaj.
 *
 * Moduł niesie WYŁĄCZNIE to, co w obu miejscach jest identyczne: nagłówek kafelka,
 * rejestrację, godziny biegu silnika i trójkę Loty / Blok / Lot. Różnice zostają
 * u wołających, bo są prawdziwe:
 *  • **nagłówek** — na 12 data (kafelki są z różnych dni), na 01 numer sesji w dobie
 *    (data stoi w nagłówku ekranu i jest wspólna, więc na każdym kafelku byłaby szumem);
 *  • **stopka** — plakietka zaległości wysyłki i termin korekty istnieją tylko w historii.
 *
 * Czysty TypeScript: bez Reacta i bez zegara systemowego.
 */

import { duration, timeUtc } from '../../format';

/** Para „klucz → wartość" w rzędzie statystyk kafelka (`.day-stats` z mockupu 12). */
export interface CardStat {
  k: string;
  v: string;
}

/** Część kafelka wspólna dla obu ekranów. */
export interface SessionCardVm {
  /** Sesja, którą kafelek opisuje — bez niej nie wiadomo, KTÓRY strumień otworzyć. */
  sessionUuid: string;
  /** Nagłówek kafelka: „22 CZERWCA 2026" (12) albo „SESJA 1" (01). */
  title: string;
  aircraft: string;
  /** Godziny biegu silnika; `null`, gdy silnik nie ruszył ani razu. */
  times: string | null;
  stats: CardStat[];
}

/**
 * Godziny biegu silnika ze znacznikiem strefy — „08:12 → 10:34 UTC".
 *
 * Bieg jeszcze otwarty kończy się wielokropkiem („13:40 → … UTC"), a nie kreską:
 * kreska znaczy „nie ma czego pokazać", a tu wartość dopiero będzie. Sesja bez biegu
 * silnika (zdanie bez lotu przed uruchomieniem) nie ma godzin w ogóle — stąd `null`.
 *
 * „UTC" stoi przy KAŻDYM kafelku, bo czas nieoznaczony bywa czytany jako lokalny,
 * a kafelki obu ekranów wędrują między listami (CLAUDE.md, sekcja „Strefa czasowa").
 */
export function sessionTimes(startedAt: number | null, stoppedAt: number | null): string | null {
  if (startedAt == null) return null;
  return `${timeUtc(startedAt)} → ${stoppedAt != null ? timeUtc(stoppedAt) : '…'} UTC`;
}

/**
 * Trójka Loty / Blok / Lot — te same trzy wielkości i te same nazwy na obu ekranach
 * (issue #35 pkt 6, po issue #42 dosłownie z jednego miejsca).
 *
 * Czas lotu przy zerze lotów to „0:00", nie „— —": to wyliczona suma, a suma pustego
 * zbioru wynosi zero. Kreska jest zarezerwowana dla niewiedzy (sumy pustej doby na 01).
 */
export function sessionStats(flightCount: number, blockMs: number, flightMs: number): CardStat[] {
  return [
    { k: 'Loty', v: String(flightCount) },
    { k: 'Blok', v: duration(blockMs) },
    { k: 'Lot', v: duration(flightMs) },
  ];
}
