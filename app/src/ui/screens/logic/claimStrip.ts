/**
 * UZ Aero — pasek sesji CUDZEGO samolotu (`.claim-strip` z mockupu 04B).
 *
 * Zastąpił duty timer i to jest zmiana MODELU, nie układu (§3.6a). Czas pracy pilota
 * jest wielkością PILOTA: obejmuje też inne maszyny i mieszka w „Mój dzień" (01).
 * Trzymanie go w kokpicie mówiło, że dzień kończy się razem z tym samolotem — czyli
 * dokładnie to założenie, które ta przebudowa usuwa.
 *
 * Pasek odpowiada na trzy pytania o maszynę: czyja jest, od kiedy i ile już zrobiła —
 * i zadaje je dziś wyłącznie o CZYJŚ samolot, jako przesłanki decyzji o przejęciu.
 *
 * BYŁ TU TAKŻE `buildClaimStrip` dla WŁASNEJ sesji (04 / 04A) — usunięty 2026-08-10
 * razem z paskiem w kokpicie. Kokpit jest stanem modalnym: pilot, który trzyma samolot,
 * wychodzi wyłącznie przez zdanie maszyny (09B), więc pasek stracił swoje jedyne
 * niezastąpione zadanie (link „Mój dzień →"). Reszty tamtego napisu nie brakuje: maszynę
 * mówi pasek górny, a liczbę lotów nagłówek logu dnia.
 */

import { timeUtc } from '../../format';
import { plural } from '../../format';
import type { EpochMillis, SessionState } from '../../../domain';

export interface ClaimStripVm {
  /** Górna linia: „SP-FGK · KRZ od 07:10 UTC". */
  label: string;
  /**
   * Dolna linia — licznik LOTÓW sesji (start → lądowanie; „wzlot" wycofany z pivotem
   * 2026-08-10 — zlał się z sesją).
   *
   * Zero mówi „jeszcze żadnego lotu", a nie „0": zero jest wynikiem, a tu chodzi
   * o brak wyniku. Przy CUDZEJ maszynie to pełnoprawna odpowiedź na pytanie „co ta
   * maszyna dziś zrobiła" — i nikt inny na tym ekranie jej nie udziela.
   */
  flights: string;
  /** Prawa strona: stan maszyny — „zajęty". */
  trailing: string;
}

/**
 * Buduje pasek dla CUDZEJ sesji (04B) — nieklikalny, bo to podgląd, nie sterowanie.
 *
 * @param picLabel kod albo nazwisko prowadzącego; ekran wie, którym dysponuje.
 */
export function buildPeekStrip(state: SessionState, picLabel: string): ClaimStripVm | null {
  if (state.aircraftId == null) return null;

  return {
    // Strefa wypisana JAWNIE, w odróżnieniu od własnej sesji: przy cudzym samolocie
    // godzina jest przesłanką decyzji o przejęciu, a nie przypomnieniem własnego dnia.
    label: `${state.aircraftId} · ${picLabel} od ${sinceLabel(state.claimedAt)} UTC`,
    flights: flightsLine(state.flights.length),
    trailing: 'zajęty',
  };
}

/**
 * „2 loty" / „1 lot" / „5 lotów"; zero mówi wprost, że wyniku jeszcze nie ma.
 *
 * Publiczne, bo tego samego napisu używa arkusz wyjścia z kokpitu (04d) — dwie kopie
 * odmiany liczebnika rozjechałyby się przy pierwszej poprawce. Od `flightsBadge`
 * (statsDay) różni się WYŁĄCZNIE zerem: badge nagłówka mówi „0 lotów", a linia paska
 * pełnym zdaniem „jeszcze żadnego lotu".
 */
export function flightsLine(count: number): string {
  if (count === 0) return 'jeszcze żadnego lotu';
  return `${count} ${plural(count, 'lot', 'loty', 'lotów')}`;
}

/**
 * Godzina przejęcia albo „—".
 *
 * `null` zdarza się przy sesji wczytanej bez strumienia i nie jest błędem — wtedy
 * mówimy mniej, zamiast podstawiać czas pierwszego startu. To dwa różne momenty.
 */
function sinceLabel(claimedAt: EpochMillis | null): string {
  return claimedAt != null ? timeUtc(claimedAt) : '—';
}
