/**
 * UZ Aero (dane demo) — SCENARIUSZ CZTERECH TYGODNI KLUBU.
 *
 * Czysta funkcja `buildScenario(now)` → paczki zdarzeń w kolejności wysyłki + akcje
 * administratora do wykonania po nich. Zero I/O: ten sam scenariusz jedzie w teście
 * (PGlite przez prawdziwe gniazdo) i w skrypcie (`scripts/seedDemo.ts`, HTTP).
 *
 * ══ PROPORCJE: NAJPIERW NORMALNY KLUB, PATOLOGIE JAKO MNIEJSZOŚĆ ══
 * Poprzednia wersja tego pliku była ZBIOREM AWARII: po jednym egzemplarzu każdej flagi
 * i prawie nic poza tym, więc panel pokazywał klub, w którym wszystko jest zepsute.
 * To uczy złej rzeczy — administrator, który widzi skrzynkę pełną zawsze, przestaje ją
 * czytać, a wrażenie „u nas ciągle coś nie gra" bierze się z danych demo, nie z lotów.
 *
 * Dziś proporcja jest odwrotna: **52 sesje, z czego 7 niesie flagę** (~13%), a reszta to
 * zwykłe dni klubu — skoki, egzaminy, przeloty, próby silnika po obsłudze. Po jednym
 * egzemplarzu KAŻDEGO typu flagi zostaje, bo na nich stoją ekrany A03/A03a/A05 i bez
 * nich seed „cicho degraduje" do panelu, w którym nic nie ma. Wyjątkiem są nakładki
 * MASZYNY: są DWIE, bo A03a pokazuje flagę ROZWIĄZANĄ, a A05 wiersz „brak karty" pod
 * flagą wciąż OTWARTĄ — jeden egzemplarz nie może być jednocześnie w obu stanach.
 *
 * Nowy model (§3.6a) w ogóle na to pozwolił: przy „jeden samolot = jeden dzień" tło
 * z krótkich sesji nie istniało, bo każda sesja zajmowała całą dobę maszyny.
 *
 * ┌ Flaga / stan ───────────┬ Gdzie ──────────────────┬ Po co ────────────────────────┐
 * │ mh_gap                  │ SP-AXA, D−16 (AKO)      │ A03: skrzynka, nieblokująca   │
 * │ mh_regression           │ SP-ANK, D−18 (JSE)      │ A03 + A02a: cofnięty licznik  │
 * │ fuel_mismatch           │ SP-KWA, D−20 (PWI)      │ A03: tolerancja z pojemności  │
 * │ clock_drift             │ SP-FGK, D−13 (JSE)      │ A04: rozjazd zegara telefonu  │
 * │ aircraft_overlap (open) │ SP-KWA, D−7 × D−6       │ A03 blokuje + A05 „brak karty"│
 * │ aircraft_overlap (res.) │ SP-ANK, D−12 × D−11     │ A03a: rozwiązanie → 2 karty   │
 * │ pilot_overlap           │ AKO: SP-KWA D−7 + ANK   │ A03: grafik, arkusza NIE tyka │
 * │ doba z dwiema zmianami  │ SP-AXA D−18 i D−4       │ A05: 1 karta, rewizje 1 i 2   │
 * │ zdanie bez lotu (09C)   │ SP-FGK D−25, SP-KWA D−9 │ A02a: powód, po co maszyna    │
 * │ rewizja 2 w dzienniku   │ SP-FGK, D−15 (ponów)    │ A05: 2 wiersze, 1 karta       │
 * │ korekta po 24 h         │ SP-AXA, D−13 (void drop)│ A02b + A04: przekreślony wpis │
 * │ zetknięcie sesji        │ KRZ D−2: FGK → AXA      │ NIE jest nakładką (§4.7)      │
 * │ sesja W TOKU DZIŚ       │ SP-FGK, KRZ             │ A01 + telefon: przejęcie PIC  │
 * │ konto nieaktywne        │ JSE                     │ A06 + 00-login: odmowa        │
 * └─────────────────────────┴─────────────────────────┴───────────────────────────────┘
 *
 * ══ MATERIAŁ DO KALIBRACJI ANALITYKI (§3.6b ZAMKNIĘTE PRZEZ PIVOT 2026-08-10) ══
 * Po pivocie każda sesja jest domknięta odczytami z OBU stron (przejęcie → zdanie),
 * więc interwał paliwowy = sesja, a granice pośrednie stawiają wyłącznie tankowania.
 * Różnorodność, na której `consumptionReplay.ts` ma co kalibrować, pochodzi teraz
 * z OPERACJI, nie ze stylu pracy pilota:
 *
 *   skoki      — jeden bieg z 4–9 LOTAMI i gorącym załadunkiem: przewaga lotu nad ziemią
 *   techniczny — próba na ziemi + krótki oblot W JEDNYM biegu: jedyna przewaga ziemi
 *   przerwany bieg — 12 min silnika bez startu: interwał POD progiem 30 min
 *   ferry/egzamin — długi pojedynczy lot
 *
 * **Progów tu NIE stroimy** — od tego jest `scripts/consumptionReplay.ts` na tych danych.
 *
 * ══ DLACZEGO NAKŁADKI WYMAGAJĄ DWÓCH PACZEK ══
 * `aircraft_overlap` powstaje, gdy w chwili liczenia flag samolot ma WIĘCEJ NIŻ JEDNĄ
 * niezamkniętą sesję (`domain/mhChain.ts`). Sesja wysłana jedną paczką razem z `day_close`
 * jest w tej chwili już zamknięta, więc nakładki nigdy by nie zrobiła. Dlatego sesje
 * nakładające się jadą rozdzielone: najpierw przejęcie, potem reszta — dokładnie tak,
 * jak robi to telefon synchronizujący w trakcie pracy.
 *
 * ══ CZEGO SCENARIUSZ PILNUJE, ŻEBY NIE ZROBIĆ ══
 * `pilot_overlap` ma być JEDEN i ZAMIERZONY. Flaga powstaje z sesji jednego pilota
 * nachodzących w czasie na RÓŻNYCH maszynach, a sesja niezamknięta nachodzi na wszystko,
 * co ten pilot weźmie później. Stąd twarda reguła planu: **pilot, którego sesja zostaje
 * otwarta (`leaveOpen`, `lateRelease`, `split`), nie siada do innej maszyny, dopóki ta
 * sesja się nie domknie** — z jedynym wyjątkiem AKO po D−7, który jest właśnie tym
 * zamierzonym egzemplarzem. Poprzednia wersja tej reguły nie miała i produkowała pięć
 * nakładek grafiku, z czego cztery były wadą DANYCH, nie detektora.
 */

