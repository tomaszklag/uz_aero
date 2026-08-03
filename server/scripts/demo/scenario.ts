/**
 * UZ Aero (dane demo) — SCENARIUSZ TRZECH TYGODNI KLUBU.
 *
 * Czysta funkcja `buildScenario(now)` → paczki zdarzeń w kolejności wysyłki + akcje
 * administratora do wykonania po nich. Zero I/O: ten sam scenariusz jedzie w teście
 * (PGlite przez `app.inject`) i w skrypcie (`scripts/seedDemo.ts`, prawdziwy HTTP).
 *
 * ══ CO TEN SCENARIUSZ MA UDOWODNIĆ ══
 * Dane demo mają być NIEWYGODNE, bo panel powstał do obsługi rzeczy niewygodnych.
 * Ładny miesiąc zgodnych łańcuchów MH pokazałby wyłącznie, że tabele się renderują.
 * Dlatego w scenariuszu siedzi po jednym egzemplarzu każdego typu flagi z §4.5, dzień
 * bez karty arkusza, dzień nadpisany przez drugą zmianę, korekta po oknie 24 h
 * i konto odcięte od systemu.
 *
 * ┌ Flaga / stan ──────────┬ Gdzie ──────────────────┬ Po co ────────────────────────┐
 * │ mh_gap                 │ SP-AXA, D−13            │ A03: skrzynka, nieblokująca   │
 * │ mh_regression          │ SP-ANK, D−14            │ A03 + A02a: cofnięty licznik  │
 * │ fuel_mismatch          │ SP-KWA, D−16            │ A03: tolerancja z pojemności  │
 * │ clock_drift            │ SP-FGK, D−6             │ A04: rozjazd zegara telefonu  │
 * │ session_overlap (open) │ SP-KWA, D−5 × D−4       │ A03 blokuje + A05 „brak karty"│
 * │ session_overlap (res.) │ SP-ANK, D−9 × D−8       │ A03a: rozwiązanie → 2 karty   │
 * │ kolizja karty dnia     │ SP-AXA, D−3 (2 zmiany)  │ A05: `overwrittenBy`          │
 * │ rewizja 2 w dzienniku  │ SP-FGK, D−15 (ponów)    │ A05: 2 wiersze, 1 karta       │
 * │ korekta po 24 h        │ SP-AXA, D−6 (void drop) │ A02b + A04: przekreślony wpis │
 * │ dzień otwarty DZIŚ     │ SP-FGK, KRZ             │ A01 + telefon: przejęcie PIC  │
 * │ konto nieaktywne       │ JSE                     │ A06 + 00-login: odmowa        │
 * └────────────────────────┴─────────────────────────┴───────────────────────────────┘
 *
 * ══ DLACZEGO NAKŁADKI WYMAGAJĄ DWÓCH PACZEK ══
 * `session_overlap` powstaje, gdy w chwili liczenia flag samolot ma WIĘCEJ NIŻ JEDNĄ
 * niezamkniętą sesję (`domain/mhChain.ts`). Dzień wysłany jedną paczką razem z `day_close`
 * jest w tej chwili już zamknięty, więc nakładki nigdy by nie zrobił. Dlatego dni
 * nakładające się jadą rozdzielone: najpierw otwarcie, potem reszta dnia — dokładnie
 * tak, jak robi to telefon synchronizujący w trakcie pracy.
 */

import type { FlagType } from '@uzaero/domain';

import { dayEvents, type DemoDay, type DemoFlight, type WireEvent } from './dayStream.ts';

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
 */
