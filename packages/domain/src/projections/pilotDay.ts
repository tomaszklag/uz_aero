/**
 * UZ Aero — projekcja DNIA PILOTA (docs/_main.md.txt §3.6, model po issue #23).
 *
 * Reguła, z której wynika cały ten moduł: **do pilota w danej dobie UTC przypisana
 * jest lista sesji** — i nic ponadto. Klamra służby (meldunek / koniec / czas „od
 * pierwszej do ostatniej czynności") żyła tu między 2026-08-06 a 2026-08-11 i została
 * usunięta W CAŁOŚCI (issue #23): niczego nie mierzyła, a wymagała deklaracji,
 * zamykania dnia i osobnych reguł. Dzień pilota zaczyna się pierwszą sesją
 * i nie jest bytem, który się otwiera albo zamyka.
 *
 * DLACZEGO TO OSOBNA PROJEKCJA, A NIE POLE `SessionState`:
 * dzień należy do PILOTA, a `SessionState` opisuje jeden SAMOLOT. Pilot, który
 * w jednej dobie latał dwiema maszynami, ma jeden dzień i dwie sesje — żadna z nich
 * nie zna drugiej, więc żadna nie może złożyć listy. Ta funkcja bierze zatem
 * wszystkie sesje doby i składa z nich oś pilota.
 *
 * To CZYSTA funkcja: bez I/O, bez zegara, bez wiedzy o tym, skąd sesje pochodzą.
 * Wołający (telefon z SQLite, serwer z Postgresa) sam dobiera sesje doby.
 */

import type { EpochMillis } from '../time';
import type { SessionState } from './session';

/** Doba UTC jako liczba — północ 00:00:00.000Z. Klucz grupowania dnia pilota. */
export type UtcDayStart = EpochMillis;

const DAY_MS = 86_400_000;

/** Początek doby UTC, w której leży `t`. Dzielenie całkowite — bez `Date`, bez stref. */
export function utcDayStart(t: EpochMillis): UtcDayStart {
  return Math.floor(t / DAY_MS) * DAY_MS;
}

/**
 * Sesja widziana z osi PILOTA — bieg silnika wzbogacony o samolot.
 *
 * `Leg` żyje wewnątrz sesji i nie musi wiedzieć, czyj jest; tutaj samolot jest
 * INFORMACJĄ wiersza, bo lista sesji doby biegnie płaską osią czasu przez maszyny
 * (issue #23 pkt 3: bez grupowania po samolocie — grupy kłamały o przebiegu dnia
 * przy każdej przesiadce).
 *
 * Sesja = jeden bieg silnika (2026-08-10), więc wiersz doby OPISUJE SESJĘ: czasy
 * silnika, liczba lotów w środku, blok i czas w powietrzu.
 */
export interface PilotDaySession {
  /** Numer w DOBIE (1-based) — ekran 01 numeruje ciągiem przez maszyny. */
  index: number;
  aircraftId: string;
  sessionUuid: string;
  startedAt: EpochMillis;
  /** `null` = silnik nadal pracuje. */
  stoppedAt: EpochMillis | null;
  /** Czas blokowy sesji (ms); 0 dopóki bieg otwarty. */
  blockMs: number;
  /** Suma czasu lotów, które zaczęły się wewnątrz biegu (ms). */
  flightMs: number;
  /** Liczba lotów (start → lądowanie) w tej sesji — kolumna „Loty" na 01. */
  flightCount: number;
  /** Sesja wpisana ręcznie po fakcie (ekran 15) — plakietka „RĘCZNIE" na kafelku. */
  manualEntry: boolean;
}

/** Dzień pilota w jednej dobie UTC — lista sesji + sumy, przekrojowo po samolotach. */
export interface PilotDay {
  pilotId: string;
  /** Doba UTC, do której należy ten dzień (północ). */
  day: UtcDayStart;

  /** Sesje doby w kolejności chronologicznej, przekrojowo po samolotach. */
  sessions: PilotDaySession[];
  /** Samoloty użyte w tej dobie, w kolejności pierwszego użycia. */
  aircraftIds: string[];

  blockTimeMs: number;
  flightTimeMs: number;
  takeoffCount: number;
  landingCount: number;
}

