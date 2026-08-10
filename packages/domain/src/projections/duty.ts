/**
 * UZ Aero — projekcja SŁUŻBY PILOTA (docs/_main.md.txt §3.6a).
 *
 * Reguła, z której wynika cały ten moduł:
 * **loty są ZAPISYWANE, służba jest DEKLAROWANA i zawsze stanowi klamrę wokół lotów**
 * (służba ⊇ suma sesji, zawsze).
 *
 * DLACZEGO TO OSOBNA PROJEKCJA, A NIE POLE `SessionState`:
 * służba należy do PILOTA, a `SessionState` opisuje jeden SAMOLOT. Pilot, który
 * w jednej dobie latał dwiema maszynami, ma jedną służbę i dwie sesje — żadna z nich
 * nie zna drugiej, więc żadna nie może policzyć klamry. Ta funkcja bierze zatem
 * wszystkie sesje doby i składa z nich oś pilota.
 *
 * DLACZEGO NIE OSOBNA OŚ ZDARZEŃ dla służby (decyzja 2026-08-06, §5.1): nagłówek
 * zdarzenia wymaga `session_uuid` i `aircraft_id`, więc „meldunek" nie miałby gdzie
 * mieszkać. Zamiast tego klamra jedzie jako dwa OPCJONALNE pola w istniejących
 * payloadach (`preflight_confirm.dutyStart`, `day_close.dutyEnd`), a tutaj składamy
 * z nich obraz doby.
 *
 * To CZYSTA funkcja: bez I/O, bez zegara, bez wiedzy o tym, skąd sesje pochodzą.
 * Wołający (telefon z SQLite, serwer z Postgresa) sam dobiera sesje doby.
 */

import type { EpochMillis } from '../time';
import type { SessionState } from './session';

/** Doba UTC jako liczba — północ 00:00:00.000Z. Klucz grupowania służby. */
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
 * informacją pierwszorzędną, bo lista sesji doby biegnie PRZEKROJOWO po maszynach
 * (ekran 01: „SP-AXA · Skoki" nad dwoma wierszami, „SP-KLM · Przelot" nad trzecim).
 *
 * Od 2026-08-10 sesja = jeden bieg silnika, więc wiersz doby OPISUJE SESJĘ: czasy
 * silnika, liczba lotów w środku, blok i czas w powietrzu. Pola potwierdzenia per
 * wzlot znikły — sesję zatwierdza zdanie samolotu, a `releasedAt` jest kotwicą
 * JEDYNEGO okna korekty tej sesji (24 h od zdania, ekran 01B).
 */
export interface DutySession {
  /** Numer w DOBIE (1-based) — nie w sesji. Ekran 01 numeruje ciągiem przez maszyny. */
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
  /**
   * Kiedy pilot zdał samolot (`day_close`) — KOTWICA okna korekty tej sesji.
   * `null` = sesja jeszcze niezdana (pilot w kokpicie; na 01 tego stanu nie widać,
   * bo kokpit jest modalny, ale projekcję czyta też serwer i historia).
   */
  releasedAt: EpochMillis | null;
}

/** Służba pilota w jednej dobie UTC — oś pilota, przekrojowa po samolotach. */
export interface DutyDay {
  pilotId: string;
  /** Doba UTC, do której należy ta służba (północ). */
  day: UtcDayStart;

  /**
   * Początek klamry — **UNIA** deklaracji i pierwszego wzlotu, czyli wcześniejsza
   * z tych dwóch wartości. „⊇" nie jest tu metaforą: gdyby pilot zadeklarował meldunek
   * PÓŹNIEJSZY niż pierwszy wzlot, klamra i tak obejmie wzlot, bo lot jest faktem,
   * a deklaracja opisem. `null` = ani deklaracji, ani wzlotu (dzień pusty).
   */
  startAt: EpochMillis | null;
  /** Koniec klamry — unia deklaracji i ostatniego wzlotu. `null` = służba trwa. */
  endAt: EpochMillis | null;