const FLEET = {
  'SP-AXA': { capacityL: 330, mhFormat: 'hhmm', burnLPerH: 42 },
  'SP-FGK': { capacityL: 330, mhFormat: 'hhmm', burnLPerH: 40 },
  'SP-ANK': { capacityL: 1700, mhFormat: 'hhmm', burnLPerH: 135 },
  'SP-KWA': { capacityL: 200, mhFormat: 'decimal', burnLPerH: 28 },
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
// Plan dni — jedna tabela, którą da się przeczytać w całości
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Jak dzień jest wysyłany:
 *  • `full`      — jedna paczka z całym dniem (telefon zsynchronizował po wylądowaniu);
 *  • `split`     — otwarcie osobno, reszta osobno (tworzy nakładkę z dniem już otwartym);
 *  • `leaveOpen` — bez `day_close`, dzień zostaje otwarty NA STAŁE;
 *  • `lateClose` — dzień jedzie bez zamknięcia, a `day_close` dojeżdża spóźnioną paczką.
 */
type Delivery = 'full' | 'split' | 'leaveOpen' | 'lateClose';

interface DayPlan {
  /** Ile dni przed „dziś" (UTC). */
  offset: number;
  aircraftId: AircraftId;
  picId: string;
  dualId: string | null;
  operation: DemoDay['operation'];
  clientIndex: number | null;
  /** Liczba wzlotów (`skoki`) albo 1 dla operacji z jednym lotem. */
  lifts: number;
  /** Minuta pierwszego kołowania (od północy UTC). */
  firstTaxiMin: number;
  delivery: Delivery;
  /** Celowy rozjazd odczytu MH względem przekazania (h) — źródło `mh_gap`/`mh_regression`. */
  mhAnomalyH?: number;
  /** Celowy rozjazd odczytu paliwa względem przekazania (L) — źródło `fuel_mismatch`. */
  fuelAnomalyL?: number;
  /** Rozjazd zegara telefonu (ms) — źródło `clock_drift`. */
  clockDriftMs?: number;
}

/**
 * Trzy tygodnie klubu, chronologicznie (od najstarszego). Kolejność wierszy JEST
 * kolejnością wysyłki — na niej stoi cały mechanizm nakładek, bo flagi liczą się
 * ze stanu świata w chwili przyjęcia paczki, a nie z dat w payloadzie.
 */
const PLAN: readonly DayPlan[] = [
  { offset: 20, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 4, firstTaxiMin: 505, delivery: 'full' },
  { offset: 20, aircraftId: 'SP-KWA', picId: 'TMK', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 1, firstTaxiMin: 600, delivery: 'full' },
  { offset: 19, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 5, firstTaxiMin: 495, delivery: 'full' },
  { offset: 19, aircraftId: 'SP-ANK', picId: 'AKO', dualId: 'KRZ', operation: 'skoki', clientIndex: 0, lifts: 3, firstTaxiMin: 540, delivery: 'full' },
  { offset: 18, aircraftId: 'SP-FGK', picId: 'AKO', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstTaxiMin: 570, delivery: 'full' },
  { offset: 17, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 4, firstTaxiMin: 515, delivery: 'full' },
  { offset: 16, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 3, firstTaxiMin: 530, delivery: 'full' },
  // Paliwomierz o 45 L wyżej niż przekazanie — ktoś dolał poza aplikacją (tolerancja
  // SP-KWA = max(10 L, 5% × 200 L) = 10 L, więc flaga jest pewna).
  { offset: 16, aircraftId: 'SP-KWA', picId: 'PWI', dualId: null, operation: 'inne', clientIndex: null, lifts: 1, firstTaxiMin: 615, delivery: 'full', fuelAnomalyL: 45 },
  { offset: 15, aircraftId: 'SP-FGK', picId: 'TMK', dualId: null, operation: 'ferry', clientIndex: null, lifts: 1, firstTaxiMin: 480, delivery: 'full' },
  // Licznik cofnięty o 0.4 h — złe odczytanie zegara An-2 (tolerancja łańcucha 0.1 h).
  { offset: 14, aircraftId: 'SP-ANK', picId: 'PWI', dualId: 'JSE', operation: 'skoki', clientIndex: 3, lifts: 3, firstTaxiMin: 555, delivery: 'full', mhAnomalyH: -0.4 },
  { offset: 14, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 4, firstTaxiMin: 500, delivery: 'full' },
  // Dziura 0.8 h w łańcuchu — ktoś poleciał bez aplikacji.
  { offset: 13, aircraftId: 'SP-AXA', picId: 'AKO', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 3, firstTaxiMin: 525, delivery: 'full', mhAnomalyH: 0.8 },
  { offset: 12, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 5, firstTaxiMin: 490, delivery: 'full' },
  { offset: 12, aircraftId: 'SP-KWA', picId: 'JSE', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 1, firstTaxiMin: 640, delivery: 'full' },
  { offset: 11, aircraftId: 'SP-FGK', picId: 'KRZ', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstTaxiMin: 585, delivery: 'full' },
  { offset: 10, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 4, firstTaxiMin: 510, delivery: 'full' },
  // Telefon PWI padł w terenie: dzień jedzie bez zamknięcia, `day_close` dojedzie
  // spóźnioną paczką dopiero po D−2 (patrz `LATE_CLOSE_AFTER_OFFSET`).
  { offset: 9, aircraftId: 'SP-ANK', picId: 'PWI', dualId: 'KRZ', operation: 'skoki', clientIndex: 0, lifts: 3, firstTaxiMin: 545, delivery: 'lateClose' },
  { offset: 9, aircraftId: 'SP-AXA', picId: 'AKO', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 3, firstTaxiMin: 520, delivery: 'full' },
  // …a JSE bierze An-2 następnego dnia, gdy sesja PWI wciąż jest otwarta → nakładka.
  { offset: 8, aircraftId: 'SP-ANK', picId: 'JSE', dualId: 'AKO', operation: 'skoki', clientIndex: 2, lifts: 4, firstTaxiMin: 535, delivery: 'split' },
  { offset: 8, aircraftId: 'SP-KWA', picId: 'KRZ', dualId: null, operation: 'inne', clientIndex: null, lifts: 1, firstTaxiMin: 620, delivery: 'full' },
  { offset: 7, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 5, firstTaxiMin: 495, delivery: 'full' },
  // Zegar telefonu spóźniony o ~6.7 min względem GPS (próg to 120 s).
  { offset: 6, aircraftId: 'SP-FGK', picId: 'JSE', dualId: null, operation: 'ferry', clientIndex: null, lifts: 1, firstTaxiMin: 470, delivery: 'full', clockDriftMs: 402_000 },
  // Dzień, w którym administrator unieważni jeden zrzut (korekta po oknie 24 h).
  { offset: 6, aircraftId: 'SP-AXA', picId: 'KRZ', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 4, firstTaxiMin: 505, delivery: 'full' },
  // SP-KWA zostaje otwarty NA STAŁE — sesja porzucona przed wyłączeniem samolotu ze służby.
  { offset: 5, aircraftId: 'SP-KWA', picId: 'AKO', dualId: null, operation: 'techniczny', clientIndex: null, lifts: 1, firstTaxiMin: 610, delivery: 'leaveOpen' },
  { offset: 5, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 3, firstTaxiMin: 530, delivery: 'full' },
  // …i nakładka, której NIKT nie rozwiąże: karta dnia PWI zostaje poza arkuszem.
  { offset: 4, aircraftId: 'SP-KWA', picId: 'PWI', dualId: null, operation: 'inne', clientIndex: null, lifts: 1, firstTaxiMin: 600, delivery: 'split' },
  { offset: 4, aircraftId: 'SP-ANK', picId: 'AKO', dualId: 'KRZ', operation: 'skoki', clientIndex: 1, lifts: 3, firstTaxiMin: 550, delivery: 'full' },
  // Dwie zmiany na jednym samolocie tego samego dnia — obie zamknięte, jedna nazwa karty.
  { offset: 3, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 0, lifts: 3, firstTaxiMin: 420, delivery: 'full' },
  { offset: 3, aircraftId: 'SP-AXA', picId: 'JSE', dualId: null, operation: 'skoki', clientIndex: 1, lifts: 3, firstTaxiMin: 780, delivery: 'full' },
  { offset: 2, aircraftId: 'SP-FGK', picId: 'TMK', dualId: null, operation: 'egzamin', clientIndex: null, lifts: 1, firstTaxiMin: 560, delivery: 'full' },
  { offset: 2, aircraftId: 'SP-AXA', picId: 'AKO', dualId: null, operation: 'skoki', clientIndex: 3, lifts: 4, firstTaxiMin: 500, delivery: 'full' },
  { offset: 1, aircraftId: 'SP-AXA', picId: 'PWI', dualId: null, operation: 'skoki', clientIndex: 2, lifts: 5, firstTaxiMin: 490, delivery: 'full' },
  { offset: 1, aircraftId: 'SP-ANK', picId: 'KRZ', dualId: 'PWI', operation: 'skoki', clientIndex: 0, lifts: 3, firstTaxiMin: 540, delivery: 'full' },
];

/** Po tym dniu dojeżdża spóźnione `day_close` sesji z `delivery: 'lateClose'`. */
const LATE_CLOSE_AFTER_OFFSET = 2;

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
  /** Sesje z `lateClose` czekające na spóźnioną paczkę: uuid → zdarzenie `day_close`. */
  const pendingLateClose: Array<{ picId: string; event: WireEvent }> = [];
  /** Zdarzenia dnia, z którego administrator unieważni zrzut — potrzebny uuid celu. */
  let correctionTarget: { sessionUuid: string; targetUuid: string } | null = null;

  for (const [index, plan] of PLAN.entries()) {
    const day = dayFrom(plan, today, ledger[plan.aircraftId], index);
    const events = dayEvents(day);
    const device = `demo-${plan.picId.toLowerCase()}-01`;

    // Łańcuch idzie dalej od PRZEKAZANIA (`day_close`), a nie od odczytu startowego —
    // dokładnie jak w rzeczywistości: następny pilot zastaje to, co zostawił poprzedni.
    if (day.finalReading != null) {
      ledger[plan.aircraftId] = { mh: day.finalReading.mh, fuelL: day.finalReading.fuelL };
    }

    if (plan.offset === 6 && plan.aircraftId === 'SP-AXA') {
      const drop = events.find((e) => e.type === 'drop');
      if (drop != null) correctionTarget = { sessionUuid: day.sessionUuid, targetUuid: drop.uuid };
    }

    switch (plan.delivery) {
      case 'full':
      case 'leaveOpen':
        batches.push({
          picId: plan.picId,
          sourceDevice: device,
          events,
          note: `${plan.aircraftId} · ${dayLabel(day.dayStartMs)} · ${plan.picId}${
            plan.delivery === 'leaveOpen' ? ' (dzień zostaje OTWARTY)' : ''
          }`,
        });
        break;

      case 'split': {
        // Otwarcie osobno: w chwili tej paczki samolot ma już drugą niezamkniętą sesję,
        // więc ingest wykrywa `session_overlap`. Reszta dnia dojeżdża zaraz potem i jej
        // karta odbija się od otwartej flagi (§4.7).
        const opening = events.slice(0, 3);
        batches.push({
          picId: plan.picId,
          sourceDevice: device,
          events: opening,
          note: `${plan.aircraftId} · ${dayLabel(day.dayStartMs)} · ${plan.picId} — otwarcie dnia na samolocie z niezamkniętą sesją (nakładka)`,
        });
        batches.push({
          picId: plan.picId,
          sourceDevice: device,
          events: events.slice(3),
          note: `${plan.aircraftId} · ${dayLabel(day.dayStartMs)} · ${plan.picId} — reszta dnia; karta zablokowana otwartą nakładką`,
        });
        break;
      }

      case 'lateClose': {
        batches.push({
          picId: plan.picId,
          sourceDevice: device,
          events: events.slice(0, -1),
          note: `${plan.aircraftId} · ${dayLabel(day.dayStartMs)} · ${plan.picId} — dzień bez zamknięcia (telefon padł)`,
        });
        pendingLateClose.push({ picId: plan.picId, event: events[events.length - 1]! });
        break;
      }
    }

    // Spóźnione zamknięcia wpuszczamy dopiero, gdy scenariusz dojdzie do umówionego dnia —
    // dzięki temu nakładka zdąży powstać i przez kilka dni realnie blokuje kartę.
    if (plan.offset === LATE_CLOSE_AFTER_OFFSET && pendingLateClose.length > 0) {
      for (const late of pendingLateClose.splice(0)) {
        batches.push({
          picId: late.picId,
          sourceDevice: `demo-${late.picId.toLowerCase()}-01`,
          events: [late.event],
          note: `spóźnione domknięcie dnia ${late.event.sessionUuid} — telefon wrócił do sieci`,
        });
      }
    }
  }

  // Cokolwiek zostało (gdyby plan przestał zawierać dzień o umówionym offsecie) —
  // wysyłamy na końcu, żeby scenariusz nie gubił zdarzeń po cichu.
  for (const late of pendingLateClose.splice(0)) {
    batches.push({
      picId: late.picId,
      sourceDevice: `demo-${late.picId.toLowerCase()}-01`,
      events: [late.event],
      note: `spóźnione domknięcie dnia ${late.event.sessionUuid}`,
    });
  }

  const openToday = openSessionToday(nowMs, ledger['SP-FGK']);
  batches.push({
    picId: openToday.picId,
    sourceDevice: `demo-${openToday.picId.toLowerCase()}-01`,
    events: dayEvents(openToday),
    note: 'SP-FGK · DZIŚ · KRZ — dzień W TOKU (silnik pracuje, samolot zajęty)',
  });

  return {
    batches,
    adminActions: adminActions(today, correctionTarget),
    pilotIds: [...new Set(batches.map((b) => b.picId))].sort(),
  };
}

