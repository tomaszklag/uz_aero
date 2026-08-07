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
 * Dziś proporcja jest odwrotna: **50 sesji, z czego 6 niesie flagę** (12%), a reszta to
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
 * │ zdanie bez wzlotu (09C) │ SP-FGK D−25, SP-KWA D−9 │ A02a: powód, po co maszyna    │
 * │ rewizja 2 w dzienniku   │ SP-FGK, D−15 (ponów)    │ A05: 2 wiersze, 1 karta       │
 * │ korekta po 24 h         │ SP-AXA, D−13 (void drop)│ A02b + A04: przekreślony wpis │
 * │ zetknięcie sesji        │ KRZ D−2: FGK → AXA      │ NIE jest nakładką (§4.7)      │
 * │ sesja W TOKU DZIŚ       │ SP-FGK, KRZ             │ A01 + telefon: przejęcie PIC  │
 * │ konto nieaktywne        │ JSE                     │ A06 + 00-login: odmowa        │
 * └─────────────────────────┴─────────────────────────┴───────────────────────────────┘
 *
 * ══ MATERIAŁ DO KALIBRACJI ANALITYKI (§3.6b — to zadanie ZAMYKA otwarte ryzyko) ══
 * Progów `consumption/policy.ts` nie da się nastroić na danych, których nie ma. Ten
 * scenariusz produkuje CELOWO cztery style pracy z ekranem 09 (`ConfirmStyle`), bo
 * to od nich zależy, ile interwałów paliwowych powstanie z jednej sesji:
 *
 *   `careful` — odczyt przy KAŻDYM wzlocie      → tyle interwałów, ile wzlotów (~32 min)
 *   `mixed`   — odczyt co trzeci wzlot i ostatni → interwały 1,5–2 h
 *   `quick`   — potwierdzenie BEZ odczytu        → JEDEN interwał na całą sesję
 *   `none`    — „Potwierdzę później", zero 09    → JEDEN interwał, wzloty niepotwierdzone
 *
 * `careful` w dniu skokowym daje interwały tuż nad progiem `MIN_INTERVAL_ENGINE_MS`
 * (30 min), a `quick`/`none` — dokładnie ten przypadek z §3.6b, w którym cała sesja jest
 * jednym odcinkiem. Do tego dochodzą **próby silnika bez lotu** (operacja `techniczny`):
 * jedyne obserwacje, w których cały czas pracy silnika przypada na ziemię, więc to one
 * rozdzielają stawki ziemia/lot. **Progów tu NIE stroimy** — od tego jest
 * `scripts/consumptionReplay.ts` na tych danych.
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
  type DemoLeg,
  type DemoRefuel,
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
// Kształt wzlotu — profile czasowe per operacja
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Profil JEDNEGO wzlotu: minuty liczone od uruchomienia silnika + postój po jego
 * wyłączeniu. Wszystko poza `stop` bywa `null` — wzlot bez lotu (próba silnika) ma
 * wyłącznie parę `engine_start`/`engine_stop`.
 */
interface LegShape {
  taxi: number | null;
  takeoff: number | null;
  landing: number | null;
  stop: number;
  /** Przerwa na ziemi do NASTĘPNEGO uruchomienia silnika (załadunek, zmiana ucznia). */
  pause: number;
}

/**
 * Wzlot skokowy Cessny: 3 min kołowania, wznoszenie na ~12 000 ft, zrzut, zniżanie
 * i lądowanie po 24 min lotu, 3 min kołowania z powrotem. 32 min pracy silnika
 * i 10 min na załadunek następnej ekipy — czyli cykl 42 min, jak na prawdziwym placu.
 *
 * Ta liczba nie jest ozdobna: 32 min to interwał paliwowy TUŻ NAD progiem
 * `MIN_INTERVAL_ENGINE_MS` (30 min), więc dzień pilota `careful` jest dokładnie tym
 * przypadkiem granicznym, o który pyta §3.6b.
 */
const JUMP_C182: LegShape = { taxi: 3, takeoff: 5, landing: 29, stop: 32, pause: 10 };