  /**
   * Co pilot ZADEKLAROWAŁ, niezależnie od wzlotów (`null` = nie deklarował).
   *
   * Trzymamy to obok klamry efektywnej, bo UI musi umieć dwie rzeczy: napisać
   * „poprawione" zamiast „z pierwszego wzlotu" (ekran 01) i ostrzec, gdy deklaracja
   * ZAWĘŻA klamrę poniżej lotów — czego z samej unii nie da się odczytać.
   */
  declaredStart: EpochMillis | null;
  declaredEnd: EpochMillis | null;

  /**
   * Czy deklaracja próbowała zawęzić klamrę poniżej wzlotów.
   *
   * Nie jest to błąd do odrzucenia — strumień jest append-only, a taki wpis mógł już
   * powstać. Jest to sygnał dla UI (miękkie ostrzeżenie przy arkuszu godziny) i dla
   * panelu (coś wymaga wyjaśnienia).
   */
  declarationNarrowsStart: boolean;
  declarationNarrowsEnd: boolean;

  /** Długość służby (ms); `null` dopóki służba trwa albo doba jest pusta. */
  durationMs: number | null;

  /** Sesje doby w kolejności chronologicznej, przekrojowo po samolotach. */
  sessions: DutySession[];
  /** Samoloty użyte w tej dobie, w kolejności pierwszego użycia. */
  aircraftIds: string[];

  blockTimeMs: number;
  flightTimeMs: number;
  takeoffCount: number;
  landingCount: number;
}

/** Pusta służba — doba, w której pilot nic nie zrobił i niczego nie zadeklarował. */
export function emptyDutyDay(pilotId: string, day: UtcDayStart): DutyDay {
  return {
    pilotId,
    day,
    startAt: null,
    endAt: null,
    declaredStart: null,
    declaredEnd: null,
    declarationNarrowsStart: false,
    declarationNarrowsEnd: false,
    durationMs: null,
    sessions: [],
    aircraftIds: [],
    blockTimeMs: 0,
    flightTimeMs: 0,
    takeoffCount: 0,
    landingCount: 0,
  };
}

/**
 * Składa służbę pilota w dobie UTC z sesji, które w tej dobie prowadził.
 *
 * @param sessions sesje pilota (projekcje `projectSession`) — wołający dobiera je
 *                 z bazy; funkcja sama odfiltruje cudze i spoza doby,
 * @param pilotId  pilot, którego służbę liczymy (porównywane z `sessionPicId`,
 *                 czyli JEDYNYM piszącym sesji — §4.1 pkt 3),
 * @param day      doba UTC (północ; użyj `utcDayStart`).
 *
 * Przynależność sesji do doby wyznacza czas URUCHOMIENIA silnika. Sesja rozpoczęta
 * o 23:50 i zatrzymana o 00:20 należy w całości do doby, w której wystartowała — inaczej
 * jeden lot rozpadłby się na dwie służby, czyli dokładnie ten problem, który ta
 * przebudowa usuwa.
 */
export function projectDuty(
  sessions: readonly SessionState[],
  pilotId: string,
  day: UtcDayStart,
): DutyDay {
  const duty = emptyDutyDay(pilotId, day);

  const mine = sessions.filter((s) => s.sessionPicId === pilotId);

  // Sesje doby (po jednym biegu silnika każda), uporządkowane w czasie.
  const collected: DutySession[] = [];
  for (const s of mine) {
    if (s.sessionUuid == null || s.aircraftId == null) continue;

    // Deklaracje bierzemy z sesji, które NALEŻĄ do tej doby — sesja może być
    // wczorajsza i nieść wczorajszą klamrę.
    if (sessionTouchesDay(s, day)) {
      duty.declaredStart = earlier(duty.declaredStart, s.dutyStart);
      duty.declaredEnd = later(duty.declaredEnd, s.dutyEnd);
    }

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
        releasedAt: s.closedAt,
      });
    }

    for (const f of s.flights) {
      if (utcDayStart(f.takeoffAt) !== day) continue;
      duty.takeoffCount += 1;
      if (f.landingAt != null) duty.landingCount += 1;
    }
  }

  collected.sort((a, b) => a.startedAt - b.startedAt);
  collected.forEach((session, i) => {
    session.index = i + 1;
  });
  duty.sessions = collected;

  for (const session of collected) {
    duty.blockTimeMs += session.blockMs;
    duty.flightTimeMs += session.flightMs;
    if (!duty.aircraftIds.includes(session.aircraftId)) duty.aircraftIds.push(session.aircraftId);
  }

  const firstSessionStart = collected.length > 0 ? collected[0]!.startedAt : null;
  const lastSessionStop = lastClosedStop(collected);

  // KLAMRA = unia deklaracji i wzlotów. Tu mieszka reguła „służba ⊇ suma wzlotów".
  duty.startAt = earlier(duty.declaredStart, firstSessionStart);
  duty.endAt = allClosed(collected) ? later(duty.declaredEnd, lastSessionStop) : null;

  duty.declarationNarrowsStart =
    duty.declaredStart != null && firstSessionStart != null && duty.declaredStart > firstSessionStart;
  duty.declarationNarrowsEnd =
    duty.declaredEnd != null && lastSessionStop != null && duty.declaredEnd < lastSessionStop;

  duty.durationMs =
    duty.startAt != null && duty.endAt != null ? Math.max(0, duty.endAt - duty.startAt) : null;

  return duty;
}

