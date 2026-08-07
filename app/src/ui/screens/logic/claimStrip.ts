/**
 * UZ Aero — pasek sesji samolotu (`.claim-strip` z mockupów 04 / 04A / 04B).
 *
 * Zastąpił duty timer i to jest zmiana MODELU, nie układu (§3.6a). Czas służby jest
 * wielkością PILOTA: obejmuje też inne maszyny i mieszka w „Mój dzień" (01). Trzymanie
 * go w kokpicie mówiło, że dzień kończy się razem z tym samolotem — czyli dokładnie to
 * założenie, które ta przebudowa usuwa.
 *
 * Kokpit opisuje SAMOLOT, więc pasek odpowiada na trzy pytania o maszynę: czyja jest,
 * od kiedy i ile już zrobiła. Ten sam byt obsługuje podgląd cudzej sesji (04B), bo to
 * te same trzy pytania zadane o czyjś samolot — różni się tylko to, czy prowadzą one
 * gdzieś dalej.
 */

import { timeUtc } from '../../format';
import { plural } from '../../format';
import type { EpochMillis, SessionState } from '../../../domain';

export interface ClaimStripVm {
  /** Górna linia: „SP-AXA · Twój od 08:04" albo „SP-FGK · KRZ od 07:10 UTC". */
  label: string;
  /**
   * Dolna linia — licznik wzlotów SESJI.
   *
   * Zero mówi „jeszcze żadnego wzlotu", a nie „0": zero jest wynikiem, a tu chodzi
   * o brak wyniku. Świeżo przejęty samolot niczego jeszcze nie zrobił i pasek ma to
   * powiedzieć po ludzku (mockup 04A).
   */
  legs: string;
  /** Prawa strona: „Mój dzień →" przy własnej sesji, „zajęty" przy cudzej. */
  trailing: string;
}

/**
 * Buduje pasek dla WŁASNEJ sesji (04 / 04A) — klikalny, prowadzi na 01.
 *
 * @returns `null`, gdy pilot nie trzyma tej maszyny (sesja zdana albo pusta): pasek
 *          bez samolotu nie ma o czym mówić, a link „Mój dzień" i tak jest w nagłówku.
 */
export function buildClaimStrip(state: SessionState): ClaimStripVm | null {
  if (state.aircraftId == null || state.sessionUuid == null) return null;

  return {
    label: `${state.aircraftId} · Twój od ${sinceLabel(state.claimedAt)}`,
    legs: legsLabel(state.legs.length),
    trailing: 'Mój dzień →',
  };
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
    legs: legsLabel(state.legs.length),
    trailing: 'zajęty',
  };
}

/**
 * „2 wzloty" / „1 wzlot" / „5 wzlotów"; zero mówi wprost, że wyniku jeszcze nie ma.
 *
 * Publiczne, bo tego samego napisu używa rozliczenie samolotu (10) — dwie kopie odmiany
 * liczebnika rozjechałyby się przy pierwszej poprawce.
 */
export function legsLabel(count: number): string {
  if (count === 0) return 'jeszcze żadnego wzlotu';
  return `${count} ${plural(count, 'wzlot', 'wzloty', 'wzlotów')}`;
}

/**
 * Godzina przejęcia albo „—".
 *
 * `null` zdarza się przy sesji wczytanej bez strumienia i nie jest błędem — wtedy
 * mówimy mniej, zamiast podstawiać czas pierwszego wzlotu. To dwa różne momenty.
 */
function sinceLabel(claimedAt: EpochMillis | null): string {
  return claimedAt != null ? timeUtc(claimedAt) : '—';
}