/** An-2 wznosi się wolniej i wozi więcej ludzi — dłuższy wzlot, dłuższy załadunek. */
const JUMP_AN2: LegShape = { taxi: 4, takeoff: 8, landing: 39, stop: 43, pause: 14 };

const FERRY: LegShape = { taxi: 4, takeoff: 7, landing: 102, stop: 106, pause: 0 };
const EXAM: LegShape = { taxi: 4, takeoff: 7, landing: 81, stop: 85, pause: 22 };
const OTHER: LegShape = { taxi: 4, takeoff: 7, landing: 54, stop: 58, pause: 16 };

/** Próba silnika po obsłudze — 42 min pracy BEZ ani jednego startu. */
const GROUND_RUN: LegShape = { taxi: null, takeoff: null, landing: null, stop: 42, pause: 15 };

/**
 * Wzlot PRZERWANY na kołowaniu — 12 min pracy silnika i powrót na płytę.
 *
 * Jedyne źródło interwału KRÓTSZEGO niż `MIN_INTERVAL_ENGINE_MS` (30 min). Bez niego
 * ten próg nie ma w danych demo czego odrzucić, więc replay nie umie odpowiedzieć, czy
 * stoi w dobrym miejscu — a to jedno z pytań, dla których §3.6b został otwarty.
 */
const ABORTED: LegShape = { taxi: 3, takeoff: null, landing: null, stop: 12, pause: 18 };
/** Oblot po próbie — krótki lot kontrolny. */
const TEST_FLIGHT: LegShape = { taxi: 4, takeoff: 7, landing: 33, stop: 37, pause: 0 };

/**
 * Styl pracy pilota z ekranem 09 — od niego zależy, ile interwałów paliwowych powstanie.
 *
 * To nie jest ozdoba scenariusza, tylko jego najważniejszy wymiar: `leg_close` z odczytem
 * ZAMYKA interwał, bez odczytu nie tworzy granicy w ogóle, a jego brak zostawia wzlot
 * niepotwierdzony (§3.6). Cztery style dają analityce cztery różne kształty tej samej
 * sesji — i dopiero na nich `consumptionReplay.ts` ma co kalibrować (§3.6b).
 */
