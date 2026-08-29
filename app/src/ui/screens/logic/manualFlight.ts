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
import { dualRequirementBlocker } from './dualRequirement';

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
 * ══ PALIWO TO TRZY LICZBY I ANI JEDNEJ GODZINY (issue #62, siódma tura) ══
 *
 * Zgłoszenie z urządzenia rozstrzygnęło kształt tej sekcji: „system wykrywa ilość
 * paliwa w oparciu o poprzedzający lot, później podaję, ile paliwa zostało dotankowane
 * oraz ile paliwa zostało po wykonaniu operacji. Nie ma sensu podawać godziny, kiedy
 * nastąpiło dolanie albo pomiar — to wynika z godzin, kiedy samolot został uruchomiony
 * i wyłączony."
 *
 * Zniknęła przez to CAŁA lista dolewek z osobnymi godzinami, a razem z nią trzy rzeczy,
 * które ta lista kosztowała:
 *  • godzina dolewki rozstrzygała tylko „przed czy po biegu", a minuta nie ważyła
 *    nigdzie — w obu oknach silnik stoi, więc żaden interwał analityki nie zmienia się
 *    od przesunięcia o kwadrans;
 *  • dolewkę dało się wpisać na ŚRODEK biegu, czyli w stan, który domena i tak odrzuca
 *    (`REFUEL_ENGINE_RUNNING`) — dziś taki stan jest NIEWYRAŻALNY;
 *  • odczyt „przed uruchomieniem" był stanem PO porannym tankowaniu, więc rachunek
 *    musiał go cofać o dolewki sprzed niego (`preRunAddedL`), inaczej litry liczyły się
 *    podwójnie. Szkic trzyma odtąd ZASTANE, czyli wprost ogniwo łańcucha — i cofać nie
 *    ma już czego.
 *
 * Kolejność jest naturalna i to ona zastępuje godziny: zastane → dolane → (lot) →
 * zostało. Tankuje się przed lotem, więc zdarzenie `refuel` składa się przy zapisie
 * tuż przed uruchomieniem silnika.
 */
export interface ManualFlightFuel {
  /**
   * ZASTANE — ile było w zbiorniku, gdy pilot brał maszynę. Wykrywane z sesji
   * poprzedzającej (`readings-chain`), korygowalne: paliwomierz bije rachubę.
   */
  foundL: number | null;
  /** DOLANE przed lotem; 0 = nie tankował. Jedna liczba, bez godziny i bez listy. */
  addedL: number;
  /** ZOSTAŁO po locie — to jest przekazanie dla następnego pilota. */
  afterL: number | null;
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
  /** Paliwo: zastane → dolane → zostało. Bez godzin — patrz `ManualFlightFuel`. */
  fuel: ManualFlightFuel;
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
    fuel: { foundL: null, addedL: 0, afterL: null },
    mhBefore: null,
    mhAfter: null,
    oilL: null,
    oilAddedL: null,
  };
}

/**
 * Czy w szkicu jest COKOLWIEK do stracenia (uwaga z urządzenia, 2026-08-29).
 *
 * Odpowiednik `preflightDraft.dirty()` i istnieje z tego samego powodu: „wstecz" nad
 * niepustym formularzem pyta o rezygnację, nad pustym wychodzi bez słowa — arkusz
 * „na pewno rezygnujesz?" nad formularzem, w którym nic nie ma, pytałby o zgodę na nic
 * (issue #55).
 *
 * ══ POROWNANIE JEST WYLICZONE Z PUSTEGO SZKICU, NIE WYPISANE Z PAMIĘCI ══
 * Lista pól `ManualFlightDraft` ma ich osiemnaście i rośnie z każdą turą zgłoszeń —
 * ręczna koniunkcja przestałaby być prawdziwa przy pierwszym nowym polu i nikt by tego
 * nie zauważył (bramka nawigacji nie ma jak krzyknąć). Iterujemy więc po KLUCZACH
 * pustego szkicu: nowe pole wchodzi do rachunku samo, w dniu, w którym powstaje.
 *
 * @param pristineDay doba, z jaką szkic powstał — bez niej zmiana DATY lotu wyglądałaby
 *   jak stan pusty, a jest pierwszym pytaniem kroku 1 i pełnoprawnym wyborem pilota.
 */
export function manualFlightDirty(draft: ManualFlightDraft, pristineDay: EpochMillis): boolean {
  const pristine = emptyManualFlightDraft(pristineDay);
  return (Object.keys(pristine) as (keyof ManualFlightDraft)[]).some((key) => {
    const mine = draft[key];
    const empty = pristine[key];
    // Puste tablice szkicu (loty, zrzuty) — każdy element jest wyborem pilota.
    if (Array.isArray(mine)) return mine.length > 0;
    // Zagnieżdżone liczby (paliwo) — kształt jest stały, więc porównanie tekstowe
    // jest tu bezpieczne i nie wymaga własnego deep-equala.
    if (mine !== null && typeof mine === 'object') return JSON.stringify(mine) !== JSON.stringify(empty);
    return mine !== empty;
  });
}

