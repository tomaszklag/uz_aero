/**
 * UZ Aero — arytmetyka ekranu TANKOWANIE (mockup 06).
 *
 * Osobny moduł bez importów React Native, bo to jedyna nietrywialna logika tego ekranu
 * i jedyna, której pomyłka nie objawi się niczym widocznym — zła średnia L/h wygląda
 * dokładnie tak samo jak dobra.
 *
 * Co tu liczymy i skąd bierzemy dane:
 *  • **punkt odniesienia** — ostatni BEZPOŚREDNI odczyt paliwomierza w strumieniu
 *    (preflight albo poprzednie tankowanie). Zużycia w locie nie mierzymy, więc jedyne,
 *    co wiemy na pewno, to dwa odczyty i czas pracy silnika między nimi;
 *  • **czas pracy silnika** — z zamkniętych cykli projekcji, przycięty do okna
 *    „od odczytu do teraz". Licznik motogodzin chodzi z silnikiem (§4.5), więc to on
 *    jest mianownikiem, a nie czas zegarowy dnia;
 *  • **średnia L/h** — (odczyt odniesienia − stan przed tankowaniem) / godziny pracy.
 *
 * To **szacunek kontrolny**, nie pomiar: `CLAUDE.md` stawia licznik fizyczny ponad naszą
 * rachubą, więc gdy danych brakuje, zwracamy `null` zamiast liczby „mniej więcej".
 */

import { eventTime, type EpochMillis, type Event, type SessionState } from '../../domain';

/** Ostatni bezpośredni odczyt paliwomierza w strumieniu zdarzeń. */
export interface FuelReference {
  at: EpochMillis;
  fuelL: number;
  /** Skąd pochodzi — steruje podpisem w UI („preflight 08:00 UTC"). */
  source: 'preflight' | 'refuel';
}

/**
 * Znajduje ostatni odczyt paliwomierza (chronologicznie, nie w kolejności zapisu —
 * wpis ręczny i korekta czasu wstawiają zdarzenia „wstecz").
 * `null`, gdy w sesji nie ma jeszcze żadnego odczytu.
 */
export function lastFuelReference(events: Event[]): FuelReference | null {
  let best: FuelReference | null = null;

  for (const event of events) {
    const at = eventTime(event);
    if (best != null && at < best.at) continue;

    if (event.type === 'preflight_confirm') {
      best = { at, fuelL: event.payload.reading.fuelL, source: 'preflight' };
    } else if (event.type === 'refuel') {
      best = { at, fuelL: event.payload.afterL, source: 'refuel' };
    }
  }

  return best;
}

/**
 * Czas pracy silnika (ms) w oknie [`since`, `until`].
 *
 * Cykle przycinamy do okna zamiast filtrować po `startedAt`, bo okno może zacząć się
 * w środku cyklu (odczyt korygowany w trakcie postoju między lotami). Cykl otwarty
 * (`stoppedAt == null`) liczymy do `until`.
 */
export function engineTimeInWindow(
  state: SessionState,
  since: EpochMillis,
  until: EpochMillis,
): number {
  let total = 0;
  for (const run of state.engineRuns) {
    const from = Math.max(run.startedAt, since);
    const to = Math.min(run.stoppedAt ?? until, until);
    if (to > from) total += to - from;
  }
  return total;
}

/** Wynik kalkulacji zużycia (`.calc-box` z mockupu). */
export interface ConsumptionEstimate {
  /** Czas pracy silnika od punktu odniesienia (ms). */
  engineMs: number;
  /** Ubytek paliwa w tym czasie (L). */
  usedL: number;
  /** Średnie zużycie (L/h). */
  lPerH: number;
  reference: FuelReference;
}

/**
 * Szacuje zużycie od ostatniego odczytu do stanu `beforeL`.
 *
 * `null` (czyli „nie ma czego pokazać”, a nie „zero”) gdy:
 *  • nie ma odczytu odniesienia — pierwsze zdarzenie w sesji,
 *  • silnik nie pracował od tego odczytu — dzielenie przez zero,
 *  • paliwa jest WIĘCEJ niż przy odczycie — ujemne zużycie to sygnał błędu odczytu
 *    albo tankowania poza aplikacją; domena zgłosi to jako `FUEL_MISMATCH`, a my
 *    nie zamazujemy tego wymyśloną liczbą.
 */
export function estimateConsumption(
  events: Event[],
  state: SessionState,
  beforeL: number,
  now: EpochMillis,
): ConsumptionEstimate | null {
  const reference = lastFuelReference(events);
  if (reference == null) return null;

  const engineMs = engineTimeInWindow(state, reference.at, now);
  if (engineMs <= 0) return null;

  const usedL = reference.fuelL - beforeL;
  if (usedL < 0) return null;

  return { engineMs, usedL, lPerH: usedL / (engineMs / 3_600_000), reference };
}

/** Ile jeszcze wejdzie do pełna. `null` = pojemność nieznana (brak konfiguracji w cache). */
export function maxAddableL(beforeL: number, capacityL: number | null): number | null {
  if (capacityL == null) return null;
  return Math.max(0, capacityL - beforeL);
}

/**
 * Podziałka pod paskiem dolewki: 0 → ćwiartki → maks (`.slider-labels` z mockupu).
 * Wartości pośrednie zaokrąglamy do 5 L — podziałka ma orientować, a nie udawać
 * precyzję, której dolewka nie ma (mockup: 0 · 55 · 110 · 165 · 218 dla maks. 218 L).
 */
export function refuelScale(maxL: number): string[] {
  const round5 = (v: number): number => Math.round(v / 5) * 5;
  return [
    '0 L',
    `${round5(maxL * 0.25)} L`,
    `${round5(maxL * 0.5)} L`,
    `${round5(maxL * 0.75)} L`,
    `${Math.round(maxL)} L`,
  ];
}

/**
 * Czas pracy silnika jako „2h 22 min" (mockup 06).
 *
 * Osobno od `duration()` z `format.ts`, która daje „2:22": tam liczba stoi w kolumnie
 * czasów i format zegarowy jest oczywisty, tutaj siedzi w zdaniu rachunku, gdzie „2:22"
 * czyta się jak godzinę zegarową, a nie jak czas trwania.
 */
export function hoursMinutes(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m} min` : `${m} min`;
}