type ConfirmStyle = 'careful' | 'mixed' | 'quick' | 'none';

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
   * Liczba wzlotów. `0` = sesja BEZ ANI JEDNEGO WZLOTU (ekran 09C) — samolot był zajęty,
   * silnik nie ruszył, a `day_close` niesie powód.
   */
  lifts: number;
  /**
   * Minuta uruchomienia silnika pierwszego wzlotu (od północy UTC). `'handoff'` znaczy
   * „przejęcie CO DO MINUTY po zdaniu poprzedniej maszyny przez tego samego pilota" —
   * układ, który po §3.6a jest normalnym dniem, a NIE nakładką grafiku (§4.7). Wiersz
   * z `'handoff'` musi stać bezpośrednio po wierszu tego samego pilota z tej samej doby.
   */
  firstEngineMin: number | 'handoff';
  confirm: ConfirmStyle;
  delivery: Delivery;
  /**
   * Pierwszy wzlot PRZERWANY na kołowaniu (12 min pracy silnika, bez startu) — dopisany
   * PRZED wzlotami z `lifts`, bo dzień toczy się dalej po powrocie na płytę.
   */
  abortFirstLeg?: true;
  /** Powód zdania bez wzlotu — wypełniany dokładnie wtedy, gdy `lifts === 0` (09C). */
  noFlightReason?: NoFlightReason;
  /** Notatka pilota do dnia (issue #14). */
  notes?: string;
  /** Uwaga do OSTATNIEGO potwierdzonego wzlotu — pole `notes` w `leg_close`. */
  legNote?: string;
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
  { offset: 28, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 6, firstEngineMin: 505, confirm: 'careful', delivery: 'full' },
  { offset: 28, aircraftId: 'SP-KWA', picId: 'TMK', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 2, firstEngineMin: 600, confirm: 'careful', delivery: 'full', notes: 'Po wymianie świec — próba na ziemi i oblot.' },
  { offset: 27, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 8, firstEngineMin: 495, confirm: 'quick', delivery: 'full' },
  { offset: 27, aircraftId: 'SP-ANK', picId: 'AKO', dualId: 'KRZ', operation: 'skoki', clientIndex: 0, lifts: 4, firstEngineMin: 540, confirm: 'mixed', delivery: 'full' },
  { offset: 26, aircraftId: 'SP-FGK', picId: 'AKO', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 570, confirm: 'careful', delivery: 'full' },
  { offset: 26, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 5, firstEngineMin: 500, confirm: 'none', delivery: 'full' },
  // Pogoda zamknęła plac: maszyna była zajęta 1:22 i nikt nigdzie nie poleciał (09C).
  { offset: 25, aircraftId: 'SP-FGK', picId: 'KRZ', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 0, firstEngineMin: 560, confirm: 'none', delivery: 'full', noFlightReason: 'weather' },
  { offset: 24, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 7, firstEngineMin: 490, confirm: 'mixed', delivery: 'full' },
  { offset: 24, aircraftId: 'SP-FGK', picId: 'JSE', dualId: null, operation: 'ferry', clientIndex: null, lifts: 1, firstEngineMin: 480, confirm: 'careful', delivery: 'full' },
  { offset: 23, aircraftId: 'SP-AXA', picId: 'AKO', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 4, firstEngineMin: 520, confirm: 'quick', delivery: 'full' },
  { offset: 23, aircraftId: 'SP-KWA', picId: 'KRZ', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 2, firstEngineMin: 615, confirm: 'careful', delivery: 'full' },
  { offset: 22, aircraftId: 'SP-ANK', picId: 'PWI', dualId: 'JSE', operation: 'skoki', clientIndex: 3, lifts: 5, firstEngineMin: 545, confirm: 'mixed', delivery: 'full' },

  // ── Tydzień 2 ────────────────────────────────────────────────────────────────
  { offset: 21, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 9, firstEngineMin: 480, confirm: 'quick', delivery: 'full' },
  { offset: 21, aircraftId: 'SP-FGK', picId: 'TMK', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 600, confirm: 'careful', delivery: 'full' },
  { offset: 20, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 6, firstEngineMin: 505, confirm: 'careful', delivery: 'full' },
  // Paliwomierz o 45 L wyżej niż przekazanie — ktoś dolał poza aplikacją (tolerancja
  // SP-KWA = max(10 L, 5% × 200 L) = 10 L, więc flaga jest pewna).
  { offset: 20, aircraftId: 'SP-KWA', picId: 'PWI', dualId: null, operation: 'inne', clientIndex: null, lifts: 1, firstEngineMin: 615, confirm: 'careful', delivery: 'full', fuelAnomalyL: 45 },
  { offset: 19, aircraftId: 'SP-FGK', picId: 'AKO', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 565, confirm: 'careful', delivery: 'full' },
  { offset: 19, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 5, firstEngineMin: 495, confirm: 'none', delivery: 'full' },
  // Licznik cofnięty o 0.4 h — złe odczytanie zegara An-2 (tolerancja łańcucha 0.1 h).
  { offset: 18, aircraftId: 'SP-ANK', picId: 'JSE', dualId: 'AKO', operation: 'skoki', clientIndex: 2, lifts: 4, firstEngineMin: 550, confirm: 'mixed', delivery: 'full', mhAnomalyH: -0.4 },
  // Doba SP-AXA z dwiema zmianami — po §3.6a zwykły dzień, nie wyjątek.
  { offset: 18, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 4, firstEngineMin: 420, confirm: 'careful', delivery: 'full' },
  { offset: 18, aircraftId: 'SP-AXA', picId: 'TMK', dualId: null, operation: 'inne', clientIndex: null, lifts: 2, firstEngineMin: 780, confirm: 'careful', delivery: 'full', notes: 'Loty zapoznawcze dla kandydatów.' },
  { offset: 17, aircraftId: 'SP-FGK', picId: 'KRZ', dualId: null, operation: 'ferry', clientIndex: null, lifts: 1, firstEngineMin: 470, confirm: 'careful', delivery: 'full' },
  // Dziura 0.8 h w łańcuchu — ktoś poleciał bez aplikacji.
  { offset: 16, aircraftId: 'SP-AXA', picId: 'AKO', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 7, firstEngineMin: 500, confirm: 'quick', delivery: 'full', mhAnomalyH: 0.8 },
  { offset: 15, aircraftId: 'SP-FGK', picId: 'TMK', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 2, firstEngineMin: 610, confirm: 'careful', delivery: 'full', legNote: 'Próba na ziemi bez uwag, oblot czysty.' },

  // ── Tydzień 3 ────────────────────────────────────────────────────────────────
  { offset: 14, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 8, firstEngineMin: 490, confirm: 'mixed', delivery: 'full' },
  { offset: 14, aircraftId: 'SP-KWA', picId: 'JSE', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 2, firstEngineMin: 640, confirm: 'careful', delivery: 'full' },
  // Zegar telefonu spóźniony o ~6.7 min względem GPS (próg to 120 s).
  { offset: 13, aircraftId: 'SP-FGK', picId: 'JSE', dualId: null, operation: 'ferry', clientIndex: null, lifts: 1, firstEngineMin: 470, confirm: 'careful', delivery: 'full', clockDriftMs: 402_000 },
  // Sesja, z której administrator unieważni jeden zrzut (korekta po oknie 24 h).
  { offset: 13, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 6, firstEngineMin: 505, confirm: 'careful', delivery: 'full' },
  // Telefon PWI padł w terenie: sesja jedzie bez zdania, `day_close` dojedzie spóźnioną
  // paczką dopiero po D−8 (patrz `LATE_RELEASE_AFTER_OFFSET`). PWI do tego czasu NIE
  // siada do żadnej innej maszyny — inaczej dostalibyśmy nakładkę grafiku z wady danych.
  { offset: 12, aircraftId: 'SP-ANK', picId: 'PWI', dualId: 'KRZ', operation: 'skoki', clientIndex: 1, lifts: 4, firstEngineMin: 545, confirm: 'mixed', delivery: 'lateRelease' },
  { offset: 12, aircraftId: 'SP-AXA', picId: 'AKO', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 5, firstEngineMin: 500, confirm: 'quick', delivery: 'full' },
  // …a JSE bierze An-2 następnego dnia, gdy sesja PWI wciąż jest otwarta → nakładka.
  { offset: 11, aircraftId: 'SP-ANK', picId: 'JSE', dualId: 'AKO', operation: 'skoki', clientIndex: 2, lifts: 5, firstEngineMin: 535, confirm: 'mixed', delivery: 'split' },
  { offset: 11, aircraftId: 'SP-KWA', picId: 'KRZ', dualId: null, operation: 'inne', clientIndex: null, lifts: 1, firstEngineMin: 620, confirm: 'careful', delivery: 'full' },
  { offset: 10, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 7, firstEngineMin: 495, confirm: 'none', delivery: 'full' },
  { offset: 10, aircraftId: 'SP-FGK', picId: 'AKO', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 575, confirm: 'careful', delivery: 'full' },
  // Pierwszy wzlot przerwany na kołowaniu (usterka radia) — jedyny interwał krótszy
  // niż próg 30 min w całym scenariuszu.
  { offset: 9, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 5, firstEngineMin: 510, confirm: 'careful', delivery: 'full', abortFirstLeg: true, legNote: 'Pierwszy wzlot przerwany na kołowaniu — usterka radia.' },
  // Usterka wykryta przy przeglądzie — maszyna zajęta, silnik nie ruszył (09C).
  { offset: 9, aircraftId: 'SP-KWA', picId: 'TMK', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 0, firstEngineMin: 600, confirm: 'none', delivery: 'full', noFlightReason: 'malfunction' },
  // Po tej paczce dojeżdża spóźnione zdanie An-2 (D−12).
  { offset: 8, aircraftId: 'SP-FGK', picId: 'TMK', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 560, confirm: 'careful', delivery: 'full' },

  // ── Tydzień 4 ────────────────────────────────────────────────────────────────
  { offset: 7, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 6, firstEngineMin: 500, confirm: 'mixed', delivery: 'full' },
  // SP-KWA zostaje zajęty NA STAŁE — sesja porzucona przed wyłączeniem maszyny ze służby.
  { offset: 7, aircraftId: 'SP-KWA', picId: 'AKO', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 2, firstEngineMin: 610, confirm: 'careful', delivery: 'leaveOpen' },
  // …i nakładka MASZYNY, której NIKT nie rozwiąże: karta doby PWI zostaje poza arkuszem.
  { offset: 6, aircraftId: 'SP-KWA', picId: 'PWI', dualId: null, operation: 'inne', clientIndex: null, lifts: 1, firstEngineMin: 600, confirm: 'careful', delivery: 'split' },
  { offset: 6, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 8, firstEngineMin: 490, confirm: 'quick', delivery: 'full' },
  // JEDYNA zamierzona nakładka GRAFIKU: AKO nie zdała SP-KWA (D−7) i siada do An-2.
  // Arkusza to nie dotyka — `pilot_overlap` nie jest bramką eksportu (§4.7).
  { offset: 5, aircraftId: 'SP-ANK', picId: 'AKO', dualId: 'KRZ', operation: 'skoki', clientIndex: 1, lifts: 4, firstEngineMin: 550, confirm: 'mixed', delivery: 'full' },
  // Doba SP-AXA z dwiema zmianami — JEDNA karta, rewizje 1 i 2 (§4.7).
  { offset: 4, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 4, firstEngineMin: 420, confirm: 'careful', delivery: 'full' },
  { offset: 4, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 4, firstEngineMin: 780, confirm: 'quick', delivery: 'full' },
  { offset: 3, aircraftId: 'SP-FGK', picId: 'KRZ', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 560, confirm: 'careful', delivery: 'full' },
  { offset: 3, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 5, firstEngineMin: 500, confirm: 'none', delivery: 'full' },
  // Zetknięcie sesji CO DO MINUTY: KRZ zdaje SP-FGK i w tej samej minucie przejmuje
  // SP-AXA. To jest normalny dzień po §3.6a i NIE MA prawa dać `pilot_overlap`.
  { offset: 2, aircraftId: 'SP-FGK', picId: 'KRZ', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstEngineMin: 480, confirm: 'careful', delivery: 'full' },
  { offset: 2, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 4, firstEngineMin: 'handoff', confirm: 'careful', delivery: 'full' },
  { offset: 1, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 7, firstEngineMin: 490, confirm: 'mixed', delivery: 'full' },
  { offset: 1, aircraftId: 'SP-ANK', picId: 'KRZ', dualId: 'PWI', operation: 'skoki', clientIndex: 2, lifts: 4, firstEngineMin: 540, confirm: 'careful', delivery: 'full' },
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
    legs: [
      {
        engineStartMin,
        taxiMin: engineStartMin + 4,
        takeoffMin: engineStartMin + 7,
        // Silnik NADAL PRACUJE: wzlot bez lądowania i bez `engine_stop` to sesja w toku,
        // a nie strumień z dziurą.
        landingMin: null,
        engineStopMin: null,
        drop: null,
        close: null,
      },
    ],
    refuels: [],
    release: null,
    clockDriftMs: 0,
  };
}