/**
 * Dzień otwarty W TEJ CHWILI — na nim stoi testowanie telefonu (ekran 02: samolot
 * zajęty, przejęcie PIC) i karta „Samoloty w powietrzu" na pulpicie `A01`.
 *
 * Czasy liczymy WSTECZ od `now`, a nie od siatki godzin: dzień „od 08:00", odpalony
 * o 06:00 UTC, byłby dniem z przyszłości — a to jedyny rodzaj danych, którego rejestr
 * zdarzeń nie ma prawa dostać z seeda.
 */
function openSessionToday(nowMs: number, opening: { mh: number; fuelL: number }): DemoDay {
  const start = nowMs - 3 * 60 * 60 * 1000;
  const dayStartMs = midnightUtc(start);
  const dutyStartMin = Math.floor((start - dayStartMs) / 60_000);

  return {
    sessionUuid: `demo-fgk-${stamp(dayStartMs)}-krz`,
    aircraftId: 'SP-FGK',
    picId: 'KRZ',
    dualId: null,
    dayStartMs,
    dutyStartMin,
    dutyEndMin: null,
    engineStartMin: dutyStartMin + 40,
    engineStopMin: null,
    operation: 'egzamin',
    client: null,
    departureIcao: 'EPKK',
    arrivalIcao: null,
    mhFormat: FLEET['SP-FGK'].mhFormat,
    reading: { fuelL: opening.fuelL, mh: round2(opening.mh) },
    finalReading: null,
    flights: [
      {
        taxiMin: dutyStartMin + 46,
        takeoffMin: dutyStartMin + 52,
        landingMin: dutyStartMin + 129,
        drop: null,
      },
    ],
    refuel: null,
    clockDriftMs: 0,
  };
}

