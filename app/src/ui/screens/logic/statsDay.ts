/**
 * UZ Aero — projekcja dnia → treść ekranu 10 (mockup `design/10-statystyki.html`).
 *
 * Osobny moduł z tego samego powodu co `cockpitLog.ts`: to jedyna nietrywialna logika
 * prezentacji tego ekranu i jedyna, którą da się sprawdzić bez React Native.
 *
 * Statystyki są **projekcją z lokalnych zdarzeń** (§5.2) — liczą się identycznie offline,
 * więc tu nie ma żadnego wariantu „brak danych z serwera". Wszystko, co poniżej, to
 * przepisanie `SessionState` na napisy z mockupu; ani jedna liczba nie jest liczona
 * drugi raz obok projekcji.
 *
 * Dlaczego własny `hhmm` zamiast `format.duration`: mockup 10 pokazuje czasy z wiodącym
 * zerem („00:53", „06:39", „08:45") — w kolumnie tabeli i w kartach załogi wyrównanie
 * cyfr niesie informację, a `duration()` (używane na 04/09) tego zera nie stawia.
 */

import type { DetectionMethod, Flight, JumperCounts, SessionState } from '../../../domain';
import { dateTimeUtcShort, hhmm, timeUtc } from '../../format';

/**
 * `hhmm` przeniesione do `@uzaero/format` (2026-07-31) — ten sam napis musi produkować
 * karta arkusza po stronie serwera, więc format przestał być sprawą jednego ekranu.
 * Re-eksport zostaje, żeby `StatsScreen` i `CockpitReadonlyScreen` nie zmieniały importu.
 *
 * `dateTimeUtcShort` poszedł tą samą drogą (2026-08-06, issue #12): stempel „23 CZE 16:45"
 * czyta dziś także wskaźnik łączności w `ui/components/`, a komponent nie ma po co sięgać
 * do logiki ekranu. Przy okazji zniknęła DRUGA tablica miesięcy — polskie skróty składają
 * się z pełnych nazw w pakiecie formatów.
 */
export { dateTimeUtcShort, hhmm };

/**
 * Badge nagłówka: „1 lot" / „3 loty" / „6 lotów".
 *
 * Polska liczba mnoga ma trzy formy, a badge stoi w nagłówku ekranu — „6 lot" byłoby
 * pierwszą rzeczą, którą pilot zobaczy po zamknięciu dnia.
 */