/**
 * Wiersz planu + stan liczników → pełny opis sesji (wzloty, paliwo, motogodziny).
 *
 * Paliwo i motogodziny SYMULUJEMY wzlot po wzlocie i FAZA PO FAZIE, zamiast liczyć jedną
 * deltą na całą sesję. Dwa powody, oba twarde:
 *  • odczyt z `leg_close` musi być spójny z tym, ile maszyna faktycznie spaliła do tej
 *    chwili, bo analityka liczy zużycie jako RÓŻNICĘ DWÓCH ODCZYTÓW;
 *  • ziemia i lot muszą palić RÓŻNIE, inaczej dane nie niosą podziału, którego model
 *    szuka, i regresja słusznie schodzi na jedną stawkę (`collinear`).
 *
 * Odczyty pilota mają szum ±2 L (`gaugeNoise`) i to jest decyzja, nie niechlujstwo:
 * paliwomierz nie jest dokładniejszy, a zestaw danych z zerową resztą dawałby przedziały
 * ufności ±0% i model, który wygląda na pewny wszystkiego. Progi kalibruje się przeciw
 * błędowi pomiaru, więc dane bez błędu pomiaru nie kalibrują niczego. Szum dotyka
 * WYŁĄCZNIE odczytów przy wzlocie — preflight i zdanie samolotu są ogniwami łańcucha MH
 * (§4.5), a szum na nich produkowałby `fuel_mismatch` na każdej granicy sesji.
 *
 * Zwraca też stan FIZYCZNY na koniec sesji: to on, a nie zaszumiony odczyt, jest tym,
 * co zastanie następny pilot.
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
  const shapes = legShapes(plan);

  const firstEngineMin = resolveFirstEngineMin(plan, previous);
  const claimMin = firstEngineMin - 14;

  const fuelStartL = Math.round(opening.fuelL + (plan.fuelAnomalyL ?? 0));
  const mhStart = round2(opening.mh + (plan.mhAnomalyH ?? 0));

  let fuelL = fuelStartL;
  let mh = mhStart;
  const legs: DemoLeg[] = [];
  const refuels: DemoRefuel[] = [];
  let engineStartMin = firstEngineMin;

  for (const [index, shape] of shapes.entries()) {
    const engineHours = shape.stop / 60;
    // Czas LOTU wzlotu (0 dla próby silnika) i reszta, czyli ziemia. Ten podział jest
    // jedyną rzeczą, dzięki której model ma co rozdzielać.
    const flightHours =
      shape.takeoff == null || shape.landing == null ? 0 : (shape.landing - shape.takeoff) / 60;
    const burnL =
      flightHours * config.flightLPerH + (engineHours - flightHours) * config.groundLPerH;

    // Tankowanie WYŁĄCZNIE wtedy, gdy wzlot inaczej skończyłby się poniżej 15%
    // pojemności. Bez tego długie dni skokowe schodziłyby do ujemnych litrów, a paliwo
    // w danych demo przestałoby cokolwiek znaczyć.
    if (fuelL - burnL < config.capacityL * 0.15) {
      const beforeL = Math.round(fuelL);
      const afterL = Math.round(config.capacityL * 0.85);
      if (afterL > beforeL) {
        refuels.push({ atMin: engineStartMin - 4, beforeL, addedL: afterL - beforeL, afterL });
        fuelL = afterL;
      }
    }

    fuelL -= burnL;
    mh += engineHours;

    const engineStopMin = engineStartMin + shape.stop;

    legs.push({
      engineStartMin,
      taxiMin: shape.taxi == null ? null : engineStartMin + shape.taxi,
      takeoffMin: shape.takeoff == null ? null : engineStartMin + shape.takeoff,
      landingMin: shape.landing == null ? null : engineStartMin + shape.landing,
      engineStopMin,
      drop:
        plan.operation === 'skoki' && shape.takeoff != null
          ? {
              altitudeFt: 12_000 + spread(seed + index, 3) * 500,
              jumpers: {
                tandem: 2 + spread(seed * 3 + index, 3),
                aff: spread(seed * 5 + index, 3),
                solo: spread(seed * 7 + index, 5),
              },
            }
          : null,
      close: legClose(plan, index, shapes.length, engineStopMin, {
        fuelL: fuelL + gaugeNoise(seed, index),
        mh,
      }),
    });

    engineStartMin = engineStopMin + shape.pause;
  }

  const lastStopMin = legs.length > 0 ? legs[legs.length - 1]!.engineStopMin : null;
  // Sesja bez wzlotu (09C) i tak trzymała maszynę zajętą — i to jest jej cała treść.
  const releaseMin = lastStopMin != null ? lastStopMin + 12 : claimMin + 82;

  const endState = { mh: round2(mh), fuelL: Math.round(fuelL) };

  return {
    session: {
      sessionUuid: `demo-${plan.aircraftId.slice(3).toLowerCase()}-${stamp(dayStartMs)}-${plan.picId.toLowerCase()}`,
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
      legs,
      refuels,
      release:
        plan.delivery === 'leaveOpen'
          ? null
          : {
              atMin: releaseMin,
              finalReading: { fuelL: endState.fuelL, mh: endState.mh },
              noFlightReason: plan.noFlightReason ?? null,
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
 * Wzloty sesji wg operacji.
 *
 * `techniczny` ma dwa różne wzloty i to jest jego istota: najpierw PRÓBA SILNIKA bez
 * startu (cały czas pracy na ziemi — jedyna obserwacja, która rozdziela stawki ziemia/lot
 * bez zgadywania), potem krótki oblot kontrolny.
 */
