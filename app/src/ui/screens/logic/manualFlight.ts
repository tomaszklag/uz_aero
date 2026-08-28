/**
 * UZ Aero — logika wpisu ręcznego (ekrany 15 → 15C, przebudowa 2026-08-16).
 *
 * Wpis CAŁEGO lotu po fakcie: telefon został w kurtce, bateria padła, lot spisany
 * na papierze. Od przebudowy wpis jest STEPPEREM o czterech krokach (jak lot normalny
 * 02 → 02E → 02A) i niesie PEŁNĄ PARITĘ z zapisem automatycznym: rodzaj operacji,
 * lotniska, klienta, Duala, dowolnie wiele lotów w jednym biegu, zrzuty i dolewki.
 *
 * Ten moduł trzyma SZKIC (`ManualFlightDraft`) wspólny dla czterech kroków, bramki
 * przejścia „DALEJ" per krok i budowę wejścia komendy `manualFlight`. Zero Reacta,
 * zero zegara systemowego — czas przychodzi argumentem.
 *
 * Ostrzeżenia o nieścisłościach (kolizje, łańcuch MH, bilans paliwa) mieszkają
 * OSOBNO w `manualFlightWarnings.ts`: blokada odpowiada „czy zapis w ogóle przejdzie
 * przez domenę", ostrzeżenie — „czy dane wyglądają na prawdziwe". Pierwsze blokuje,
 * drugie NIGDY (fakt lotu jest cenniejszy niż kompletność formularza).
 */

import type {
  EpochMillis,
  FuelMhReading,
  JumperCounts,
  OperationType,
} from '../../../domain';
import { isSameFieldOperation, utcDayStart } from '../../../domain';
import type { ManualFlightInput } from '../../../application';
import { timeUtc } from '../../format';

/** Jeden lot szkicu — para start → lądowanie; `id` tylko na potrzeby listy UI. */
export interface ManualFlightLegDraft {
  id: string;
  takeoff: EpochMillis;
  landing: EpochMillis;
}

/** Zrzut szkicu — czas + opcjonalny skład (null = „niepodany", nie zero). */
export interface ManualFlightDropDraft {
  id: string;
  at: EpochMillis;
  jumpers: JumperCounts | null;
  altitudeFt: number | null;
}

/**
 * Dolewka szkicu. Pilot wpisuje „ile dolano" i „stan po dolaniu" — stan PRZED liczy
 * się z tej pary (`beforeL = afterL − addedL`), bo trójka `RefuelPayload` musi się
 * domykać z definicji, a trzecie pole do ręcznego wypełnienia byłoby zaproszeniem
 * do trójki, która się nie sumuje.
 */
export interface ManualFlightRefuelDraft {
  id: string;
  at: EpochMillis;
  addedL: number;
  afterL: number;
}

/** Szkic wpisu ręcznego — stan wspólny czterech kroków. */
export interface ManualFlightDraft {
  // ── krok 1: samolot i data ──
  aircraftId: string | null;
  /** Doba UTC lotu (północ) — kotwica wszystkich godzin wpisu. */
  day: EpochMillis;
  dualId: string | null;

  // ── krok 2: zadanie ──
  /** `null` = jeszcze nie wybrano — wybór jest świadomy, bez wartości podstawionej. */
  operation: OperationType | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  client: string | null;
  notes: string | null;

  // ── krok 3: czasy ──
  engineStart: EpochMillis | null;
  engineStop: EpochMillis | null;
  flights: ManualFlightLegDraft[];
  drops: ManualFlightDropDraft[];

  // ── krok 4: liczniki ──
  refuels: ManualFlightRefuelDraft[];
  fuelBeforeL: number | null;
  fuelAfterL: number | null;
  mhBefore: number | null;
  mhAfter: number | null;
  /**
   * Olej przy przejęciu (issue #60). Na 02a pomiar jest krokiem WYMAGANYM (decyzja
   * 2026-08-27), ale wpis ręczny jest ŚWIADOMYM WYJĄTKIEM: lot z kartki sprzed
   * tygodnia może uczciwego pomiaru nie mieć, a fakt lotu jest cenniejszy niż
   * kompletność formularza (reguła flow 15). Bez oczekiwania z normy: wpis opisuje
   * przeszłość, a podpowiedź „ile powinno być TERAZ" mówiłaby o innym dniu
   * (ta sama reguła, co brak podpowiedzi zadania na 15a).
   */
  oilL: number | null;
  oilAddedL: number | null;
}

/**
 * Pusty szkic. Data lotu DOMYŚLNIE DZISIEJSZA (zgłoszenie z urządzenia): wpis ręczny
 * powstaje najczęściej tego samego dnia — ale jest polem, nie założeniem, więc lot
 * sprzed tygodnia też się wpisze.
 */