/** Wiersz planu + stan liczników → pełny opis dnia (czasy, paliwo, motogodziny). */
function dayFrom(
  plan: DayPlan,
  today: number,
  opening: { mh: number; fuelL: number },
  seed: number,
): DemoDay {
  const config = FLEET[plan.aircraftId];
  const dayStartMs = today - plan.offset * DAY_MS;
  const flights = planFlights(plan, seed);

  const engineStartMin = flights[0]!.taxiMin - 4;
  const engineStopMin = flights[flights.length - 1]!.landingMin + 5;
  const engineHours = (engineStopMin - engineStartMin) / 60;

  const fuelStartL = Math.round(opening.fuelL + (plan.fuelAnomalyL ?? 0));
  const mhStart = round2(opening.mh + (plan.mhAnomalyH ?? 0));
  const burnL = engineHours * config.burnLPerH;

  const refuel = planRefuel({
    capacityL: config.capacityL,
    burnLPerH: config.burnLPerH,
    fuelStartL,
    burnL,
    engineStartMin,
    firstLandingMin: flights[0]!.landingMin,
  });

  const fuelEndL = Math.max(
    10,
    Math.round(fuelStartL - burnL + (refuel?.addedL ?? 0)),
  );
  const closed = plan.delivery !== 'leaveOpen';

  return {
    sessionUuid: `demo-${plan.aircraftId.slice(3).toLowerCase()}-${stamp(dayStartMs)}-${plan.picId.toLowerCase()}`,
    aircraftId: plan.aircraftId,
    picId: plan.picId,
    dualId: plan.dualId,
    dayStartMs,
    dutyStartMin: engineStartMin - 41,
    dutyEndMin: closed ? engineStopMin + 24 : null,
    engineStartMin,
    engineStopMin: closed ? engineStopMin : null,
    operation: plan.operation,
    client: plan.clientIndex == null ? null : CLIENTS[plan.clientIndex]!,
    departureIcao: 'EPKK',
    arrivalIcao: plan.operation === 'ferry' ? 'EPRJ' : null,
    mhFormat: config.mhFormat,
    reading: { fuelL: fuelStartL, mh: mhStart },
    finalReading: closed ? { fuelL: fuelEndL, mh: round2(mhStart + engineHours) } : null,
    flights,
    refuel,
    clockDriftMs: plan.clockDriftMs ?? 0,
  };
}