/** Kroki steppera — nazwy, nie numery, żeby blokada czytała się jak zdanie. */
export type ManualFlightStep = 'aircraft' | 'task' | 'times' | 'readings';

/*
 * `manualFlightNeedsDual` USUNIĘTE (uwaga z urządzenia, 2026-08-29). Było OSOBNĄ
 * funkcją obok bramki kroku wyłącznie po to, żeby brak Duala dawał `disabled` BEZ
 * powodu — a powód niósł baner pod listą. Odkąd powód ma stać w PRZYCISKU jak każdy
 * inny (`dualRequirement.ts`), wymóg jest zwykłą gałęzią `manualFlightStepBlocker`
 * i nie ma po co istnieć obok niej.
 */

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
  /**
   * Wymóg załogi dwuosobowej wybranej maszyny (§3.1). W bramce, a nie obok niej,
   * odkąd powód blokady stoi w przycisku — patrz `dualRequirement.ts`.
   */
  dualRequired?: boolean;
}

export function manualFlightStepBlocker(
  step: ManualFlightStep,
  draft: ManualFlightDraft,
  limits: ManualFlightLimits = { capacityL: null },
): string | null {
  switch (step) {
    case 'aircraft':
      if (draft.aircraftId == null) return 'Wybierz samolot, którego dotyczy lot.';
      // Kolejność jest kolejnością czynności: najpierw maszyna, potem to, czego ona
      // wymaga. Bez wybranej maszyny wymóg Duala nie ma o czym mówić.
      return dualRequirementBlocker({ dualRequired: limits.dualRequired === true }, draft.dualId);

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
        return 'Wpisz godzinę uruchomienia i wyłączenia silnika.';
      }
      if (draft.engineStart >= draft.engineStop) {
        return 'Wyłączenie silnika musi być po uruchomieniu.';
      }
      /* SESJA BEZ ANI JEDNEGO LOTU NIE JEST BŁĘDEM (uwaga z urządzenia, 2026-08-29:
         „mogła być taka sytuacja, że uruchomiłem i wyłączyłem, ale nie wykonałem
         żadnego lotu"). Blokada „Dodaj przynajmniej jeden lot" stała tu od przebudowy
         15 z uzasadnieniem „wpis nazywa się LOT RĘCZNY, więc lot jest jego treścią" —
         i to uzasadnienie było fałszywe: flow na żywo ma dla tego stanu WŁASNY ekran
         (09C, zdanie bez lotu — pogoda, usterka, próba silnika), a domena traktuje go
         miękko (`NO_FLIGHT_WITHOUT_REASON` to flaga, nie odmowa). Skoro sesja bez lotu
         jest legalna w locie, jest legalna także z kartki; blokada odbierała pilotowi
         zapisanie czasu, w którym maszyna była zajęta.
         Mówi o tym odtąd OSTRZEŻENIE (`manualFlightWarnings`), jak przy braku zrzutu. */
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
      const { foundL, addedL, afterL } = draft.fuel;

      if (foundL == null || draft.mhBefore == null) {
        // `initialReading` jest w `ManualFlightInput` WYMAGANE — bez niego nie da się
        // złożyć wejścia komendy, a zgadywanie z cache psuło łańcuch (2026-08-16).
        // Wykrycie z sesji poprzedzającej jest PODPOWIEDZIĄ, nie zwolnieniem z pytania.
        return 'Wpisz stan zastany: paliwo i motogodziny.';
      }
      if (afterL == null || draft.mhAfter == null) {
        return 'Wpisz stan po locie — to przekazanie dla następnego pilota.';
      }

      // FUEL_NEGATIVE / MH_NEGATIVE — wartość ujemna jest twardym błędem domeny.
      if (foundL < 0 || afterL < 0) return 'Stan paliwa nie może być ujemny.';
      if (addedL < 0) return 'Dolane paliwo nie może być ujemne.';
      if (draft.mhBefore < 0 || draft.mhAfter < 0) {
        return 'Odczyt licznika motogodzin nie może być ujemny.';
      }

      // FUEL_OVER_CAPACITY — przy nieznanej pojemności reguła ŚPI, jak w domenie.
      // Sufitem jest stan PO zatankowaniu: to jego niesie odczyt przy przejęciu.
      if (limits.capacityL != null) {
        const over = Math.max(foundL + addedL, afterL);
        if (over > limits.capacityL) {
          return `Stan ${Math.round(over)} L przekracza pojemność zbiorników (${Math.round(limits.capacityL)} L).`;
        }
      }

      // MH_REGRESSION — licznik motogodzin nie chodzi wstecz.
      if (draft.mhAfter < draft.mhBefore) {
        return 'Licznik motogodzin nie może się cofnąć — stan po locie jest mniejszy niż przed.';
      }

      // FUEL_INCREASE_WITHOUT_REFUEL — paliwo nie przybywa samo. Sufitem jest stan
      // po zatankowaniu; tolerancja ta sama, co w domenie i na serwerze, żeby trzy
      // miejsca nie mówiły o tej samej liczbie trzech różnych rzeczy.
      const ceilingL = foundL + addedL;
      if (afterL > ceilingL + fuelToleranceL(limits.capacityL)) {
        return `Po locie (${Math.round(afterL)} L) jest więcej paliwa niż przed startem (${Math.round(ceilingL)} L) — brakuje dolewki?`;
      }

      /* REFUEL_ENGINE_RUNNING nie ma tu już czego pilnować: dolewka nie niesie własnej
         godziny, tylko składa się przy zapisie tuż PRZED uruchomieniem silnika, więc
         stan „dolewka przy pracującym śmigle" jest NIEWYRAŻALNY. To jest cały zysk
         z rezygnacji z godzin (issue #62, siódma tura). */
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
 * Ile paliwa było w zbiorniku PRZY STARCIE: zastane plus dolane.
 *
 * To jest liczba, którą pilot zobaczyłby na paliwomierzu tuż przed uruchomieniem —
 * i to ona jest sufitem stanu po locie (paliwo nie przybywa samo) oraz punktem
 * odniesienia rachunku zużycia.
 */
export function fuelAtStartL(draft: ManualFlightDraft): number | null {
  const { foundL, addedL } = draft.fuel;
  return foundL == null ? null : foundL + addedL;
}

/** Ile ubyło w tej sesji; `null` = brak któregoś końca, więc rachunku nie ma. */
export function fuelUsedL(draft: ManualFlightDraft): number | null {
  const start = fuelAtStartL(draft);
  return start == null || draft.fuel.afterL == null ? null : start - draft.fuel.afterL;
}

/**
 * Godzina zdarzenia `refuel` składanego przy zapisie — MINUTA PRZED uruchomieniem.
 *
 * Pilot jej nie podaje i nie powinien (issue #62, siódma tura): tankuje się przed
 * lotem, a minuta w tym oknie nie waży nigdzie, bo silnik stoi. Ta jedna minuta
 * odstępu ma znaczenie WYŁĄCZNIE porządkowe — dolewka musi paść przed
 * `preflight_confirm`, żeby odczyt przy przejęciu opisywał stan PO zatankowaniu.
 */
export function refuelAt(draft: ManualFlightDraft): EpochMillis | null {
  return draft.engineStart == null ? null : draft.engineStart - 60_000;
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
    /*
     * DOLEWKA SKŁADA SIĘ TU, a nie w formularzu (issue #62, siódma tura). Jedna,
     * minutę przed uruchomieniem, i tylko gdy pilot faktycznie tankował — zero
     * litrów nie jest zdarzeniem. Trójka domyka się z definicji, bo wszystkie trzy
     * liczby biorą się z tej samej pary: zastane i dolane.
     */
    refuels:
      draft.fuel.addedL > 0
        ? [
            {
              at: refuelAt(draft)!,
              beforeL: draft.fuel.foundL!,
              addedL: draft.fuel.addedL,
              afterL: draft.fuel.foundL! + draft.fuel.addedL,
            },
          ]
        : [],
    /*
     * ODCZYT POCZĄTKOWY = ZASTANE, wprost i bez arytmetyki.
     *
     * Do siódmej tury szkic trzymał stan PO porannym tankowaniu i rachunek musiał go
     * cofać o dolewki sprzed niego, inaczej litry liczyły się podwójnie: raz w odczycie,
     * raz w zdarzeniu dolewki. Odkąd pilot podaje ZASTANE, cofać nie ma czego — a cała
     * ta pułapka przestała istnieć razem z polem, które ją tworzyło.
     */
    initialReading: {
      fuelL: draft.fuel.foundL!,
      mh: draft.mhBefore!,
    } satisfies FuelMhReading,
    finalReading: { fuelL: draft.fuel.afterL!, mh: draft.mhAfter! } satisfies FuelMhReading,
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

/*
 * `preRunAddedL` USUNIĘTE (issue #62, siódma tura). Cofało odczyt początkowy o dolewki
 * sprzed uruchomienia, bo szkic trzymał stan PO porannym tankowaniu. Szkic trzyma odtąd
 * ZASTANE, więc nie ma czego cofać — a pułapka „dolane litry liczą się podwójnie"
 * zniknęła razem z polem, które ją tworzyła.
 */

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