export function emptyManualFlightDraft(now: EpochMillis): ManualFlightDraft {
  return {
    aircraftId: null,
    day: utcDayStart(now),
    dualId: null,
    operation: null,
    departureIcao: null,
    arrivalIcao: null,
    client: null,
    notes: null,
    engineStart: null,
    engineStop: null,
    flights: [],
    drops: [],
    refuels: [],
    fuelBeforeL: null,
    fuelAfterL: null,
    mhBefore: null,
    mhAfter: null,
    oilL: null,
    oilAddedL: null,
  };
}

/** Kroki steppera — nazwy, nie numery, żeby blokada czytała się jak zdanie. */
export type ManualFlightStep = 'aircraft' | 'task' | 'times' | 'readings';

/**
 * Powód, dla którego „DALEJ" (albo „ZAPISZ LOT" na ostatnim kroku) nie zadziała;
 * `null` = wolno iść dalej. Blokada z powodem jest tańsza od odrzuconego zapisu
 * z wyjątkiem — ta sama zasada co `releaseBlocker` na 09b.
 *
 * Blokują wyłącznie rzeczy, które domena odrzuci TWARDO (kolejność czasów, dolewka
 * przy pracującym silniku, cofnięty licznik) albo bez których wpisu nie da się
 * złożyć. Wszystko miękkie — kolizje z innymi sesjami, łańcuch MH — jest
 * ostrzeżeniem w `manualFlightWarnings.ts` i NIE blokuje.
 */
export function manualFlightStepBlocker(
  step: ManualFlightStep,
  draft: ManualFlightDraft,
): string | null {
  switch (step) {
    case 'aircraft':
      if (draft.aircraftId == null) return 'Wybierz samolot, którego dotyczy lot.';
      return null;

    case 'task':
      if (draft.operation == null) return 'Wybierz rodzaj operacji.';
      return null;

    case 'times': {
      if (draft.engineStart == null || draft.engineStop == null) {
        return 'Wpisz godziny biegu silnika: uruchomienie i wyłączenie.';
      }
      if (draft.engineStart >= draft.engineStop) {
        return 'Wyłączenie silnika musi być po uruchomieniu.';
      }
      // Sesja bez ani jednego lotu ma swoją drogę na żywo (09C — zdanie bez lotu
      // z powodem); wpis ręczny nazywa się „LOT RĘCZNY" i lot jest jego treścią.
      if (draft.flights.length === 0) return 'Dodaj przynajmniej jeden lot.';
      for (const f of sortedFlights(draft)) {
        if (f.takeoff >= f.landing) {
          return `Lądowanie lotu ${timeUtc(f.takeoff)} → ${timeUtc(f.landing)} musi być po starcie.`;
        }
        if (f.takeoff < draft.engineStart || f.landing > draft.engineStop) {
          return `Lot ${timeUtc(f.takeoff)} → ${timeUtc(f.landing)} wypada poza biegiem silnika.`;
        }
      }
      const overlap = firstFlightOverlap(draft);
      if (overlap != null) {
        return `Loty ${timeUtc(overlap[0].takeoff)} → ${timeUtc(overlap[0].landing)} i ${timeUtc(overlap[1].takeoff)} → ${timeUtc(overlap[1].landing)} nakładają się na siebie.`;
      }
      return null;
    }

    case 'readings': {
      if (draft.fuelBeforeL == null || draft.mhBefore == null) {
        return 'Wpisz odczyt sprzed uruchomienia: paliwo i motogodziny.';
      }
      if (draft.fuelAfterL == null || draft.mhAfter == null) {
        return 'Wpisz odczyt po locie — to przekazanie dla następnego pilota.';
      }
      if (draft.mhAfter < draft.mhBefore) {
        return 'Licznik motogodzin nie może się cofnąć — stan po locie jest mniejszy niż przed.';
      }
      // Dolewka przy pracującym śmigle to twardy błąd domeny (REFUEL_ENGINE_RUNNING)
      // — mówimy to przy przycisku, zamiast pozwolić próbie generalnej odrzucić zapis.
      if (draft.engineStart != null && draft.engineStop != null) {
        const midRun = draft.refuels.find(
          (r) => r.at > draft.engineStart! && r.at < draft.engineStop!,
        );
        if (midRun != null) {
          return `Dolewka o ${timeUtc(midRun.at)} wypada przy pracującym silniku — dolewa się przed uruchomieniem albo po wyłączeniu.`;
        }
      }
      return null;
    }
  }
}

