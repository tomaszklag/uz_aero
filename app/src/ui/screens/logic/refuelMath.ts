/**
 * UZ Aero - arytmetyka ekranu TANKOWANIE (mockup 06).
 *
 * Osobny moduł bez importów React Native, bo to jedyna nietrywialna logika tego ekranu
 * i jedyna, której pomyłka nie objawi się niczym widocznym - zła średnia L/h wygląda
 * dokładnie tak samo jak dobra.
 *
 * Co tu liczymy i skąd bierzemy dane:
 *  • **punkt odniesienia** - ostatni BEZPOŚREDNI odczyt paliwomierza w strumieniu
 *    (preflight albo poprzednie tankowanie). Zużycia w locie nie mierzymy, więc jedyne,
 *    co wiemy na pewno, to dwa odczyty i czas pracy silnika między nimi;
 *  • **czas pracy silnika** - z zamkniętych cykli projekcji, przycięty do okna
 *    „od odczytu do teraz". Licznik motogodzin chodzi z silnikiem (§4.5), więc to on
 *    jest mianownikiem, a nie czas zegarowy dnia;
 *  • **średnia L/h** - (odczyt odniesienia − stan przed tankowaniem) / godziny pracy.
 *
 * To **szacunek kontrolny**, nie pomiar: `CLAUDE.md` stawia licznik fizyczny ponad naszą
 * rachubą, więc gdy danych brakuje, zwracamy `null` zamiast liczby „mniej więcej".
 */

import {
  blockSpans,
  eventTime,
  flightSpans,
  spanTimeInWindow,
  type ConsumptionNorm,
  type EpochMillis,
  type Event,
  type SessionState,
} from '../../../domain';

const HOUR_MS = 3_600_000;

/** Ostatni bezpośredni odczyt paliwomierza w strumieniu zdarzeń. */
export interface FuelReference {
  at: EpochMillis;
  fuelL: number;
  /** Skąd pochodzi - steruje podpisem w UI („preflight 08:00 UTC"). */
  source: 'preflight' | 'refuel';
}

/**
 * Znajduje ostatni odczyt paliwomierza (chronologicznie, nie w kolejności zapisu -
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
 * Deleguje do domeny (`consumption/timeInPhase.ts`), bo tę samą liczbę liczy analityka
 * zużycia po stronie panelu i dwie definicje zaczęłyby się rozjeżdżać przy pierwszej
 * poprawce. Tam też mieszka uzasadnienie dwóch rzeczy, których ta funkcja pierwotnie
 * nie robiła, a robić musi:
 *  • liczy ręczne off/on-block z `manual_log_entry` (fallback GPS, ekran 08) - projekcja
 *    dokłada je do `blockTimeMs` BEZ wpisu w `legs`, więc liczenie z samych cykli
 *    zaniżało mianownik i zawyżało L/h (wada znaleziona 2026-08-05);
 *  • scala odcinki nachodzące na siebie, zamiast sumować ich długości.
 *
 * `events` musi pochodzić z tej samej sesji co `state` - inaczej odcinki opisywałyby
 * inny dzień niż cykle.
 */
export function engineTimeInWindow(
  state: SessionState,
  events: readonly Event[],
  since: EpochMillis,
  until: EpochMillis,
): number {
  return spanTimeInWindow(blockSpans(state, events), since, until);
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
 *  • nie ma odczytu odniesienia - pierwsze zdarzenie w sesji,
 *  • silnik nie pracował od tego odczytu - dzielenie przez zero,
 *  • paliwa jest WIĘCEJ niż przy odczycie - ujemne zużycie to sygnał błędu odczytu
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

  const engineMs = engineTimeInWindow(state, events, reference.at, now);
  if (engineMs <= 0) return null;

  const usedL = reference.fuelL - beforeL;
  if (usedL < 0) return null;

  return { engineMs, usedL, lPerH: usedL / (engineMs / HOUR_MS), reference };
}

/** Szacunek stanu paliwa z normy - podpowiedź na wejściu w ekran 06. */
export interface FobEstimate {
  /**
   * Szacowany FOB (ostatni odczyt − zużycie z normy), ZAOKRĄGLONY do pełnych litrów
   * z podłogą 0. Podpowiedź nie udaje precyzji, której nie ma - miejsca po przecinku
   * są zarezerwowane dla wpisu pilota (dolewka z licznika dystrybutora).
   */
  fobL: number;
  /** Zużycie z normy w oknie od odczytu (L, niezaokrąglone - do wiersza „~38 L"). */
  usedL: number;
  /** Czas pracy silnika od odczytu (ms). */
  engineMs: number;
  reference: FuelReference;
}