/**
 * Wzloty dnia. `skoki` to seria krótkich wyniesień z jednego cyklu silnika (32 min
 * na wzlot: 4 kołowania, 22 w powietrzu, 6 na dole na załadunek); pozostałe operacje
 * mają jeden lot o długości charakterystycznej dla siebie.
 */
function planFlights(plan: DayPlan, seed: number): DemoFlight[] {
  if (plan.operation !== 'skoki') {
    const minutes = { ferry: 95, egzamin: 74, techniczny: 26, inne: 47 }[plan.operation];
    return [
      {
        taxiMin: plan.firstTaxiMin,
        takeoffMin: plan.firstTaxiMin + 6,
        landingMin: plan.firstTaxiMin + 6 + minutes,
        drop: null,
      },
    ];
  }

  return Array.from({ length: plan.lifts }, (_unused, lift) => {
    const taxiMin = plan.firstTaxiMin + lift * 32;
    const takeoffMin = taxiMin + 4;
    return {
      taxiMin,
      takeoffMin,
      landingMin: takeoffMin + 22,
      drop: {
        altitudeFt: 12_000 + spread(seed + lift, 3) * 500,
        jumpers: {
          tandem: 2 + spread(seed * 3 + lift, 3),
          aff: spread(seed * 5 + lift, 3),
          solo: spread(seed * 7 + lift, 5),
        },
      },
    };
  });
}

