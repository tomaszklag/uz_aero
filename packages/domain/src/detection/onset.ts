/**
 * UZ Aero - retro-datowanie: KIEDY zdarzenie naprawdę nastąpiło.
 *
 * TO JEST NAPRAWA BŁĘDU, KTÓRY ZAPISYWAŁ SIĘ DO DOKUMENTÓW. Detektor emitował czas
 * fixa, który POTWIERDZIŁ warunek - czyli moment przekroczenia progu plus okno
 * potwierdzenia. Każde zdarzenie było systematycznie spóźnione: kołowanie o kilkanaście
 * sekund (czas rozpędzania się do progu + potwierdzenie), start o kilka, a lądowanie
 * wykryte gałęzią wysokościową nawet o dziesięć. Nikt tego później nie widział - w logu
 * stała po prostu jakaś godzina.
 *
 * Rozwiązaniem jest rozdzielenie dwóch pytań, które wcześniej były jednym:
 *
 *   CZY  - decyzja może zapaść PÓŹNO i na mocnych przesłankach; opóźnienie nic nie kosztuje;
 *   KIEDY - odpowiedź odnajdujemy WSTECZ w buforze historii, po fakcie.
 *
 * Skutek uboczny jest ważniejszy niż sama poprawka czasu: skoro późna decyzja nie
 * pogarsza już dokładności, okna potwierdzenia wolno WYDŁUŻYĆ. Wcześniej były
 * kompromisem między czułością a dokładnością i nie służyły żadnej ze stron.
 *
 * Każda funkcja zwraca `null`, gdy w zapisie nie ma na czym się oprzeć - wtedy automat
 * zostaje przy czasie fixa potwierdzającego. Zgadywanie momentu jest gorsze niż
 * przyznanie, że znamy tylko ten późniejszy.
 */

import { distanceM, type LatLon } from './geo';
import { fixPosition } from './fix';
import type { FixHistory } from './history';
import type { EpochMillis } from '../time';

/** Wysokość nad lotniskiem dla fixa; null gdy brakuje którejkolwiek składowej. */
function agl(altitudeFt: number | null, fieldElevationFt: number | null): number | null {
  if (altitudeFt == null || fieldElevationFt == null) return null;
  return altitudeFt - fieldElevationFt;
}

/**
 * Moment ruszenia ze stanowiska: ostatni fix, w którym samolot był jeszcze PRZY kotwicy.
 *
 * Szukamy wstecz od najnowszego, aż trafimy na pozycję w promieniu postoju. Przy 1 Hz
 * i prędkości kołowania fixy leżą kilka metrów od siebie, więc niepewność tak wyznaczonego
 * momentu to około sekundy - wobec kilkunastu sekund spóźnienia, które ta funkcja usuwa.
 *
 * Celowo bierzemy OSTATNI fix wewnątrz promienia, a nie pierwszy na zewnątrz: „taxi"
 * w logu ma znaczyć zwolnienie hamulców, a nie chwilę, w której ruch stał się widoczny.
 */
export function taxiOnset(
  history: FixHistory,
  anchor: LatLon | null,
  radiusM: number,
): EpochMillis | null {
  if (anchor == null) return null;

  for (let i = history.fixes.length - 1; i >= 0; i -= 1) {
    const here = fixPosition(history.fixes[i]!);
    if (here == null) continue;
    if (distanceM(here, anchor) <= radiusM) return history.fixes[i]!.time;
  }
  return null;
}

/**
 * Moment oderwania: ostatni fix przy ziemi przed trwającym wznoszeniem.
 *
 * Idziemy wstecz przez fixy w powietrzu; pierwszy napotkany przy ziemi jest szukanym
 * momentem. Fixy bez wysokości POMIJAMY zamiast na nich przerywać - brak wysokości nie
 * jest dowodem na nic, a przerwanie na nim dałoby moment przypadkowy.
 */
export function liftoffOnset(
  history: FixHistory,
  fieldElevationFt: number | null,
  groundAglFt: number,
): EpochMillis | null {
  for (let i = history.fixes.length - 1; i >= 0; i -= 1) {
    const fix = history.fixes[i]!;
    const height = agl(fix.altitudeFt, fieldElevationFt);
    if (height == null) continue;
    if (height <= groundAglFt) return fix.time;
  }
  return null;
}

/**
 * Moment przyziemienia: NAJWCZEŚNIEJSZY fix nieprzerwanej serii „przy ziemi",
 * która trwa do teraz.
 *
 * Lustrzane odbicie oderwania i tak samo istotne: warunek lądowania wymaga wolno ORAZ
 * nisko utrzymanych przez całe okno potwierdzenia, więc fix potwierdzający leży
 * kilka–kilkanaście sekund PO kołach na pasie. Cofamy się na początek tej serii.
 *
 * Serię przerywa dopiero fix POZYTYWNIE wysoki; brak wysokości ją tylko przeskakuje.
 */
export function touchdownOnset(
  history: FixHistory,
  fieldElevationFt: number | null,
  groundAglFt: number,
): EpochMillis | null {
  let onset: EpochMillis | null = null;

  for (let i = history.fixes.length - 1; i >= 0; i -= 1) {
    const fix = history.fixes[i]!;
    const height = agl(fix.altitudeFt, fieldElevationFt);
    if (height == null) continue;
    if (height > groundAglFt) break;
    onset = fix.time;
  }
  return onset;
}