function legShapes(plan: SessionPlan): LegShape[] {
  if (plan.lifts === 0) return [];
  return [...(plan.abortFirstLeg === true ? [ABORTED] : []), ...liftShapes(plan)];
}

function liftShapes(plan: SessionPlan): LegShape[] {
  switch (plan.operation) {
    case 'skoki':
      return Array.from({ length: plan.lifts }, () =>
        plan.aircraftId === 'SP-ANK' ? JUMP_AN2 : JUMP_C182,
      );
    case 'techniczny':
      return [GROUND_RUN, TEST_FLIGHT].slice(0, plan.lifts);
    case 'ferry':
      return Array.from({ length: plan.lifts }, () => FERRY);
    case 'egzamin':
      return Array.from({ length: plan.lifts }, () => EXAM);
    case 'inne':
      return Array.from({ length: plan.lifts }, () => OTHER);
  }
}

/**
 * Potwierdzenie wzlotu wg stylu pracy pilota (§3.6).
 *
 * `null` znaczy „wzlot bez potwierdzenia" — legalny stan („Potwierdzę później"), po
 * którym w „Mój dzień" zostaje pasek do przejrzenia. `reading: null` to potwierdzenie
 * BEZ odczytu liczników: pilot przejrzał czasy, ale nie poszedł do paliwomierza.
 */