/**
 * Tankowanie w trakcie dnia — wyłącznie wtedy, gdy dzień inaczej skończyłby się poniżej
 * 15% pojemności. Bez tego długie dni na `skoki` schodziłyby do ujemnych litrów, a
 * paliwo w danych demo przestałoby cokolwiek znaczyć.
 */
function planRefuel(input: {
  capacityL: number;
  burnLPerH: number;
  fuelStartL: number;
  burnL: number;
  engineStartMin: number;
  firstLandingMin: number;
}): DemoDay['refuel'] {
  if (input.fuelStartL - input.burnL >= input.capacityL * 0.15) return null;

  const atMin = input.firstLandingMin + 2;
  const burnedByThen = ((atMin - input.engineStartMin) / 60) * input.burnLPerH;
  const beforeL = Math.max(5, Math.round(input.fuelStartL - burnedByThen));
  const afterL = Math.round(input.capacityL * 0.85);
  return { atMin, beforeL, addedL: Math.max(0, afterL - beforeL), afterL };
}

/**
 * Akcje panelu — WYKONYWANE PO wszystkich paczkach, bo każda opisuje decyzję podjętą
 * przy biurku na podstawie danych, które już przyszły z terenu.
 */
function adminActions(
  today: number,
  correction: { sessionUuid: string; targetUuid: string } | null,
): DemoAdminAction[] {
  const ankOpen = `demo-ank-${stamp(today - 9 * DAY_MS)}-pwi`;
  const actions: DemoAdminAction[] = [
    {
      kind: 'resolve_flag',
      actorId: 'TMK',
      flag: { type: 'session_overlap', aircraftId: 'SP-ANK', sessionUuid: ankOpen },
      note:
        'Nakładka pozorna: telefon PWI padł w terenie i dzień domknęła spóźniona paczka. ' +
        'JSE wystartował następnego dnia rano, więc sesje nie zachodziły na siebie w powietrzu. ' +
        'Odblokowuję karty obu dni.',
      why: 'A03a: rozwiązanie nakładki odblokowuje karty obu sesji (re-eksport w odpowiedzi).',
    },
    {
      kind: 'resolve_flag',
      actorId: 'AKO',
      flag: {
        type: 'mh_gap',
        aircraftId: 'SP-AXA',
        sessionUuid: `demo-axa-${stamp(today - 13 * DAY_MS)}-ako`,
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
      why: 'A05: drugi wiersz dziennika przy jednej karcie („3 wiersze dziennika, 1 wiersz karty").',
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
        'Wzlot się odbył, wyniesienia nie było; zgłoszone przez PIC po zamknięciu dnia.',
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