import type { FlagType, NoFlightReason } from '@uzaero/domain';

import {
  sessionStream,
  type DemoRefuel,
  type DemoRun,
  type DemoSession,
  type WireEvent,
} from './sessionStream.ts';

/** Paczka `POST /events` — tyle, ile telefon wysyła jednym strzałem. */
export interface DemoBatch {
  /** Nadawca. MUSI być PIC-em wszystkich zdarzeń paczki (single-writer, §4.4). */
  picId: string;
  sourceDevice: string;
  events: WireEvent[];
  /** Jedno zdanie do logu skryptu — po co ta paczka jedzie osobno. */
  note: string;
}

/**
 * Akcja administratora po stronie panelu.
 *
 * Flagę wskazujemy OPISEM, a nie identyfikatorem: `flags.id` jest sekwencją nadawaną
 * przy ingeście, więc scenariusz nie ma prawa go znać. Wykonawca dopyta
 * `GET /admin/api/flags` i dopiero wtedy pozna numer.
 */
export type DemoAdminAction =
  | {
      kind: 'resolve_flag';
      actorId: string;
      flag: { type: FlagType; aircraftId: string; sessionUuid: string };
      note: string;
      why: string;
    }
  | {
      kind: 'void_event';
      actorId: string;
      sessionUuid: string;
      targetUuid: string;
      reason: string;
      why: string;
    }
  | { kind: 'retry_export'; actorId: string; sessionUuid: string; why: string }
  | { kind: 'deactivate_pilot'; actorId: string; pilotId: string; why: string };