function legClose(
  plan: SessionPlan,
  index: number,
  legCount: number,
  engineStopMin: number,
  gauge: { fuelL: number; mh: number },
): DemoLeg['close'] {
  if (plan.confirm === 'none') return null;

  const isLast = index === legCount - 1;
  const withReading =
    plan.confirm === 'careful' ||
    (plan.confirm === 'mixed' && ((index + 1) % 3 === 0 || isLast));

  return {
    // Cztery minuty po wyłączeniu silnika: pilot przegląda czasy stojąc przy maszynie,
    // czyli PRZED następnym uruchomieniem (najkrótsza przerwa w planie to 10 min).
    atMin: engineStopMin + 4,
    reading: withReading ? { fuelL: Math.round(gauge.fuelL), mh: round2(gauge.mh) } : null,
    notes: isLast ? (plan.legNote ?? null) : null,
  };
}

/**
 * Błąd odczytu paliwomierza: deterministyczna liczba całkowita z zakresu −2…+2 L.
 *
 * Nie chodzi o losowość, tylko o to, żeby reszty regresji NIE BYŁY zerowe — model
 * dopasowany co do litra podaje przedziały ±0% i wygląda na pewny czegoś, czego pomiar
 * nie rozstrzyga. Wartość jest funkcją wiersza planu i numeru wzlotu, więc powtórny bieg
 * seeda daje te same odczyty (idempotencja) i test umie je przewidzieć.
 */
const gaugeNoise = (seed: number, index: number): number => spread(seed * 11 + index, 5) - 2;

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