export function flightsBadge(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return '1 lot';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} loty`;
  return `${count} lotów`;
}

/** Wiersz tabeli lotów (mockup `.data-table`). */
export interface FlightRow {
  /** Klucz listy; docelowo identyfikator zdarzenia do korekty (04c). */
  id: string;
  /** Numer lotu w dniu. */
  no: string;
  takeoff: string;
  landing: string;
  /** Czas lotu „HH:MM"; „—" dopóki lot otwarty. */
  time: string;
  method: DetectionMethod;
  /** „AUTO" / „RĘCZNIE" — chip w kolumnie „Typ". */
  methodLabel: string;
  /** Opis do etykiety dostępności celu korekty. */
  label: string;
}

/**
 * Loty z projekcji → wiersze tabeli. Czasy w UTC (nagłówek sekcji mówi o tym wprost).
 *
 * Lot bez lądowania (samolot w powietrzu albo przegapione `landing`) zostaje w tabeli
 * z myślnikami zamiast wyliczonego czasu — ukrycie go schowałoby przed pilotem dokładnie
 * ten wiersz, który wymaga korekty.
 */
export function buildFlightRows(flights: Flight[]): FlightRow[] {
  return flights.map((flight) => ({
    // Id wiersza = uuid zdarzenia, w które celuje ołówek korekty (04c). Jeden ołówek
    // na lot, więc wybieramy LĄDOWANIE (to jego czas domyka duration i to jego dotyczy
    // typowa poprawka „GPS wykrył za późno"); lot w powietrzu — start. Arkusz korekty
    // pokazuje w karcie, które zdarzenie poprawia, więc wybór jest jawny dla pilota.
    id: flight.landingUuid ?? flight.takeoffUuid,
    no: String(flight.index),
    takeoff: timeUtc(flight.takeoffAt),
    landing: flight.landingAt != null ? timeUtc(flight.landingAt) : '—',
    time: flight.landingAt != null ? hhmm(flight.durationMs) : '—',
    method: flight.method,
    methodLabel: flight.method === 'auto' ? 'AUTO' : 'RĘCZNIE',
    label: `lot ${flight.index}, start ${timeUtc(flight.takeoffAt)} UTC`,
  }));
}

/**
 * Średnie zużycie paliwa na czas bloku („17 L/H").
 *
 * Odniesieniem jest **block time**, nie flight time — licznik motogodzin i paliwo chodzą
 * od uruchomienia silnika, więc kołowanie też pali. `null` = nie ma z czego policzyć
 * (brak odczytu końcowego albo dzień bez pracy silnika).
 */
export function fuelPerHour(consumedL: number | null, blockTimeMs: number): string | null {
  if (consumedL == null || blockTimeMs <= 0) return null;
  return `${Math.round(consumedL / (blockTimeMs / 3_600_000))} L/H`;
}

/** Rozbicie skoczków wg typów („12 TANDEM · 6 AFF · 4 SOLO"). Zerowe typy pomijamy. */
export function jumperBreakdown(jumpers: JumperCounts): string {
  const parts = [
    jumpers.tandem > 0 ? `${jumpers.tandem} TANDEM` : null,
    jumpers.aff > 0 ? `${jumpers.aff} AFF` : null,
    jumpers.solo > 0 ? `${jumpers.solo} SOLO` : null,
  ].filter((p): p is string => p != null);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/** Wiersz statystyki w karcie załogi. */
export interface CrewStatRow {
  key: string;
  value: string;
}

/** Karta załogi (mockup `.crew-card`). */
export interface CrewCardSpec {
  id: string;
  /** „PIC · zalogowany (Ty)" / „Dual · drugi pilot". */
  role: string;
  /** Kod pilota („TMK"). */
  code: string;
  stats: CrewStatRow[];
  /** Przypis pod statystykami; `null` = bez przypisu. */
  tag: string | null;
  /** Karta zalogowanego pilota — wyróżniona zielenią. */
  active: boolean;
  /** Miejsce Duala nieobsadzone — zamiast kodu pokazujemy adnotację. */
  emptyText: string | null;
}

/**
 * Dwie karty załogi z projekcji.
 *
 * Dwie decyzje warte wyjaśnienia:
 *  • **Dual dostaje ten sam block time, ale „0 / 0" startów i lądowań.** Rejestr jest
 *    single-writer (§4.1 pkt 3) — starty i lądowania zapisuje PIC i to jemu są
 *    przypisane. Dual dzieli czas na pokładzie, a nie wzloty; wpisanie mu tych samych
 *    liczb byłoby podwójnym liczeniem tego samego dnia w dwóch książkach lotów.
 *  • **Przypis „Pełny dzień" tylko wtedy, gdy nie było zmiany załogi.** Po `crew_change`
 *    nie wiemy z projekcji, ile kto był na pokładzie, więc zamiast zgadywać — milczymy.
 */
export function buildCrewCards(
  projection: SessionState,
  currentPilotId: string | null,
  codeOf: (pilotId: string) => string,
  crewChanged: boolean,
): CrewCardSpec[] {
  const block = hhmm(projection.blockTimeMs);
  const tag = crewChanged ? null : 'Pełny dzień';
  const picId = projection.picId;
  const dualId = projection.dualId;

  return [
    {
      id: 'pic',
      role: `PIC · zalogowany${picId != null && picId === currentPilotId ? ' (Ty)' : ''}`,
      code: picId != null ? codeOf(picId) : '—',
      stats: [
        { key: 'Block time', value: block },
        {
          key: 'St / Ld',
          value: `${projection.takeoffCount} / ${projection.landingCount}`,
        },
      ],
      tag,
      active: true,
      emptyText: null,
    },
    {
      id: 'dual',
      role: 'Dual · drugi pilot',
      code: dualId != null ? codeOf(dualId) : '—',
      stats:
        dualId != null
          ? [
              { key: 'Block time', value: block },
              { key: 'St / Ld', value: '0 / 0' },
            ]
          : [],
      tag: dualId != null ? tag : null,
      active: false,
      emptyText: dualId != null ? null : 'brak — dzień jednoosobowy',
    },
  ];
}