/** Pusty dzień — doba, w której pilot nic nie zrobił. */
export function emptyPilotDay(pilotId: string, day: UtcDayStart): PilotDay {
  return {
    pilotId,
    day,
    sessions: [],
    aircraftIds: [],
    blockTimeMs: 0,
    flightTimeMs: 0,
    takeoffCount: 0,
    landingCount: 0,
  };
}

/**
 * Składa dzień pilota w dobie UTC z sesji, które w tej dobie prowadził.
 *
 * @param sessions sesje pilota (projekcje `projectSession`) — wołający dobiera je
 *                 z bazy; funkcja sama odfiltruje cudze i spoza doby,
 * @param pilotId  pilot, którego dzień liczymy (porównywane z `sessionPicId`,
 *                 czyli JEDYNYM piszącym sesji — §4.1 pkt 3),
 * @param day      doba UTC (północ; użyj `utcDayStart`).
 *
 * Przynależność sesji do doby wyznacza czas URUCHOMIENIA silnika. Sesja rozpoczęta
 * o 23:50 i zatrzymana o 00:20 należy w całości do doby, w której wystartowała — inaczej
 * jeden lot rozpadłby się na dwa dni, czyli dokładnie ten problem, który przebudowa
 * flow usunęła.
 */
export function projectPilotDay(
  sessions: readonly SessionState[],
  pilotId: string,
  day: UtcDayStart,
): PilotDay {
  const pilotDay = emptyPilotDay(pilotId, day);

  const mine = sessions.filter((s) => s.sessionPicId === pilotId);

  // Sesje doby (po jednym biegu silnika każda), uporządkowane w czasie.
  const collected: PilotDaySession[] = [];
  for (const s of mine) {
    if (s.sessionUuid == null || s.aircraftId == null) continue;

    // Po 2026-08-10 `legs` ma zero albo jeden element (SESSION_ALREADY_RAN); pętla
    // zostaje, bo projekcja musi opisać także strumień złamany — dwa biegi w jednej
    // sesji dadzą dwa wiersze, a nie cichą utratę drugiego.
    for (const leg of s.legs) {
      if (utcDayStart(leg.startedAt) !== day) continue;
      collected.push({
        index: 0, // numer w dobie nadajemy po posortowaniu
        aircraftId: s.aircraftId,
        sessionUuid: s.sessionUuid,
        startedAt: leg.startedAt,
        stoppedAt: leg.stoppedAt,
        blockMs: leg.durationMs,
        flightMs: flightMsWithin(s, leg.startedAt, leg.stoppedAt),
        flightCount: flightCountWithin(s, leg.startedAt, leg.stoppedAt),
        manualEntry: s.manualEntry,
      });
    }

    for (const f of s.flights) {
      if (utcDayStart(f.takeoffAt) !== day) continue;
      pilotDay.takeoffCount += 1;
      if (f.landingAt != null) pilotDay.landingCount += 1;
    }
  }

  collected.sort((a, b) => a.startedAt - b.startedAt);
  collected.forEach((session, i) => {
    session.index = i + 1;
  });
  pilotDay.sessions = collected;

  for (const session of collected) {
    pilotDay.blockTimeMs += session.blockMs;
    pilotDay.flightTimeMs += session.flightMs;
    if (!pilotDay.aircraftIds.includes(session.aircraftId)) {
      pilotDay.aircraftIds.push(session.aircraftId);
    }
  }

  return pilotDay;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze
// ─────────────────────────────────────────────────────────────────────────────

/** Liczba lotów, które ZACZĘŁY się wewnątrz biegu — kolumna „Loty" na 01. */
function flightCountWithin(
  s: SessionState,
  from: EpochMillis,
  to: EpochMillis | null,
): number {
  let count = 0;
  for (const f of s.flights) {
    if (f.takeoffAt < from) continue;
    if (to != null && f.takeoffAt > to) continue;
    count += 1;
  }
  return count;
}

/** Suma czasu lotów, które ZACZĘŁY się wewnątrz biegu. */
function flightMsWithin(
  s: SessionState,
  from: EpochMillis,
  to: EpochMillis | null,
): number {
  let total = 0;
  for (const f of s.flights) {
    if (f.takeoffAt < from) continue;
    if (to != null && f.takeoffAt > to) continue;
    total += f.durationMs;
  }
  return total;
}
