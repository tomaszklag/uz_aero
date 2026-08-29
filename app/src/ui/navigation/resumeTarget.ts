/**
 * UZ Aero - dokąd wracamy po restarcie aplikacji (§5.2).
 *
 * Czysta decyzja wyjęta z `App.tsx`, bo jest regułą flow, a nie szczegółem montowania
 * komponentów - i bo w tej właśnie regule dwa razy pod rząd okazało się, że pytamy
 * o niewłaściwe pole.
 *
 * Reguła: **pilot wraca tam, gdzie stoi jego samolot.** Trzyma maszynę → kokpit,
 * bo restart w środku dnia lotnego nie może kosztować tapnięcia w drodze do STOP ENGINE.
 * Nie trzyma → „Mój dzień" (01), czyli ekran domowy nowego flow - tam jest cała doba
 * i wszystkie wejścia dalej.
 */

import type { SessionState } from '../../domain';

/** Trasy startowe, jakie ta decyzja umie wskazać. */
export type ResumeTarget = 'Cockpit' | 'MyDay';

/**
 * Czy pilot nadal trzyma samolot z wczytanej sesji.
 *
 * Pytamy o `closed`, czyli o fakt ZDANIA maszyny (`day_close`). Do 2026-08-07 stało tu
 * `dutyEnd == null` i było to poprawne tylko dopóty, dopóki zdanie samolotu zawsze
 * niosło koniec służby. Od §3.6a `dutyEnd` jest opcjonalny, a ekran „Zdaj samolot" go
 * NIE wysyła - więc ten warunek zaczął odpowiadać „sesja trwa" dla każdej zdanej maszyny
 * i wrzucałby pilota do kokpitu samolotu, którego już nie ma.
 */
export function holdsAircraft(state: SessionState): boolean {
  return state.sessionUuid != null && state.aircraftId != null && !state.closed;
}

/** Ekran startowy po wznowieniu. */
export function resumeTarget(state: SessionState | null): ResumeTarget {
  return state != null && holdsAircraft(state) ? 'Cockpit' : 'MyDay';
}