/**
 * Szacuje stan paliwa „teraz" z ostatniego odczytu i normy samolotu (uwaga
 * z urządzenia, 2026-09-03: „zrób ten szacunek z normy jako podpowiedź") - żeby
 * pilot wchodzący w tankowanie nie oglądał odczytu sprzed lotu udającego stan
 * bieżący.
 *
 * Stawki FAZOWE, gdy model je rozdzielił (czas lotu × stawka lotu + reszta biegu
 * × stawka ziemi), inaczej stawka blokowa - ta sama drabina, co w
 * `consumption/expectation.ts`: dzień z długim kołowaniem liczony samą stawką
 * blokową przeszacowałby zużycie (issue #38). Czas lotu przychodzi z projekcji
 * (`flightSpans`), więc szacunek wychodzi offline, jak reszta danych operacji.
 *
 * `null` = nie ma czego podpowiedzieć (ekran wraca do ostatniego odczytu):
 *  • brak normy - nie zgadujemy stawki,
 *  • brak odczytu odniesienia - nie ma od czego odjąć,
 *  • silnik nie pracował od odczytu - odczyt JEST stanem bieżącym, szacunek
 *    niczego by nie dodał, a podpis „szacunek" podważałby prawdziwą liczbę.
 */
export function estimateFob(
  events: Event[],
  state: SessionState,
  norm: ConsumptionNorm | null,
  now: EpochMillis,
): FobEstimate | null {
  if (norm == null) return null;
  const reference = lastFuelReference(events);
  if (reference == null) return null;

  const engineMs = engineTimeInWindow(state, events, reference.at, now);
  if (engineMs <= 0) return null;

  const airMs = Math.min(engineMs, spanTimeInWindow(flightSpans(state), reference.at, now));
  const usedL =
    norm.airLPerH != null && norm.groundLPerH != null
      ? (norm.airLPerH * airMs + norm.groundLPerH * (engineMs - airMs)) / HOUR_MS
      : (norm.blockLPerH * engineMs) / HOUR_MS;

  return {
    fobL: Math.max(0, Math.round(reference.fuelL - usedL)),
    usedL,
    engineMs,
    reference,
  };
}

/** Ile jeszcze wejdzie do pełna. `null` = pojemność nieznana (brak konfiguracji w cache). */
export function maxAddableL(beforeL: number, capacityL: number | null): number | null {
  if (capacityL == null) return null;
  return Math.max(0, capacityL - beforeL);
}

/**
 * Podziałka pod paskiem dolewki: 0 → ćwiartki → maks (`.slider-labels` z mockupu).
 * Wartości pośrednie zaokrąglamy do 5 L - podziałka ma orientować, a nie udawać
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

/** Miarka pod wynikiem: stan zastany i dolewka na tle pojemności (0–1). */
export interface RefuelGauge {
  /** Wypełnienie CAŁKOWITE po dolewce (stan zastany + dolane). */
  ratio: number;
  /** Granica „ile było przed dolewką" - odcinek 0→base rysuje się przygaszony. */
  baseRatio: number;
}

/**
 * Proporcje miarki „Stan po tankowaniu" (uwaga z urządzenia, 2026-09-03: „dodać
 * miarkę - zaznaczyć, ile jest przed odczytem, ile dolano i ile łącznie").
 * `null` bez znanej pojemności - pasek bez mianownika nie ma czego pokazać
 * (ta sama reguła, co przy wskaźniku FOB). Przepełnienie przycina się do 1,
 * a o łamaniu limitu mówi ton i blokada zapisu, nie geometria paska.
 */
export function refuelGauge(
  beforeL: number,
  addedL: number,
  capacityL: number | null,
): RefuelGauge | null {
  if (capacityL == null || capacityL <= 0) return null;
  const clamp = (v: number): number => Math.max(0, Math.min(1, v));
  const baseRatio = clamp(beforeL / capacityL);
  return { ratio: clamp((beforeL + addedL) / capacityL), baseRatio };
}

/**
 * Ilość dolana jako napis - Z miejscami po przecinku, gdy pilot je wpisał (uwaga
 * z urządzenia, 2026-09-02: „ktoś wpisuje poprawny odczyt z licznika tankowania
 * i tam są wartości po przecinku"). Dystrybutor liczy po 0,01 L, więc do dwóch
 * miejsc; wartość z przycisków ± jest całkowita i pisze się bez ogona „,00" -
 * zaokrąglanie w górę okłamywałoby pilota o jego własnym wpisie (§6 pkt 3).
 * Przecinek po polsku, jak w `oilLitres`.
 */
export function addedLitresText(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
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
