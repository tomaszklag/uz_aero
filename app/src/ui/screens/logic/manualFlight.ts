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
import { fuelToleranceL, isSameFieldOperation, utcDayStart } from '../../../domain';
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
 * Czy krok 1 stoi na braku drugiego pilota (issue #58 pkt 4). Wymóg Duala jest
 * właściwością SAMOLOTU (§3.1) i na preflightcie egzekwuje go `step1Valid` —
 * wpis ręczny opisuje ten sam lot tym samym prawem, więc An-2 z kartki też nie
 * przechodzi bez drugiego pilota. Osobna funkcja, nie gałąź `manualFlightStepBlocker`:
 * blokada ma być `disabled` bez własnego tekstu, bo powód stoi już w banerze nad
 * listą wyboru (ta sama decyzja co na 02 — drugi napis powtarzałby to samo zdanie).
 */
export function manualFlightNeedsDual(
  aircraft: { dualRequired: boolean } | null,
  draft: Pick<ManualFlightDraft, 'dualId'>,
): boolean {
  return aircraft != null && aircraft.dualRequired && draft.dualId == null;
}

/**
 * Powód, dla którego „DALEJ" (albo „ZAPISZ LOT" na ostatnim kroku) nie zadziała;
 * `null` = wolno iść dalej. Blokada z powodem jest tańsza od odrzuconego zapisu
 * z wyjątkiem — ta sama zasada co `releaseBlocker` na 09b.
 *
 * Blokują rzeczy, które domena odrzuci TWARDO (kolejność czasów, dolewka przy
 * pracującym silniku, cofnięty licznik), te, bez których wpisu nie da się złożyć —
 * oraz JEDEN wymóg czysto produktowy: trasa (issue #58, uzasadnienie przy kroku
 * `task`). Wszystko miękkie — kolizje z innymi sesjami, łańcuch MH — jest
 * ostrzeżeniem w `manualFlightWarnings.ts` i NIE blokuje.
 */
/**
 * Granice jednostki potrzebne bramce (issue #62, piąta tura). `capacityL === null`
 * usypia sufit pojemności — dokładnie tak, jak robi to `checkCapacity` w domenie:
 * bez wiedzy o zbiorniku nie orzekamy o odczycie (§4.8).
 */
export interface ManualFlightLimits {
  capacityL: number | null;
}

export function manualFlightStepBlocker(
  step: ManualFlightStep,
  draft: ManualFlightDraft,
  limits: ManualFlightLimits = { capacityL: null },
): string | null {
  switch (step) {
    case 'aircraft':
      if (draft.aircraftId == null) return 'Wybierz samolot, którego dotyczy lot.';
      return null;

    case 'task': {
      if (draft.operation == null) return 'Wybierz rodzaj operacji.';
      // Trasa jest WYMAGANA (issue #58, kolejna tura z urządzenia): wpis opisuje lot,
      // który JUŻ się odbył — pilot zna lotnisko, więc „jeszcze nie wiem" tu nie
      // istnieje, a brak trasy w zapisie po fakcie byłby dziurą w rejestrze, nie
      // odroczoną decyzją. To świadome odejście od 02E, gdzie pustą trasę wolno
      // zostawić (start silnika ma trwać sekundy — fakt lotu > kompletność
      // formularza). Kształt wymogu idzie za rodzajem operacji (issue #13).
      if (isSameFieldOperation(draft.operation)) {
        return draft.departureIcao == null ? 'Wybierz lotnisko.' : null;
      }
      if (draft.departureIcao == null) return 'Wybierz lotnisko startu.';
      if (draft.arrivalIcao == null) return 'Wybierz lotnisko lądowania.';
      return null;
    }

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

    /**
     * ══ CO TU BLOKUJE, A CO TYLKO OSTRZEGA (issue #62, piąta tura z urządzenia) ══
     * Zgłoszenie prosiło, żeby „nic nie blokowało — tylko ostrzeżenia wymagające
     * reakcji". Reguła obowiązuje wszystko, co jest OCENĄ danych: ciągłość paliwa
     * z sąsiednimi sesjami, łańcuch MH, werdykt normy, bilans. Te nie blokują nigdy
     * i mieszkają w `manualFlightWarnings.ts`.
     *
     * Blokada zostaje wyłącznie tam, gdzie DOMENA I TAK ODMÓWI zapisu — bo wtedy
     * wybór nie jest między „zablokować a wpuścić", tylko między „powiedzieć teraz"
     * a „wywalić się po tapnięciu w ZAPISZ". Komenda `manualFlight` robi próbę
     * generalną CAŁEJ sekwencji i przy pierwszym twardym naruszeniu rzuca
     * `DomainRuleError`, nie zapisując ani jednego zdarzenia — pilot straciłby tapnięcie
     * i zobaczył czerwony baner zamiast nazwanego powodu przy przycisku (§6 pkt 3).
     *
     * Każda pozycja niżej odpowiada konkretnemu `error` z `rules/sessionRules.ts`.
     */
    case 'readings': {
      if (draft.fuelBeforeL == null || draft.mhBefore == null) {
        // `initialReading` jest w `ManualFlightInput` WYMAGANE — bez niego nie da się
        // złożyć wejścia komendy, a zgadywanie z cache psuło łańcuch (2026-08-16).
        return 'Wpisz odczyt sprzed uruchomienia: paliwo i motogodziny.';
      }
      if (draft.fuelAfterL == null || draft.mhAfter == null) {
        return 'Wpisz odczyt po locie — to przekazanie dla następnego pilota.';
      }

      // FUEL_NEGATIVE / MH_NEGATIVE — odczyt ujemny jest twardym błędem domeny.
      if (draft.fuelBeforeL < 0 || draft.fuelAfterL < 0) {
        return 'Odczyt paliwa nie może być ujemny.';
      }
      if (draft.mhBefore < 0 || draft.mhAfter < 0) {
        return 'Odczyt licznika motogodzin nie może być ujemny.';
      }
      const negative = draft.refuels.find((r) => r.addedL < 0 || r.afterL < 0);
      if (negative != null) {
        return `Dolewka o ${timeUtc(negative.at)} ma wartość ujemną — dolewa się dodatnie litry.`;
      }

      // FUEL_OVER_CAPACITY — przy nieznanej pojemności reguła ŚPI, jak w domenie.
      if (limits.capacityL != null) {
        const over = Math.max(
          draft.fuelBeforeL,
          draft.fuelAfterL,
          ...draft.refuels.map((r) => r.afterL),
        );
        if (over > limits.capacityL) {
          return `Odczyt ${Math.round(over)} L przekracza pojemność zbiorników (${Math.round(limits.capacityL)} L).`;
        }
      }

      // MH_REGRESSION — licznik motogodzin nie chodzi wstecz.
      if (draft.mhAfter < draft.mhBefore) {
        return 'Licznik motogodzin nie może się cofnąć — stan po locie jest mniejszy niż przed.';
      }

      // FUEL_INCREASE_WITHOUT_REFUEL — paliwo nie przybywa samo. Punktem odniesienia
      // jest OSTATNI znany stan (dolewka albo odczyt początkowy), bo tak liczy to
      // domena przy `day_close`; tolerancja ta sama, żeby telefon i serwer nie
      // mówiły o tej samej liczbie dwóch różnych rzeczy.
      const lastKnownL = lastKnownFuelL(draft);
      if (draft.fuelAfterL > lastKnownL + fuelToleranceL(limits.capacityL)) {
        return `Paliwa po locie (${Math.round(draft.fuelAfterL)} L) jest więcej niż ostatni znany stan (${Math.round(lastKnownL)} L) — brakuje dolewki?`;
      }

      // REFUEL_ENGINE_RUNNING — dolewa się przy zatrzymanym śmigle.
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
export function manualFlightBlocker(
  draft: ManualFlightDraft,
  limits?: ManualFlightLimits,
): string | null {
  return (
    manualFlightStepBlocker('aircraft', draft, limits) ??
    manualFlightStepBlocker('task', draft, limits) ??
    manualFlightStepBlocker('times', draft, limits) ??
    manualFlightStepBlocker('readings', draft, limits)
  );
}

/**
 * Ostatni ZNANY stan paliwa przed odczytem końcowym: `afterL` najpóźniejszej dolewki,
 * a bez dolewek — odczyt sprzed uruchomienia. To jest punkt, względem którego domena
 * pyta „czy paliwo nie przybyło samo" przy zdaniu samolotu.
 */
export function lastKnownFuelL(draft: ManualFlightDraft): number {
  const latest = [...draft.refuels].sort((a, b) => a.at - b.at).at(-1);
  return latest?.afterL ?? draft.fuelBeforeL ?? 0;
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