export interface DemoScenario {
  batches: DemoBatch[];
  adminActions: DemoAdminAction[];
  /** Konta, na które musi zalogować się wykonawca — wyliczone z paczek. */
  pilotIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Flota i piloci — DOKŁADNIE ci z `infrastructure/pg/seed.ts`
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pojemność i format MH muszą się zgadzać z seedem referencyjnym, bo tolerancja
 * `fuel_mismatch` liczy się z pojemności (`max(10 L, 5% capacity)`) — rozjazd tutaj
 * dałby scenariusz, który obiecuje flagę, a jej nie produkuje.
 *
 * ══ DWIE STAWKI, A NIE JEDNA — I TO JEST WARUNEK SENSU CAŁEJ ANALITYKI ══
 * Model zużycia (`packages/domain/src/consumption/`) istnieje po to, żeby ROZDZIELIĆ
 * palenie na ziemi od palenia w locie. Generator, który spala tyle samo w obu fazach,
 * produkuje dane, w których tego podziału NIE MA — i model słusznie schodzi wtedy na
 * jedną stawkę z powodem `collinear`. Pierwszy przebieg replaya po przebudowie pokazał
 * dokładnie to (R² = 1.00, ±0%, jedna stawka `engine`), więc dane demo nie umiały
 * odpowiedzieć na pytanie, dla którego ten model powstał.
 *
 * Stawki ziemi są rzędu jednej trzeciej lotu — tyle pali silnik na wolnych obrotach
 * podczas kołowania i załadunku skoczków.
 */
const FLEET = {
  'SP-AXA': { capacityL: 330, mhFormat: 'hhmm', flightLPerH: 42, groundLPerH: 15 },
  'SP-FGK': { capacityL: 330, mhFormat: 'hhmm', flightLPerH: 40, groundLPerH: 14 },
  'SP-ANK': { capacityL: 1700, mhFormat: 'hhmm', flightLPerH: 135, groundLPerH: 45 },
  'SP-KWA': { capacityL: 200, mhFormat: 'decimal', flightLPerH: 28, groundLPerH: 10 },
} as const;

type AircraftId = keyof typeof FLEET;

/**
 * Stan liczników PRZED oknem scenariusza — punkt zerowy łańcucha MH każdego samolotu.
 * SP-AXA startuje od 1234.5 MH / 150 L, czyli od liczb kanonicznego dnia z §4.5, które
 * chodzą przez testy ingestu i ekran 10 telefonu.
 */
const OPENING_STATE: Record<AircraftId, { mh: number; fuelL: number }> = {
  'SP-AXA': { mh: 1234.5, fuelL: 150 },
  'SP-FGK': { mh: 892.3, fuelL: 180 },
  'SP-ANK': { mh: 4310.0, fuelL: 900 },
  'SP-KWA': { mh: 615.4, fuelL: 120 },
};

const CLIENTS = ['Skydive Kraków', 'AeroKlub Podhalański', 'Tandem Team', 'FreeFall Silesia'];

const DAY_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Kształt BIEGU — profil czasowy jedynego cyklu silnika sesji (pivot 2026-08-10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Profil JEDNEGO biegu: minuty liczone od uruchomienia silnika. Loty następują
 * w środku biegu (gorący załadunek — silnik pracuje między lotami), a pusta tablica
 * `flights` to próba silnika bez startu.
 */
interface RunShape {
  taxi: number | null;
  flights: Array<{ takeoff: number; landing: number }>;
  stop: number;
}

/**
 * Bieg skokowy Cessny: 3 min kołowania, potem seria lotów po 24 min z gorącym
 * załadunkiem 8 min między nimi — silnik NIE gaśnie (to jest sedno pivotu: dzień
 * skokowy to jeden bieg z N lotami, jedno przejęcie i jeden odczyt na końcu).
 */
function jumpRunC182(flights: number): RunShape {
  const rows = Array.from({ length: flights }, (_, i) => {
    const takeoff = 5 + i * 32; // 24 min lotu + 8 min załadunku
    return { takeoff, landing: takeoff + 24 };
  });
  return { taxi: 3, flights: rows, stop: (rows[rows.length - 1]?.landing ?? 5) + 4 };
}

/** An-2 wznosi się wolniej i wozi więcej ludzi — dłuższe loty, dłuższy załadunek. */
function jumpRunAn2(flights: number): RunShape {
  const rows = Array.from({ length: flights }, (_, i) => {
    const takeoff = 8 + i * 43; // 31 min lotu + 12 min załadunku
    return { takeoff, landing: takeoff + 31 };
  });
  return { taxi: 4, flights: rows, stop: (rows[rows.length - 1]?.landing ?? 8) + 4 };
}

const FERRY_RUN: RunShape = { taxi: 4, flights: [{ takeoff: 7, landing: 102 }], stop: 106 };
const EXAM_RUN: RunShape = { taxi: 4, flights: [{ takeoff: 7, landing: 81 }], stop: 85 };
const OTHER_RUN: RunShape = { taxi: 4, flights: [{ takeoff: 7, landing: 54 }], stop: 58 };

/**
 * Obsługa techniczna W JEDNYM biegu: 40 min próby na ziemi, potem krótki oblot
 * kontrolny. Do pivotu były to dwa cykle; po nim drugiego startu w sesji nie ma,
 * więc próba i oblot muszą zmieścić się w jednym biegu — i analitycznie to jest
 * LEPSZA obserwacja: dużo ziemi i trochę lotu w jednym interwale rozdziela stawki
 * mocniej niż dwa osobne odcinki.
 */
const MAINTENANCE_RUN: RunShape = { taxi: 40, flights: [{ takeoff: 44, landing: 77 }], stop: 81 };

/**
 * Bieg PRZERWANY na kołowaniu — 12 min pracy silnika i powrót na płytę.
 *
 * Po pivocie to OSOBNA SESJA (drugiego startu w sesji nie ma — pilot zdaje maszynę
 * i przejmuje ją od nowa) i jedyne źródło interwału KRÓTSZEGO niż próg 30 min
 * (`MIN_INTERVAL_ENGINE_MS`). Bez niego replay nie ma czego odrzucić na tym progu.
 */
const ABORTED_RUN: RunShape = { taxi: 3, flights: [], stop: 12 };

// ─────────────────────────────────────────────────────────────────────────────
// Plan sesji — jedna tabela, którą da się przeczytać w całości
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Jak sesja jest wysyłana:
 *  • `full`         — jedna paczka z całą sesją (telefon zsynchronizował po zdaniu);
 *  • `split`        — przejęcie osobno, reszta osobno (tworzy nakładkę z maszyną,
 *                     której poprzednia sesja jest niezamknięta);
 *  • `leaveOpen`    — bez `day_close`, samolot zostaje zajęty NA STAŁE;
 *  • `lateRelease`  — sesja jedzie bez zdania, a `day_close` dojeżdża spóźnioną paczką.
 */
type Delivery = 'full' | 'split' | 'leaveOpen' | 'lateRelease';

interface SessionPlan {
  /** Ile dni przed „dziś" (UTC). */
  offset: number;
  aircraftId: AircraftId;
  picId: string;
  dualId: string | null;
  operation: DemoSession['operation'];
  clientIndex: number | null;
  /**
   * Liczba LOTÓW w jedynym biegu sesji (pivot 2026-08-10: sesja = jeden bieg silnika,
   * dzień skokowy to N lotów z gorącym załadunkiem). `0` bez `abortedRun` = sesja,
   * w której silnik NIE ruszył (ekran 09C) — `day_close` niesie wtedy powód.
   */
  lifts: number;
  /**
   * Minuta uruchomienia silnika (od północy UTC). `'handoff'` znaczy „przejęcie CO DO
   * MINUTY po zdaniu poprzedniej maszyny przez tego samego pilota" — układ, który po
   * §3.6a jest normalnym dniem, a NIE nakładką grafiku (§4.7). Wiersz z `'handoff'`
   * musi stać bezpośrednio po wierszu tego samego pilota z tej samej doby.
   */
  firstEngineMin: number | 'handoff';
  delivery: Delivery;
  /**
   * Bieg PRZERWANY na kołowaniu (12 min silnika, zero lotów). Po pivocie to CAŁA
   * sesja — drugiego startu nie ma, więc kontynuacja dnia to NASTĘPNY wiersz planu
   * (`'handoff'` tego samego pilota) z własnym przejęciem.
   */
  abortedRun?: true;
  /**
   * Przyrostek identyfikatora sesji. Konieczny, gdy ten sam pilot bierze tę samą
   * maszynę dwa razy w jednej dobie (np. po przerwanym biegu) — bez niego dwa wiersze
   * planu złożyłyby się w jeden uuid i drugi zamieniłby się w duplikaty pierwszego.
   */
  uuidSuffix?: string;
  /**
   * Tankowanie PO zatrzymaniu silnika, przed zdaniem (kokpit 04, model 2026-08-10).
   * Materiał na log sesji z dolewką po locie; interwał paliwowy za biegiem ma zero
   * czasu silnika i replay słusznie go odrzuci — to część materiału, nie wada.
   */
  refuelAfter?: true;
  /** Powód zdania bez lotu — wypełniany dokładnie wtedy, gdy silnik nie ruszył (09C). */
  noFlightReason?: NoFlightReason;
  /** Notatka pilota do dnia (issue #14). */
  notes?: string;
  /** Celowy rozjazd odczytu MH względem przekazania (h) — źródło `mh_gap`/`mh_regression`. */
  mhAnomalyH?: number;
  /** Celowy rozjazd odczytu paliwa względem przekazania (L) — źródło `fuel_mismatch`. */
  fuelAnomalyL?: number;
  /** Rozjazd zegara telefonu (ms) — źródło `clock_drift`. */
  clockDriftMs?: number;
}

/**
 * Cztery tygodnie klubu, chronologicznie (od najstarszego). Kolejność wierszy JEST
 * kolejnością wysyłki — na niej stoi cały mechanizm nakładek, bo flagi liczą się
 * ze stanu świata w chwili przyjęcia paczki, a nie z dat w payloadzie.
 *
 * Wiersze tej samej doby stoją w kolejności GODZINOWEJ, bo w tej samej kolejności
 * przesuwa się łańcuch liczników maszyny (dwie zmiany jednego samolotu w dobie są
 * po §3.6a normą, nie wyjątkiem).
 */
const PLAN: readonly SessionPlan[] = [
  // ── Tydzień 1 ────────────────────────────────────────────────────────────────
  { offset: 28, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 6, firstEngineMin: 505, delivery: 'full' },
  { offset: 28, aircraftId: 'SP-KWA', picId: 'TMK', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 1, firstEngineMin: 600, delivery: 'full', notes: 'Po wymianie świec — próba na ziemi i oblot.' },
  { offset: 27, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 8, firstEngineMin: 495, delivery: 'full' },
  { offset: 27, aircraftId: 'SP-ANK', picId: 'AKO', dualId: 'KRZ', operation: 'skoki', clientIndex: 0, lifts: 4, firstEngineMin: 540, delivery: 'full' },
  { offset: 26, aircraftId: 'SP-FGK', picId: 'AKO', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 570, delivery: 'full' },
  // Dolewka PO zatrzymaniu, przed zdaniem — log sesji z tankowaniem po obu stronach biegu.
  { offset: 26, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 5, firstEngineMin: 500, delivery: 'full', refuelAfter: true },
  // Pogoda zamknęła plac: maszyna była zajęta 1:22 i nikt nigdzie nie poleciał (09C).
  { offset: 25, aircraftId: 'SP-FGK', picId: 'KRZ', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 0, firstEngineMin: 560, delivery: 'full', noFlightReason: 'weather' },
  { offset: 24, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 7, firstEngineMin: 490, delivery: 'full' },
  { offset: 24, aircraftId: 'SP-FGK', picId: 'JSE', dualId: null, operation: 'ferry', clientIndex: null, lifts: 1, firstEngineMin: 480, delivery: 'full' },
  { offset: 23, aircraftId: 'SP-AXA', picId: 'AKO', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 4, firstEngineMin: 520, delivery: 'full' },
  { offset: 23, aircraftId: 'SP-KWA', picId: 'KRZ', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 1, firstEngineMin: 615, delivery: 'full' },
  { offset: 22, aircraftId: 'SP-ANK', picId: 'PWI', dualId: 'JSE', operation: 'skoki', clientIndex: 3, lifts: 5, firstEngineMin: 545, delivery: 'full' },

  // ── Tydzień 2 ────────────────────────────────────────────────────────────────
  { offset: 21, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 9, firstEngineMin: 480, delivery: 'full' },
  { offset: 21, aircraftId: 'SP-FGK', picId: 'TMK', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 600, delivery: 'full' },
  { offset: 20, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 6, firstEngineMin: 505, delivery: 'full' },
  // Paliwomierz o 45 L wyżej niż przekazanie — ktoś dolał poza aplikacją (tolerancja
  // SP-KWA = max(10 L, 5% × 200 L) = 10 L, więc flaga jest pewna).
  { offset: 20, aircraftId: 'SP-KWA', picId: 'PWI', dualId: null, operation: 'inne', clientIndex: null, lifts: 1, firstEngineMin: 615, delivery: 'full', fuelAnomalyL: 45 },
  { offset: 19, aircraftId: 'SP-FGK', picId: 'AKO', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 565, delivery: 'full' },
  { offset: 19, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 5, firstEngineMin: 495, delivery: 'full' },
  // Licznik cofnięty o 0.4 h — złe odczytanie zegara An-2 (tolerancja łańcucha 0.1 h).
  { offset: 18, aircraftId: 'SP-ANK', picId: 'JSE', dualId: 'AKO', operation: 'skoki', clientIndex: 2, lifts: 4, firstEngineMin: 550, delivery: 'full', mhAnomalyH: -0.4 },
  // Doba SP-AXA z dwiema zmianami — po §3.6a zwykły dzień, nie wyjątek.
  { offset: 18, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 4, firstEngineMin: 420, delivery: 'full' },
  { offset: 18, aircraftId: 'SP-AXA', picId: 'TMK', dualId: null, operation: 'inne', clientIndex: null, lifts: 2, firstEngineMin: 780, delivery: 'full', notes: 'Loty zapoznawcze dla kandydatów.' },
  { offset: 17, aircraftId: 'SP-FGK', picId: 'KRZ', dualId: null, operation: 'ferry', clientIndex: null, lifts: 1, firstEngineMin: 470, delivery: 'full' },
  // Dziura 0.8 h w łańcuchu — ktoś poleciał bez aplikacji.
  { offset: 16, aircraftId: 'SP-AXA', picId: 'AKO', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 7, firstEngineMin: 500, delivery: 'full', mhAnomalyH: 0.8 },
  { offset: 15, aircraftId: 'SP-FGK', picId: 'TMK', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 1, firstEngineMin: 610, delivery: 'full', notes: 'Próba na ziemi bez uwag, oblot czysty.' },

  // ── Tydzień 3 ────────────────────────────────────────────────────────────────
  { offset: 14, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 8, firstEngineMin: 490, delivery: 'full' },
  { offset: 14, aircraftId: 'SP-KWA', picId: 'JSE', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 1, firstEngineMin: 640, delivery: 'full' },
  // Zegar telefonu spóźniony o ~6.7 min względem GPS (próg to 120 s).
  { offset: 13, aircraftId: 'SP-FGK', picId: 'JSE', dualId: null, operation: 'ferry', clientIndex: null, lifts: 1, firstEngineMin: 470, delivery: 'full', clockDriftMs: 402_000 },
  // Sesja, z której administrator unieważni jeden zrzut (korekta po oknie 24 h).
  { offset: 13, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 6, firstEngineMin: 505, delivery: 'full' },
  // Telefon PWI padł w terenie: sesja jedzie bez zdania, `day_close` dojedzie spóźnioną
  // paczką dopiero po D−8 (patrz `LATE_RELEASE_AFTER_OFFSET`). PWI do tego czasu NIE
  // siada do żadnej innej maszyny — inaczej dostalibyśmy nakładkę grafiku z wady danych.
  { offset: 12, aircraftId: 'SP-ANK', picId: 'PWI', dualId: 'KRZ', operation: 'skoki', clientIndex: 1, lifts: 4, firstEngineMin: 545, delivery: 'lateRelease' },
  { offset: 12, aircraftId: 'SP-AXA', picId: 'AKO', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 5, firstEngineMin: 500, delivery: 'full' },
  // …a JSE bierze An-2 następnego dnia, gdy sesja PWI wciąż jest otwarta → nakładka.
  { offset: 11, aircraftId: 'SP-ANK', picId: 'JSE', dualId: 'AKO', operation: 'skoki', clientIndex: 2, lifts: 5, firstEngineMin: 535, delivery: 'split' },
  { offset: 11, aircraftId: 'SP-KWA', picId: 'KRZ', dualId: null, operation: 'inne', clientIndex: null, lifts: 1, firstEngineMin: 620, delivery: 'full' },
  { offset: 10, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 7, firstEngineMin: 495, delivery: 'full' },
  { offset: 10, aircraftId: 'SP-FGK', picId: 'AKO', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 575, delivery: 'full' },
  // Bieg przerwany na kołowaniu (usterka radia) — po pivocie OSOBNA SESJA, bo drugiego
  // startu w sesji nie ma: JSE zdaje maszynę i przejmuje ją od nowa co do minuty.
  // Jedyny interwał krótszy niż próg 30 min w całym scenariuszu.
  { offset: 9, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 0, abortedRun: true, firstEngineMin: 510, delivery: 'full', notes: 'Przerwane na kołowaniu — usterka radia. Zdaję i biorę od nowa.' },
  { offset: 9, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 5, firstEngineMin: 'handoff', uuidSuffix: 'r2', delivery: 'full' },
  // Usterka wykryta przy przeglądzie — maszyna zajęta, silnik nie ruszył (09C).
  { offset: 9, aircraftId: 'SP-KWA', picId: 'TMK', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 0, firstEngineMin: 600, delivery: 'full', noFlightReason: 'malfunction' },
  // Po tej paczce dojeżdża spóźnione zdanie An-2 (D−12).
  { offset: 8, aircraftId: 'SP-FGK', picId: 'TMK', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 560, delivery: 'full' },

  // ── Tydzień 4 ────────────────────────────────────────────────────────────────
  { offset: 7, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 6, firstEngineMin: 500, delivery: 'full' },
  // SP-KWA zostaje zajęty NA STAŁE — sesja porzucona przed wyłączeniem maszyny ze służby.
  { offset: 7, aircraftId: 'SP-KWA', picId: 'AKO', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 1, firstEngineMin: 610, delivery: 'leaveOpen' },
  // …i nakładka MASZYNY, której NIKT nie rozwiąże: karta doby PWI zostaje poza arkuszem.
  { offset: 6, aircraftId: 'SP-KWA', picId: 'PWI', dualId: null, operation: 'inne', clientIndex: null, lifts: 1, firstEngineMin: 600, delivery: 'split' },
  { offset: 6, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 8, firstEngineMin: 490, delivery: 'full' },
  // JEDYNA zamierzona nakładka GRAFIKU: AKO nie zdała SP-KWA (D−7) i siada do An-2.
  // Arkusza to nie dotyka — `pilot_overlap` nie jest bramką eksportu (§4.7).
  { offset: 5, aircraftId: 'SP-ANK', picId: 'AKO', dualId: 'KRZ', operation: 'skoki', clientIndex: 1, lifts: 4, firstEngineMin: 550, delivery: 'full' },
  // Doba SP-AXA z dwiema zmianami — JEDNA karta, rewizje 1 i 2 (§4.7).
  { offset: 4, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 4, firstEngineMin: 420, delivery: 'full' },
  { offset: 4, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 4, firstEngineMin: 780, delivery: 'full' },
  { offset: 3, aircraftId: 'SP-FGK', picId: 'KRZ', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 560, delivery: 'full' },
  { offset: 3, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 5, firstEngineMin: 500, delivery: 'full' },
  // Zetknięcie sesji CO DO MINUTY: KRZ zdaje SP-FGK i w tej samej minucie przejmuje
  // SP-AXA. To jest normalny dzień po §3.6a i NIE MA prawa dać `pilot_overlap`.
  { offset: 2, aircraftId: 'SP-FGK', picId: 'KRZ', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 480, delivery: 'full' },
  { offset: 2, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 4, firstEngineMin: 'handoff', delivery: 'full' },
  { offset: 1, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 7, firstEngineMin: 490, delivery: 'full' },
  { offset: 1, aircraftId: 'SP-ANK', picId: 'KRZ', dualId: 'PWI', operation: 'skoki', clientIndex: 2, lifts: 4, firstEngineMin: 540, delivery: 'full' },
];

/** Po tej dobie dojeżdża spóźnione zdanie samolotu z `delivery: 'lateRelease'`. */
const LATE_RELEASE_AFTER_OFFSET = 8;

/** Ile paczek `POST /events` niesie samo przejęcie w trybie `split` (claim + preflight). */
const CLAIM_ONLY_EVENTS = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Budowa scenariusza
// ─────────────────────────────────────────────────────────────────────────────

export function buildScenario(nowMs: number): DemoScenario {
  const today = midnightUtc(nowMs);
  const ledger: Record<AircraftId, { mh: number; fuelL: number }> = {
    'SP-AXA': { ...OPENING_STATE['SP-AXA'] },
    'SP-FGK': { ...OPENING_STATE['SP-FGK'] },
    'SP-ANK': { ...OPENING_STATE['SP-ANK'] },
    'SP-KWA': { ...OPENING_STATE['SP-KWA'] },
  };

  const batches: DemoBatch[] = [];
  /** Sesje z `lateRelease` czekające na spóźnioną paczkę: uuid → zdarzenie `day_close`. */
  const pendingLateRelease: Array<{ picId: string; event: WireEvent }> = [];
  /** Sesja, z której administrator unieważni zrzut — potrzebny uuid celu. */
  let correctionTarget: { sessionUuid: string; targetUuid: string } | null = null;
  /** Poprzedni wiersz razem z minutą zdania — wejście dla `firstEngineMin: 'handoff'`. */
  let previous: { plan: SessionPlan; releaseMin: number | null } | null = null;
  const seenUuids = new Set<string>();

  for (const [index, plan] of PLAN.entries()) {
    const built = sessionFrom(plan, today, ledger[plan.aircraftId], index, previous);
    const session = built.session;
    const events = sessionStream(session);
    const device = `demo-${plan.picId.toLowerCase()}-01`;

    // Identyfikator sesji składa się z (samolot, doba, pilot) — czytelnie, ale to znaczy,
    // że plan nie ma prawa posadzić tego samego pilota dwa razy na tej samej maszynie
    // w tej samej dobie. Cicha kolizja zamieniłaby drugą sesję w duplikaty pierwszej.
    if (seenUuids.has(session.sessionUuid)) {
      throw new Error(`scenariusz demo: zduplikowany identyfikator sesji ${session.sessionUuid}`);
    }
    seenUuids.add(session.sessionUuid);

    // Łańcuch idzie dalej od STANU FIZYCZNEGO na koniec sesji, także wtedy, gdy nikt go
    // nie zapisał (sesja porzucona) — następny pilot zastaje licznik takim, jaki jest,
    // a nie takim, jaki został wpisany. Zaszumione odczyty przy wzlocie na łańcuch nie
    // wpływają: inaczej co druga granica sesji dostawałaby `fuel_mismatch`.
    ledger[plan.aircraftId] = built.endState;
    previous = { plan, releaseMin: session.release?.atMin ?? null };

    if (plan.offset === 13 && plan.aircraftId === 'SP-AXA') {
      // Trzeci zrzut dnia — administrator unieważni go po oknie korekty.
      const drops = events.filter((e) => e.type === 'drop');
      if (drops[2] != null) {
        correctionTarget = { sessionUuid: session.sessionUuid, targetUuid: drops[2].uuid };
      }
    }

    switch (plan.delivery) {
      case 'full':
      case 'leaveOpen':
        batches.push({
          picId: plan.picId,
          sourceDevice: device,
          events,
          note: `${plan.aircraftId} · ${dayLabel(session.dayStartMs)} · ${plan.picId}${
            plan.delivery === 'leaveOpen' ? ' (samolot zostaje ZAJĘTY)' : ''
          }`,
        });
        break;

      case 'split': {
        // Przejęcie osobno: w chwili tej paczki samolot ma już drugą niezamkniętą sesję,
        // więc ingest wykrywa `aircraft_overlap`. Reszta sesji dojeżdża zaraz potem i jej
        // karta odbija się od otwartej flagi (§4.7).
        batches.push({
          picId: plan.picId,
          sourceDevice: device,
          events: events.slice(0, CLAIM_ONLY_EVENTS),
          note: `${plan.aircraftId} · ${dayLabel(session.dayStartMs)} · ${plan.picId} — przejęcie maszyny z niezamkniętą sesją (nakładka)`,
        });
        batches.push({
          picId: plan.picId,
          sourceDevice: device,
          events: events.slice(CLAIM_ONLY_EVENTS),
          note: `${plan.aircraftId} · ${dayLabel(session.dayStartMs)} · ${plan.picId} — reszta sesji; karta zablokowana otwartą nakładką`,
        });
        break;
      }

      case 'lateRelease': {
        batches.push({
          picId: plan.picId,
          sourceDevice: device,
          events: events.slice(0, -1),
          note: `${plan.aircraftId} · ${dayLabel(session.dayStartMs)} · ${plan.picId} — sesja bez zdania maszyny (telefon padł)`,
        });
        pendingLateRelease.push({ picId: plan.picId, event: events[events.length - 1]! });
        break;
      }
    }

    // Spóźnione zdania wpuszczamy dopiero, gdy scenariusz dojdzie do umówionej doby —
    // dzięki temu nakładka zdąży powstać i przez kilka dni realnie blokuje kartę.
    if (plan.offset === LATE_RELEASE_AFTER_OFFSET && pendingLateRelease.length > 0) {
      for (const late of pendingLateRelease.splice(0)) {
        batches.push({
          picId: late.picId,
          sourceDevice: `demo-${late.picId.toLowerCase()}-01`,
          events: [late.event],
          note: `spóźnione zdanie samolotu ${late.event.sessionUuid} — telefon wrócił do sieci`,
        });
      }
    }
  }

  // Cokolwiek zostało (gdyby plan przestał zawierać dobę o umówionym offsecie) —
  // wysyłamy na końcu, żeby scenariusz nie gubił zdarzeń po cichu.
  for (const late of pendingLateRelease.splice(0)) {
    batches.push({
      picId: late.picId,
      sourceDevice: `demo-${late.picId.toLowerCase()}-01`,
      events: [late.event],
      note: `spóźnione zdanie samolotu ${late.event.sessionUuid}`,
    });
  }

  const openNow = sessionInProgress(nowMs, ledger['SP-FGK']);
  batches.push({
    picId: openNow.picId,
    sourceDevice: `demo-${openNow.picId.toLowerCase()}-01`,
    events: sessionStream(openNow),
    note: 'SP-FGK · DZIŚ · KRZ — sesja W TOKU (silnik pracuje, samolot zajęty)',
  });

  return {
    batches,
    adminActions: adminActions(today, correctionTarget),
    pilotIds: [...new Set(batches.map((b) => b.picId))].sort(),
  };
}

/**
 * Sesja trwająca W TEJ CHWILI — na niej stoi testowanie telefonu (ekran 02: samolot
 * zajęty, przejęcie PIC) i karta „Samoloty w powietrzu" na pulpicie `A01`.
 *
 * Czasy liczymy WSTECZ od `now`, a nie od siatki godzin: sesja „od 08:00", odpalona
 * o 06:00 UTC, byłaby sesją z przyszłości — a to jedyny rodzaj danych, którego rejestr
 * zdarzeń nie ma prawa dostać z seeda.
 */
function sessionInProgress(nowMs: number, opening: { mh: number; fuelL: number }): DemoSession {
  const start = nowMs - 3 * 60 * 60 * 1000;
  const dayStartMs = midnightUtc(start);
  const claimMin = Math.floor((start - dayStartMs) / 60_000);
  const engineStartMin = claimMin + 14;

  return {
    sessionUuid: `demo-fgk-${stamp(dayStartMs)}-krz`,
    aircraftId: 'SP-FGK',
    picId: 'KRZ',
    dualId: null,
    dayStartMs,
    claimMin,
    preflightMin: claimMin + 4,
    operation: 'egzamin',
    client: null,
    notes: null,
    departureIcao: 'EPKK',
    arrivalIcao: null,
    mhFormat: FLEET['SP-FGK'].mhFormat,
    reading: { fuelL: opening.fuelL, mh: round2(opening.mh) },
    run: {
      engineStartMin,
      taxiMin: engineStartMin + 4,
      // Silnik NADAL PRACUJE: lot bez lądowania i bieg bez `engine_stop` to sesja
      // w toku, a nie strumień z dziurą.
      flights: [{ takeoffMin: engineStartMin + 7, landingMin: null, drop: null }],
      engineStopMin: null,
    },
    refuels: [],
    release: null,
    clockDriftMs: 0,
  };
}

/**
 * Wiersz planu + stan liczników → pełny opis sesji (jeden bieg, paliwo, motogodziny).
 *
 * Paliwo liczymy FAZA PO FAZIE (czas lotu × stawka lotu + reszta biegu × stawka ziemi),
 * bo ziemia i lot muszą palić RÓŻNIE — inaczej dane nie niosą podziału, którego model
 * analityki szuka, i regresja słusznie schodzi na jedną stawkę (`collinear`).
 *
 * Po pivocie 2026-08-10 sesja nie ma odczytów pośrednich (leg_close znikł), więc szum
 * paliwomierza (`gaugeNoise` starego generatora) odszedł razem z nimi: preflight
 * i zdanie są ogniwami łańcucha MH (§4.5), a szum na nich produkowałby `fuel_mismatch`
 * na każdej granicy sesji. Resztę regresji zapewnia różnorodność proporcji faz
 * między operacjami, nie błąd pomiaru.
 *
 * Zwraca też stan FIZYCZNY na koniec sesji — to on jest tym, co zastanie następny pilot.
 */
function sessionFrom(
  plan: SessionPlan,
  today: number,
  opening: { mh: number; fuelL: number },
  seed: number,
  previous: { plan: SessionPlan; releaseMin: number | null } | null,
): { session: DemoSession; endState: { mh: number; fuelL: number } } {
  const config = FLEET[plan.aircraftId];
  const dayStartMs = today - plan.offset * DAY_MS;
  const shape = runShape(plan);

  const firstEngineMin = resolveFirstEngineMin(plan, previous);
  const claimMin = firstEngineMin - 14;

  const fuelStartL = Math.round(opening.fuelL + (plan.fuelAnomalyL ?? 0));
  const mhStart = round2(opening.mh + (plan.mhAnomalyH ?? 0));

  let fuelL = fuelStartL;
  let mh = mhStart;
  const refuels: DemoRefuel[] = [];
  let run: DemoRun | null = null;
  let lastStopMin: number | null = null;

  if (shape != null) {
    const engineHours = shape.stop / 60;
    // Czas LOTÓW biegu (0 dla próby silnika) i reszta, czyli ziemia — jedyny podział,
    // dzięki któremu model analityki ma co rozdzielać.
    const flightHours =
      shape.flights.reduce((sum, f) => sum + (f.landing - f.takeoff), 0) / 60;
    const burnL =
      flightHours * config.flightLPerH + (engineHours - flightHours) * config.groundLPerH;

    // Tankowanie PRZED uruchomieniem wyłącznie wtedy, gdy bieg inaczej skończyłby się
    // poniżej 15% pojemności. Bez tego długie dni skokowe schodziłyby do ujemnych
    // litrów, a paliwo w danych demo przestałoby cokolwiek znaczyć.
    if (fuelL - burnL < config.capacityL * 0.15) {
      const beforeL = Math.round(fuelL);
      const afterL = Math.round(config.capacityL * 0.85);
      if (afterL > beforeL) {
        refuels.push({ atMin: firstEngineMin - 4, beforeL, addedL: afterL - beforeL, afterL });
        fuelL = afterL;
      }
    }

    fuelL -= burnL;
    mh += engineHours;
    lastStopMin = firstEngineMin + shape.stop;

    run = {
      engineStartMin: firstEngineMin,
      taxiMin: shape.taxi == null ? null : firstEngineMin + shape.taxi,
      flights: shape.flights.map((f, index) => ({
        takeoffMin: firstEngineMin + f.takeoff,
        landingMin: firstEngineMin + f.landing,
        drop:
          plan.operation === 'skoki'
            ? {
                altitudeFt: 12_000 + spread(seed + index, 3) * 500,
                jumpers: {
                  tandem: 2 + spread(seed * 3 + index, 3),
                  aff: spread(seed * 5 + index, 3),
                  solo: spread(seed * 7 + index, 5),
                },
              }
            : null,
      })),
      engineStopMin: lastStopMin,
    };
  }

  // Dolewka PO zatrzymaniu, przed zdaniem (kokpit 04) — wpis logu sesji; odczyt
  // końcowy przy zdaniu i tak jest ogniwem łańcucha, więc jedzie już PO dolewce.
  if (plan.refuelAfter === true && lastStopMin != null) {
    const beforeL = Math.round(fuelL);
    const afterL = Math.round(config.capacityL * 0.85);
    if (afterL > beforeL) {
      refuels.push({ atMin: lastStopMin + 6, beforeL, addedL: afterL - beforeL, afterL });
      fuelL = afterL;
    }
  }

  // Sesja bez biegu (09C) i tak trzymała maszynę zajętą — i to jest jej cała treść.
  const releaseMin =
    lastStopMin != null ? lastStopMin + (plan.refuelAfter === true ? 18 : 12) : claimMin + 82;

  const endState = { mh: round2(mh), fuelL: Math.round(fuelL) };

  return {
    session: {
      sessionUuid: `demo-${plan.aircraftId.slice(3).toLowerCase()}-${stamp(dayStartMs)}-${plan.picId.toLowerCase()}${plan.uuidSuffix != null ? `-${plan.uuidSuffix}` : ''}`,
      aircraftId: plan.aircraftId,
      picId: plan.picId,
      dualId: plan.dualId,
      dayStartMs,
      claimMin,
      preflightMin: claimMin + 4,
      operation: plan.operation,
      client: plan.clientIndex == null ? null : CLIENTS[plan.clientIndex]!,
      notes: plan.notes ?? null,
      departureIcao: 'EPKK',
      arrivalIcao: plan.operation === 'ferry' ? 'EPRJ' : null,
      mhFormat: config.mhFormat,
      reading: { fuelL: fuelStartL, mh: mhStart },
      run,
      refuels,
      release:
        plan.delivery === 'leaveOpen'
          ? null
          : {
              atMin: releaseMin,
              finalReading: { fuelL: endState.fuelL, mh: endState.mh },
              // Powód wyłącznie przy sesji BEZ biegu — przerwany bieg (abortedRun)
              // ma odczyty i notatkę, ale silnik RUSZYŁ, więc to nie jest 09C.
              noFlightReason: run == null ? (plan.noFlightReason ?? null) : null,
            },
      clockDriftMs: plan.clockDriftMs ?? 0,
    },
    endState,
  };
}

/**
 * Godzina uruchomienia pierwszego silnika. `'handoff'` przepisuje ją z chwili ZDANIA
 * poprzedniej maszyny przez tego samego pilota — sesje stykają się wtedy co do minuty,
 * co po §3.6a jest normalnym dniem i nie ma prawa być nakładką grafiku (§4.7).
 */
function resolveFirstEngineMin(
  plan: SessionPlan,
  previous: { plan: SessionPlan; releaseMin: number | null } | null,
): number {
  if (plan.firstEngineMin !== 'handoff') return plan.firstEngineMin;

  // Warunki są trzy i każdy z nich niesie inną własność scenariusza: ten sam pilot
  // (inaczej to nie jest przekazanie), ta sama doba (inaczej minuty nie są porównywalne)
  // i zapisane zdanie maszyny (inaczej nie ma z czego wziąć chwili styku).
  if (
    previous == null ||
    previous.releaseMin == null ||
    previous.plan.picId !== plan.picId ||
    previous.plan.offset !== plan.offset
  ) {
    throw new Error(
      `scenariusz demo: wiersz 'handoff' (${plan.aircraftId} D−${plan.offset}, ${plan.picId}) ` +
        'musi stać bezpośrednio po zdanej sesji TEGO SAMEGO pilota z TEJ SAMEJ doby',
    );
  }

  return previous.releaseMin + 14;
}

/**
 * Kształt JEDYNEGO biegu sesji wg operacji (pivot 2026-08-10) — `null`, gdy silnik
 * nie ruszył (09C). `abortedRun` bije liczbę lotów: przerwany bieg to cała sesja.
 */
function runShape(plan: SessionPlan): RunShape | null {
  if (plan.abortedRun === true) return ABORTED_RUN;
  if (plan.lifts === 0) return null;
  switch (plan.operation) {
    case 'skoki':
      return plan.aircraftId === 'SP-ANK' ? jumpRunAn2(plan.lifts) : jumpRunC182(plan.lifts);
    case 'techniczny':
      return MAINTENANCE_RUN;
    case 'ferry':
      return FERRY_RUN;
    case 'egzamin':
      return EXAM_RUN;
    case 'inne':
      return OTHER_RUN;
  }
}

// (`gaugeNoise` — szum odczytów pośrednich — odszedł 2026-08-10 razem z `leg_close`:
//  jedyne odczyty sesji są ogniwami łańcucha MH i szumu mieć nie mogą.)

/**
 * Akcje panelu — WYKONYWANE PO wszystkich paczkach, bo każda opisuje decyzję podjętą
 * przy biurku na podstawie danych, które już przyszły z terenu.
 */
function adminActions(
  today: number,
  correction: { sessionUuid: string; targetUuid: string } | null,
): DemoAdminAction[] {
  const ankLate = `demo-ank-${stamp(today - 12 * DAY_MS)}-pwi`;
  const actions: DemoAdminAction[] = [
    {
      kind: 'resolve_flag',
      actorId: 'TMK',
      flag: { type: 'aircraft_overlap', aircraftId: 'SP-ANK', sessionUuid: ankLate },
      note:
        'Nakładka pozorna: telefon PWI padł w terenie i sesję domknęła spóźniona paczka. ' +
        'JSE wystartował następnego dnia rano, więc sesje nie zachodziły na siebie w powietrzu. ' +
        'Odblokowuję karty obu dób.',
      why: 'A03a: rozwiązanie nakładki odblokowuje karty obu sesji (re-eksport w odpowiedzi).',
    },
    {
      kind: 'resolve_flag',
      actorId: 'AKO',
      flag: {
        type: 'mh_gap',
        aircraftId: 'SP-AXA',
        sessionUuid: `demo-axa-${stamp(today - 16 * DAY_MS)}-ako`,
      },
      note:
        'Dziura 0.8 h potwierdzona: lot techniczny po wymianie świec, wykonany bez aplikacji. ' +
        'Wpis do książki płatowca zgadza się z licznikiem, dane nie wymagają korekty.',
      why: 'A03a: szef wyszkolenia zamyka flagę nieblokującą — bez re-eksportu.',
    },
    {
      kind: 'retry_export',
      actorId: 'TMK',
      sessionUuid: `demo-fgk-${stamp(today - 15 * DAY_MS)}-tmk`,
      why: 'A05: drugi wiersz dziennika przy jednej karcie („2 wiersze dziennika, 1 karta").',
    },
  ];

  if (correction != null) {
    actions.push({
      kind: 'void_event',
      actorId: 'TMK',
      sessionUuid: correction.sessionUuid,
      targetUuid: correction.targetUuid,
      reason:
        'Zrzut przerwany z powodu zachmurzenia — skoczkowie wrócili na pokładzie. ' +
        'Wzlot się odbył, wyniesienia nie było; zgłoszone przez PIC po oknie korekty.',
      why: 'A02b + A04: korekta po oknie 24 h; zdarzenie zostaje w rejestrze, przekreślone.',
    });
  }

  actions.push({
    kind: 'deactivate_pilot',
    actorId: 'TMK',
    pilotId: 'JSE',
    why: 'A06/A06a: konto nieaktywne — logowanie odmawia, historia lotów zostaje.',
  });

  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drobiazgi
// ─────────────────────────────────────────────────────────────────────────────

const midnightUtc = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** `YYYYMMDD` — czytelny fragment identyfikatora sesji. */
function stamp(dayStartMs: number): string {
  return new Date(dayStartMs).toISOString().slice(0, 10).replaceAll('-', '');
}

/** `2026-07-14` do logu skryptu. */
const dayLabel = (dayStartMs: number): string => new Date(dayStartMs).toISOString().slice(0, 10);

/**
 * Deterministyczna „różnorodność" 0..range−1. Nie chodzi o losowość, tylko o to, żeby
 * liczby skoczków i wysokości zrzutów nie były w każdym wierszu identyczne — a przy tym
 * żeby test mógł je przewidzieć.
 */
const spread = (seed: number, range: number): number => (seed * 2654435761) % range;