/** Bramka zapisu = wszystkie kroki naraz (ostatni krok widzi także błędy wcześniejszych). */
export function manualFlightBlocker(draft: ManualFlightDraft): string | null {
  return (
    manualFlightStepBlocker('aircraft', draft) ??
    manualFlightStepBlocker('task', draft) ??
    manualFlightStepBlocker('times', draft) ??
    manualFlightStepBlocker('readings', draft)
  );
}

/**
 * Szkic → wejście komendy `manualFlight`. `null`, dopóki `manualFlightBlocker`
 * czegoś nie puszcza — wołający nie musi dublować warunków.
 *
 * Trasa idzie za rodzajem operacji (issue #13): operacja jednopolowa (skoki) niesie
 * JEDNO lotnisko w obu rolach, pozostałe parę start → lądowanie.
 */
export function toManualFlightInput(
  draft: ManualFlightDraft,
  ids: { sessionUuid: string; picId: string },
): ManualFlightInput | null {
  if (manualFlightBlocker(draft) != null) return null;

  const sameField = isSameFieldOperation(draft.operation!);
  return {
    sessionUuid: ids.sessionUuid,
    aircraftId: draft.aircraftId!,
    picId: ids.picId,
    dualId: draft.dualId,
    operation: draft.operation!,
    departureIcao: draft.departureIcao,
    arrivalIcao: sameField ? draft.departureIcao : draft.arrivalIcao,
    client: draft.client,
    engine: { start: draft.engineStart!, stop: draft.engineStop! },
    flights: sortedFlights(draft).map((f) => ({ takeoff: f.takeoff, landing: f.landing })),
    drops: [...draft.drops]
      .sort((a, b) => a.at - b.at)
      .map((d) => ({ at: d.at, jumpers: d.jumpers, altitudeFt: d.altitudeFt })),
    refuels: [...draft.refuels]
      .sort((a, b) => a.at - b.at)
      .map((r) => ({ at: r.at, beforeL: r.afterL - r.addedL, addedL: r.addedL, afterL: r.afterL })),
    // ── ODCZYT POCZĄTKOWY COFA SIĘ O PORANNE DOLEWKI ──────────────────────────
    // Pole „przed uruchomieniem" pilot odczytuje PO porannym tankowaniu (zbiorniki
    // pełne, silnik jeszcze stoi) — ale w strumieniu odczyt preflightu pada PRZED
    // dolewką (tak wygląda każdy prawdziwy dzień: odczyt na 02a, tankowanie na 04a),
    // a rachunek zużycia liczy `start + dolane − koniec`. Bez cofnięcia dolane litry
    // weszłyby do rachunku PODWÓJNIE: raz w odczycie, raz w zdarzeniu dolewki —
    // sesja z porannym tankowaniem miałaby zużycie zawyżone dokładnie o dolewkę.
    initialReading: {
      fuelL: draft.fuelBeforeL! - preRunAddedL(draft),
      mh: draft.mhBefore!,
    } satisfies FuelMhReading,
    finalReading: { fuelL: draft.fuelAfterL!, mh: draft.mhAfter! } satisfies FuelMhReading,
    // Olej (issue #60): klucze tylko przy faktycznym wpisie — jak na 02a.
    ...(draft.oilL != null || draft.oilAddedL != null
      ? { oilL: draft.oilL, oilAddedL: draft.oilAddedL }
      : {}),
    notes: draft.notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze
// ─────────────────────────────────────────────────────────────────────────────

/** Loty szkicu w porządku czasu — kolejność dopisywania nie jest kolejnością dnia. */
export function sortedFlights(draft: ManualFlightDraft): ManualFlightLegDraft[] {
  return [...draft.flights].sort((a, b) => a.takeoff - b.takeoff);
}

/**
 * Suma litrów dolanych PRZED uruchomieniem silnika. Te dolewki poprzedzają odczyt
 * „przed uruchomieniem", więc odczyt już je zawiera — rachunek zużycia i łańcuch
 * paliwa muszą je odejmować, inaczej liczą je podwójnie.
 */
export function preRunAddedL(draft: ManualFlightDraft): number {
  if (draft.engineStart == null) return 0;
  return draft.refuels
    .filter((r) => r.at <= draft.engineStart!)
    .reduce((sum, r) => sum + r.addedL, 0);
}

/** Pierwsza para lotów, które na siebie zachodzą; `null` = loty rozłączne. */
function firstFlightOverlap(
  draft: ManualFlightDraft,
): [ManualFlightLegDraft, ManualFlightLegDraft] | null {
  const flights = sortedFlights(draft);
  for (let i = 1; i < flights.length; i++) {
    if (flights[i]!.takeoff < flights[i - 1]!.landing) {
      return [flights[i - 1]!, flights[i]!];
    }
  }
  return null;
}