/*
 * `liveDutyMs` USUNIĘTE 2026-08-08 (audyt spójności) i to jest decyzja, nie porządki.
 *
 * Funkcja liczyła długość trwającej służby „do teraz" i domykała ją, gdy `durationMs`
 * przestawało być `null` — czyli w chwili, w której zgasł OSTATNI silnik doby. Ekran 01
 * liczy tę samą wielkość INACZEJ (`myDay.ts`, `dutyTotal`): domyka dopiero na deklaracji
 * pilota, bo służba nie kończy się dlatego, że wzlot się skończył — pilot o 15:25 stoi
 * przy samolocie, którego nie zdał (uzasadnienie w docblocku `endBracket`).
 *
 * Dwie reguły dla jednej liczby to gwarancja rozjazdu, a ta z domeny była tą BŁĘDNĄ dla
 * jedynego ekranu, który ją pokazuje. Uzgodnienie w drugą stronę odpada: „dopóki pilot
 * nie zadeklarował końca, koniec TRWA" jest regułą PREZENTACJI i w projekcji, z której
 * czyta serwer, historia i arkusz, nie ma czego szukać. Domena zostaje przy `durationMs`
 * — klamrze ROZSTRZYGNIĘTEJ — a wariant „na żywo" mieszka tam, gdzie jest potrzebny.
 *
 * Jedynym konsumentem był jej własny test.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze
// ─────────────────────────────────────────────────────────────────────────────

/** Czy sesja ma w tej dobie cokolwiek — bieg silnika albo zadeklarowaną klamrę. */
function sessionTouchesDay(s: SessionState, day: UtcDayStart): boolean {
  if (s.legs.some((l) => utcDayStart(l.startedAt) === day)) return true;
  if (s.dutyStart != null && utcDayStart(s.dutyStart) === day) return true;
  if (s.dutyEnd != null && utcDayStart(s.dutyEnd) === day) return true;
  return false;
}

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

/** Czas zatrzymania ostatniej sesji; `null`, gdy któraś trwa albo brak sesji. */
function lastClosedStop(sessions: readonly DutySession[]): EpochMillis | null {
  let last: EpochMillis | null = null;
  for (const session of sessions) {
    if (session.stoppedAt == null) return null;
    last = last == null || session.stoppedAt > last ? session.stoppedAt : last;
  }
  return last;
}

function allClosed(sessions: readonly DutySession[]): boolean {
  return sessions.length > 0 ? sessions.every((s) => s.stoppedAt != null) : false;
}

/** Wcześniejsza z dwóch wartości; `null` jest neutralne (brak wiedzy nie zawęża). */
function earlier(a: EpochMillis | null, b: EpochMillis | null): EpochMillis | null {
  if (a == null) return b;
  if (b == null) return a;
  return a < b ? a : b;
}

/** Późniejsza z dwóch wartości; `null` jest neutralne. */
function later(a: EpochMillis | null, b: EpochMillis | null): EpochMillis | null {
  if (a == null) return b;
  if (b == null) return a;
  return a > b ? a : b;
}
