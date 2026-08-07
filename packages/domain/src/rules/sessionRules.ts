/**
 * UZ Aero — INWARIANTY SESJI (docs/_main.md.txt §3.2–§3.8, §4.1, §4.5).
 *
 * To jest miejsce, w którym mieszka odpowiedź na pytanie „czy to zdarzenie w ogóle
 * mogło się wydarzyć?". Jedna czysta funkcja `checkAppend(stan, kandydat, limity)`
 * dostaje projekcję dotychczasowego strumienia i zdarzenie, które ma zostać dopisane,
 * a zwraca listę naruszeń. Zero I/O, zero zegara, zero UI — dzięki temu każdą regułę
 * da się przetestować jednym wywołaniem funkcji.
 *
 * DLACZEGO TUTAJ, a nie w repozytorium ani w UI:
 *  - repozytorium jest infrastrukturą (append-only log) — musi umieć zapisać każde
 *    zdarzenie, także takie, które przyszłoby z zewnątrz/z migracji; gdyby walidowało,
 *    nie dałoby się odtworzyć historii,
 *  - UI blokuje przyciski, ale UI jest wieloma ekranami i łatwo o dziurę; reguła
 *    zapisana raz w domenie obowiązuje każdą ścieżkę (ekran, autodetekcja GPS, import).
 *
 * TWARDO vs MIĘKKO — kryterium (uzasadnienie w `violations.ts` i `docs/architektura-kodu.md`):
 *  - twardo odrzucamy to, co zepsułoby MASZYNĘ STANÓW dnia (cykle silnika, loty, block
 *    time, łańcuch MH) albo jest wewnętrznie sprzeczne arytmetycznie,
 *  - miękko flagujemy to, co jest tylko PODEJRZANE (paliwomierz, zegary, zrzut poza
 *    operacją skokową) — tu §4.5 daje ostatnie słowo serwerowi, a fakt z terenu jest
 *    cenniejszy niż nasza pewność.
 *
 * FURTKA: gdy pilot przegapi zdarzenie na żywo (np. wystartował przed `engine_start`),
 * właściwym narzędziem NIE jest obchodzenie gwardii, tylko `manual_log_entry` (§3.8) —
 * wpis ręczny niesie własne czasy off-block/T/O/LDG/on-block i z definicji jest korektą
 * historii, a nie przejściem stanu „tu i teraz". Dlatego nie podlega gwardiom silnika.
 */

import type { Event, EventType } from '../events';
import type { ReferenceAircraft } from '../reference';
import type { EpochMillis } from '../time';
import { eventTime, type Leg, type SessionState } from '../projections';
import type { WriteAuthority } from './authority';
import {
  error,
  warning,
  type RuleViolation,
} from './violations';
import {
  CLOCK_DRIFT_MS,
  CORRECTION_WINDOW_MS,
  FUEL_EPSILON_L,
  MH_TOLERANCE_H,
  fuelToleranceL,
} from './tolerances';

const HOUR_MS = 3_600_000;
/** Tolerancja porównań motogodzin (h) — czysto numeryczna, nie biznesowa. */
const MH_EPSILON_H = 1e-6;

/**
 * Konfiguracja samolotu potrzebna regułom (§5.4). Świadomie WĄSKA: reguły dostają
 * dokładnie to, czego używają, więc test inwariantu nie musi budować całego
 * `ReferenceAircraft` ani udawać cache'u.
 */
export interface AircraftLimits {
  /** Pojemność zbiorników (L); `null` = nieznana (offline bez cache) → reguła pojemności śpi. */
  capacityL: number | null;
}

/** Brak wiedzy o samolocie — dozwolony stan offline (§4.8), nie błąd. */
export const UNKNOWN_LIMITS: AircraftLimits = { capacityL: null };

/** Wyciąga limity z rekordu cache referencyjnego (`null` → limity nieznane). */
export function aircraftLimitsFrom(
  aircraft: ReferenceAircraft | null | undefined,
): AircraftLimits {
  return { capacityL: aircraft?.capacityL ?? null };
}

/**
 * Typy zdarzeń dopuszczone PO `day_close` w oknie 24 h (decyzja 2026-07-23).
 * Korekta jest zawsze dopisaniem zdarzenia, nigdy edycją (append-only): brakujący lot
 * uzupełnia `manual_log_entry`, poprawkę istniejącego wpisu niesie `event_correction` (04c).
 */
export const CORRECTION_EVENT_TYPES: readonly EventType[] = [
  'manual_log_entry',
  'event_correction',
];

/**
 * Okno korekty JEDNEGO wzlotu (§3.6a — każdy wzlot ma własne 24 h).
 *
 * Kotwicą jest `confirmedAt`, a gdy pilot wzlotu nie potwierdził („Potwierdzę później")
 * — `stoppedAt`. Bez tej kotwicy awaryjnej wzlot niepotwierdzony miałby okno, które
 * nigdy się nie otwiera, czyli **bezterminowe prawo zapisu** — a niepotwierdzenie jest
 * stanem legalnym i częstym, nie brzegowym.
 */
export interface LegCorrectionWindow {
  legIndex: number;
  /** Od czego liczymy: potwierdzenie wzlotu albo (awaryjnie) wyłączenie silnika. */
  anchoredAt: EpochMillis;
  /** Czy kotwicą jest potwierdzenie pilota (`false` = kotwica awaryjna). */
  anchoredOnConfirmation: boolean;
  closesAt: EpochMillis;
  open: boolean;
  remainingMs: number;
}

/** Okna korekty wszystkich ZAMKNIĘTYCH wzlotów sesji. Otwarty wzlot nie ma jeszcze okna. */
export function legCorrectionWindows(
  state: SessionState,
  now: EpochMillis,
): LegCorrectionWindow[] {
  const windows: LegCorrectionWindow[] = [];
  for (const leg of state.legs) {
    if (leg.stoppedAt == null) continue;
    const anchoredAt = leg.confirmedAt ?? leg.stoppedAt;
    const closesAt = anchoredAt + CORRECTION_WINDOW_MS;
    windows.push({
      legIndex: leg.index,
      anchoredAt,
      anchoredOnConfirmation: leg.confirmedAt != null,
      closesAt,
      open: closesAt > now,
      remainingMs: Math.max(0, closesAt - now),
    });
  }
  return windows;
}

/**
 * Zagregowany stan okna korekty — do bannera z odliczaniem (design-notes).
 *
 * Agregat, bo ekran pokazuje JEDNO odliczanie, a wzlotów bywa kilkanaście. Pokazujemy
 * to, które wygasa NAJWCZEŚNIEJ spośród jeszcze otwartych: pilot ma wiedzieć, ile czasu
 * zostało mu na najstarszą poprawkę, a nie na najświeższą.
 */
export interface CorrectionWindow {
  /** Czy jest cokolwiek do korygowania (istnieje zamknięty wzlot). */
  hasClosedLeg: boolean;
  /** Czy pilot może jeszcze samodzielnie poprawić KTÓRYKOLWIEK wzlot. */
  open: boolean;
  /** Kiedy zamyka się najbliższe wygasające okno (UTC); `null`, gdy nie ma otwartych. */
  closesAt: EpochMillis | null;
  /** Ile zostało do tego wygaśnięcia (ms); 0 gdy nie ma otwartych okien. */
  remainingMs: number;
  /** Ile wzlotów można jeszcze poprawić samodzielnie. */
  openLegCount: number;
}

/** Liczy zagregowany stan okien korekty. Czysta funkcja — `now` podaje wołający. */
export function correctionWindow(state: SessionState, now: EpochMillis): CorrectionWindow {
  const windows = legCorrectionWindows(state, now);
  const open = windows.filter((w) => w.open);
  if (open.length === 0) {
    return {
      hasClosedLeg: windows.length > 0,
      open: false,
      closesAt: null,
      remainingMs: 0,
      openLegCount: 0,
    };
  }
  const soonest = open.reduce((a, b) => (a.closesAt <= b.closesAt ? a : b));
  return {
    hasClosedLeg: true,
    open: true,
    closesAt: soonest.closesAt,
    remainingMs: soonest.remainingMs,
    openLegCount: open.length,
  };
}

/**
 * Sprawdza, czy `candidate` wolno dopisać do strumienia opisanego przez `state`.
 *
 * @param state     projekcja zdarzeń JUŻ zapisanych (bez kandydata),
 * @param candidate zdarzenie ostemplowane (uuid + zegary) — jeszcze niezapisane,
 * @param limits    konfiguracja samolotu; `UNKNOWN_LIMITS` gdy offline bez cache,
 * @param authority kto dopisuje (`authority.ts`); pominięcie = `'pilot'`, czyli komplet
 *                  reguł. Wartość `'administrative'` uchyla DOKŁADNIE JEDNĄ gałąź —
 *                  `CORRECTION_WINDOW_EXPIRED` — i żadnej innej.
 * @returns lista naruszeń (pusta = wolno zapisać). Twarde = `severity: 'error'`.
 */
export function checkAppend(
  state: SessionState,
  candidate: Event,
  limits: AircraftLimits = UNKNOWN_LIMITS,
  authority: WriteAuthority = 'pilot',
): RuleViolation[] {
  // TWARDE naruszenia „koperty" (tożsamość sesji, single-writer, zdany samolot)
  // unieważniają sens dalszych sprawdzeń — zwracamy je same, żeby pilot dostał JEDEN
  // konkretny powód, a nie listę następstw.
  //
  // Warunek pyta o `severity`, nie o długość listy, i to jest istotne: od 2026-08-07
  // koperta produkuje też OSTRZEŻENIA (kolizje administratora, `ADMIN_EDIT_*`).
  // Skrót „cokolwiek w kopercie → wracaj" sprawiłby, że jedno miękkie ostrzeżenie
  // wycina komplet reguł per typ — administrator zapisałby wtedy pusty wpis ręczny
  // albo korektę z czasem z przyszłości bez jednego sprzeciwu.
  const envelope = checkEnvelope(state, candidate, authority);
  if (envelope.some((v) => v.severity === 'error')) return envelope;

  return [...envelope, ...checkClocks(candidate), ...checkByType(state, candidate, limits)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Koperta: tożsamość sesji, single-writer, zamknięcie dnia
// ─────────────────────────────────────────────────────────────────────────────

function checkEnvelope(
  state: SessionState,
  candidate: Event,
  authority: WriteAuthority,
): RuleViolation[] {
  const v: RuleViolation[] = [];

  // Pusta sesja: pierwsze zdarzenie musi otworzyć sesję (§4.4 — claim jest zwykłym
  // zdarzeniem, ale MUSI być pierwsze, inaczej strumień nie ma właściciela).
  if (state.eventCount === 0) {
    if (candidate.type !== 'session_claim') {
      v.push(
        error(
          'SESSION_NOT_CLAIMED',
          'Sesja nie została rozpoczęta — najpierw przejmij samolot (preflight).',
          { type: candidate.type },
        ),
      );
    }
    return v;
  }

  if (candidate.type === 'session_claim') {
    v.push(
      error('SESSION_ALREADY_CLAIMED', 'Ta sesja jest już rozpoczęta — drugi claim nie jest możliwy.'),
    );
  }
  if (candidate.sessionUuid !== state.sessionUuid) {
    v.push(
      error('SESSION_MISMATCH', 'Zdarzenie należy do innej sesji.', {
        expected: state.sessionUuid,
        got: candidate.sessionUuid,
      }),
    );
  }
  if (candidate.aircraftId !== state.aircraftId) {
    v.push(
      error('AIRCRAFT_MISMATCH', 'Zdarzenie dotyczy innego samolotu niż sesja.', {
        expected: state.aircraftId,
        got: candidate.aircraftId,
      }),
    );
  }
  // Single-writer (§4.1 pkt 3): w ramach sesji pisze wyłącznie telefon jej PIC-a.
  if (state.sessionPicId != null && candidate.picId !== state.sessionPicId) {
    v.push(
      error('WRITER_MISMATCH', 'Sesję prowadzi inny PIC — tylko on może zapisywać zdarzenia.', {
        expected: state.sessionPicId,
        got: candidate.picId,
      }),
    );
  }

  if (state.closed) {
    if (candidate.type === 'day_close') {
      v.push(error('DAY_ALREADY_CLOSED', 'Samolot jest już zdany.'));
    } else if (!CORRECTION_EVENT_TYPES.includes(candidate.type)) {
      v.push(
        error(
          'DAY_CLOSED',
          'Samolot jest zdany — potem można dopisać wyłącznie korektę (wpis ręczny).',
          { type: candidate.type },
        ),
      );
    }
  }

  v.push(...checkCorrectionWindow(state, candidate, authority));

  return v;
}

/**
 * Okno samodzielnej korekty — JEDYNE miejsce w tym pliku, które pyta o uprawnienie.
 *
 * Dwie zmiany względem modelu sprzed 2026-08-06:
 *
 * 1. **Okno kotwiczy się we WZLOCIE, nie w zamknięciu dnia** (§3.6a). Każdy wzlot ma
 *    własne 24 h liczone od jego potwierdzenia — a gdy pilot go nie potwierdził,
 *    awaryjnie od wyłączenia silnika. Bez tej kotwicy awaryjnej niepotwierdzenie
 *    dawałoby bezterminowe prawo zapisu, a jest to stan legalny i częsty.
 *
 * 2. **Administrator nie jest już NIGDY blokowany** (decyzja użytkownika 2026-08-07,
 *    zastępuje bramkę `400 day_open`). Powód: po przebudowie brak `day_close` przestał
 *    znaczyć „dzień trwa" — zdanie samolotu jest opcjonalne, więc sesje sprzed tygodnia
 *    też go nie mają. Bramka odmawiałaby korekty w większości przypadków, w których
 *    jest potrzebna. Zamiast blokady administrator dostaje **jasne ostrzeżenie**, gdy
 *    wchodzi w kolizję z pilotem, i sam decyduje.
 */
function checkCorrectionWindow(
  state: SessionState,
  candidate: Event,
  authority: WriteAuthority,
): RuleViolation[] {
  if (!CORRECTION_EVENT_TYPES.includes(candidate.type)) return [];

  const now = eventTime(candidate);

  if (authority === 'administrative') {
    const v: RuleViolation[] = [];
    // Kolizja 1: pilot nadal prowadzi sesję i może dopisywać zdarzenia. Jego paczka
    // dosłana po synchronizacji trafi do tego samego strumienia.
    if (!state.closed) {
      v.push(
        warning(
          'ADMIN_EDIT_SESSION_ACTIVE',
          'Pilot nadal prowadzi tę sesję — może dopisać własne zdarzenia po synchronizacji.',
        ),
      );
    }
    // Kolizja 2: okno pilota jeszcze trwa, więc obie strony mogą poprawiać naraz.
    const target = targetLeg(state, candidate);
    if (target != null && legWindowOpen(target, now)) {
      v.push(
        warning(
          'ADMIN_EDIT_PILOT_WINDOW_OPEN',
          `Pilot może jeszcze poprawić ten wzlot samodzielnie (okno 24 h wzlotu ${target.index} trwa).`,
          { legIndex: target.index },
        ),
      );
    }
    return v;
  }

  // Pilot: okno TEGO wzlotu, do którego należy korygowane zdarzenie.
  const target = targetLeg(state, candidate);
  if (target == null) return [];
  if (legWindowOpen(target, now)) return [];
  return [
    error(
      'CORRECTION_WINDOW_EXPIRED',
      `Minęło 24 h od zamknięcia wzlotu ${target.index} — tę poprawkę wprowadzi administrator.`,
      { legIndex: target.index },
    ),
  ];
}

/** Kotwica okna wzlotu: potwierdzenie, a gdy go nie ma — wyłączenie silnika. */
function legWindowOpen(leg: Leg, now: EpochMillis): boolean {
  if (leg.stoppedAt == null) return true; // wzlot trwa — okno jeszcze się nie zaczęło
  const anchoredAt = leg.confirmedAt ?? leg.stoppedAt;
  return now - anchoredAt <= CORRECTION_WINDOW_MS;
}

/**
 * Wzlot, którego dotyczy korekta.
 *
 * Dla `event_correction` — wzlot zawierający czas korygowanego zdarzenia (stąd czas
 * w `eventIndex`). Dla `manual_log_entry` — wzlot zawierający wpisany czas; wpis, który
 * nie mieści się w żadnym wzlocie, dokłada NOWY fakt zamiast poprawiać istniejący,
 * więc nie podlega oknu (`null`).
 */
function targetLeg(state: SessionState, candidate: Event): Leg | null {
  const at = correctionTargetTime(state, candidate);
  if (at == null) return null;
  return (
    state.legs.find((l) => l.stoppedAt != null && at >= l.startedAt && at <= l.stoppedAt) ?? null
  );
}

function correctionTargetTime(state: SessionState, candidate: Event): EpochMillis | null {
  if (candidate.type === 'event_correction') {
    return state.eventIndex[candidate.payload.targetUuid]?.at ?? null;
  }
  if (candidate.type === 'manual_log_entry') {
    const p = candidate.payload;
    return p.offBlock ?? p.takeoff ?? p.landing ?? p.onBlock ?? null;
  }
  return null;
}

/** Rozjazd zegarów device↔GPS (§4.5 CLOCK_DRIFT) — miękko: zapisujemy i sygnalizujemy. */
function checkClocks(candidate: Event): RuleViolation[] {
  if (candidate.gpsTime == null) return [];
  const drift = Math.abs(candidate.deviceTime - candidate.gpsTime);
  if (drift <= CLOCK_DRIFT_MS) return [];
  return [
    warning(
      'CLOCK_DRIFT',
      `Zegar telefonu rozjeżdża się z GPS o ${Math.round(drift / 1000)} s — czasy liczymy z GPS.`,
      { driftMs: drift },
    ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Reguły per typ zdarzenia
// ─────────────────────────────────────────────────────────────────────────────

function checkByType(
  state: SessionState,
  candidate: Event,
  limits: AircraftLimits,
): RuleViolation[] {
  const v: RuleViolation[] = [];

  switch (candidate.type) {
    case 'session_claim':
      // Poprawność claimu rozstrzyga koperta (musi być pierwszy). Konflikt dwóch
      // claimów RÓŻNYCH telefonów jest niewidoczny lokalnie — flaguje go serwer
      // (DOUBLE_CLAIM, §4.4); lokalna blokada łamałaby „claim optymistyczny".
      break;

    case 'preflight_confirm': {
      const p = candidate.payload;
      if (state.dutyStart != null) {
        v.push(
          error('PREFLIGHT_ALREADY_CONFIRMED', 'Preflight tego dnia jest już potwierdzony.'),
        );
      }
      v.push(...checkFuelReading(p.reading.fuelL, limits, 'Odczyt paliwa'));
      if (p.reading.mh < 0) {
        v.push(error('MH_NEGATIVE', 'Odczyt motogodzin nie może być ujemny.', { mh: p.reading.mh }));
      }
      break;
    }

    case 'engine_start': {
      if (state.dutyStart == null) {
        v.push(
          error('PREFLIGHT_REQUIRED', 'Najpierw potwierdź preflight — bez odczytu MH i paliwa nie ma dnia.'),
        );
      }
      if (state.engineRunning) {
        v.push(error('ENGINE_ALREADY_RUNNING', 'Silnik już pracuje.'));
      }
      break;
    }

    case 'engine_stop': {
      if (!state.engineRunning) {
        v.push(error('ENGINE_NOT_RUNNING', 'Silnik nie pracuje — nie ma czego wyłączać.'));
      }
      if (state.inFlight) {
        v.push(
          error('ENGINE_STOP_IN_FLIGHT', 'Samolot jest w powietrzu — najpierw zapisz lądowanie.'),
        );
      }
      break;
    }

    case 'taxi': {
      // Kołowanie bez pracującego silnika jest fizycznie niemożliwe — to twardy błąd,
      // tak jak start. Kołowanie „w locie" znaczy, że automat pomylił fazę.
      if (!state.engineRunning) {
        v.push(
          error(
            'ENGINE_NOT_RUNNING',
            'Kołowanie bez pracującego silnika. Uruchom silnik albo popraw wpis.',
          ),
        );
      }
      if (state.inFlight) {
        v.push(error('ALREADY_IN_FLIGHT', 'Samolot jest w powietrzu — kołowanie nie ma sensu.'));
      }
      // Drugie taxi z rzędu to zawsze duplikat (odrodzony detektor po remoncie ekranu,
      // dryf GPS), nie nowy fakt: kołowanie raz otwarte trwa, aż zamknie je start albo
      // wyłączenie silnika. Decyzja 2026-08-04.
      if (state.taxiing) {
        v.push(
          error(
            'ALREADY_TAXIING',
            'Kołowanie już trwa — następnym zdarzeniem może być tylko start albo wyłączenie silnika.',
          ),
        );
      }
      break;
    }

    case 'takeoff': {
      if (!state.engineRunning) {
        v.push(
          error(
            'ENGINE_NOT_RUNNING',
            'Start bez pracującego silnika. Uruchom silnik albo dopisz lot listą ręczną.',
          ),
        );
      }
      if (state.inFlight) {
        v.push(error('ALREADY_IN_FLIGHT', 'Lot już trwa — najpierw zapisz lądowanie.'));
      }
      break;
    }

    case 'landing': {
      if (!state.inFlight) {
        v.push(
          error(
            'NOT_IN_FLIGHT',
            'Lądowanie bez startu. Dopisz start albo użyj listy ręcznej (fallback GPS).',
          ),
        );
      }
      break;
    }

    case 'refuel': {
      const p = candidate.payload;
      if (state.engineRunning) {
        v.push(error('REFUEL_ENGINE_RUNNING', 'Tankowanie przy pracującym silniku — wyłącz silnik.'));
      }
      if (p.addedL < 0) {
        v.push(error('FUEL_NEGATIVE', 'Ilość dolana nie może być ujemna.', { addedL: p.addedL }));
      }
      if (p.beforeL < 0 || p.afterL < 0) {
        v.push(error('FUEL_NEGATIVE', 'Stan paliwa nie może być ujemny.', {
          beforeL: p.beforeL,
          afterL: p.afterL,
        }));
      }
      if (Math.abs(p.beforeL + p.addedL - p.afterL) > FUEL_EPSILON_L) {
        v.push(
          error(
            'FUEL_ARITHMETIC',
            `Stan po tankowaniu nie zgadza się z sumą: ${p.beforeL} + ${p.addedL} ≠ ${p.afterL} L.`,
            { beforeL: p.beforeL, addedL: p.addedL, afterL: p.afterL },
          ),
        );
      }
      v.push(...checkCapacity(p.afterL, limits, 'Stan po tankowaniu'));

      // Odczyt „przed" vs ostatni znany odczyt: SPADEK jest normalny (paliwo się spala
      // między odczytami — nie modelujemy zużycia, więc nie mamy czego porównywać).
      // Podejrzany jest tylko WZROST bez tankowania. Miękko, bo §4.1 pkt 5 daje ostatnie
      // słowo licznikowi fizycznemu, a nie naszej rachubie (§4.5 FUEL_MISMATCH).
      if (state.fuel.lastReadingL != null) {
        const tolerance = fuelToleranceL(limits.capacityL);
        const growth = p.beforeL - state.fuel.lastReadingL;
        if (growth > tolerance) {
          v.push(
            warning(
              'FUEL_MISMATCH',
              `Stan przed tankowaniem (${round1(p.beforeL)} L) jest wyższy niż ostatni odczyt (${round1(state.fuel.lastReadingL)} L) — sprawdź, czy ktoś nie tankował poza aplikacją.`,
              { beforeL: p.beforeL, lastReadingL: state.fuel.lastReadingL, toleranceL: tolerance },
            ),
          );
        }
      }
      break;
    }

    case 'drop': {
      const p = candidate.payload;
      const { tandem, aff, solo } = p.jumpers;
      const total = tandem + aff + solo;
      if (tandem < 0 || aff < 0 || solo < 0 || total <= 0) {
        v.push(
          error('DROP_NO_JUMPERS', 'Zrzut musi mieć co najmniej jednego skoczka.', {
            tandem,
            aff,
            solo,
          }),
        );
      }
      // Miękko: zrzut to strona PRZYCHODOWA dnia (decyzja 2026-07-23). Zablokowanie
      // wpisu, bo pilot kliknął sekundę po lądowaniu, kosztowałoby dane o pieniądzach —
      // a stan maszyny (cykle, loty) i tak pozostaje nienaruszony.
      if (!state.inFlight) {
        v.push(warning('DROP_ON_GROUND', 'Zrzut zapisany poza lotem — sprawdź, czy to właściwy lot.'));
      }
      if (state.operation != null && state.operation !== 'skoki') {
        v.push(
          warning('DROP_OUTSIDE_JUMP_OPERATION', `Zrzut przy operacji „${state.operation}".`, {
            operation: state.operation,
          }),
        );
      }
      break;
    }

    case 'crew_change': {
      const p = candidate.payload;
      if (p.role === 'pic') {
        v.push(
          error(
            'PIC_CHANGE_NOT_ALLOWED',
            'Zmiana PIC = przejęcie sesji na telefonie nowego pilota: zamknij dzień, nowy PIC robi własny preflight.',
          ),
        );
      }
      if (p.role === 'dual' && p.pilotInId != null && p.pilotInId === state.sessionPicId) {
        v.push(error('DUAL_IS_PIC', 'Dual nie może być tą samą osobą co PIC.'));
      }
      break;
    }

    case 'event_correction': {
      const p = candidate.payload;
      const targetType = state.eventIndex[p.targetUuid]?.type;

      if (targetType == null) {
        // Cel spoza tej sesji (albo literówka w uuid) — poprawka wisiałaby w próżni,
        // a serwer nie miałby czego scalić.
        v.push(
          error('CORRECTION_TARGET_NOT_FOUND', 'Korygowane zdarzenie nie istnieje w tej sesji.'),
        );
        break;
      }

      // Korygowalne są FAKTY OPERACYJNE (starty, lądowania, cykle, tankowania…).
      // Zdarzenia cyklu życia sesji mają własne ścieżki: claim to tożsamość dnia,
      // preflight i day_close niosą odczyty łańcucha MH (§4.5) — „przesunięcie czasu"
      // niczego by w nich nie poprawiało, a unieważnienie rozbiłoby sesję w pół.
      if (
        targetType === 'session_claim' ||
        targetType === 'preflight_confirm' ||
        targetType === 'day_close' ||
        targetType === 'event_correction'
      ) {
        v.push(
          error(
            'CORRECTION_TARGET_NOT_ALLOWED',
            'To zdarzenie nie podlega korekcie — poprawki dotyczą zdarzeń operacyjnych (starty, lądowania, cykle, tankowania).',
          ),
        );
      }

      // Czas z przyszłości nie jest korektą, tylko przepowiednią. Odniesieniem jest
      // zegar telefonu w chwili zapisu poprawki — bardziej aktualnego „teraz" nie mamy.
      if (p.action === 'retime' && p.newTime > candidate.deviceTime) {
        v.push(error('CORRECTION_TIME_IN_FUTURE', 'Poprawiony czas nie może być z przyszłości.'));
      }
      break;
    }

    case 'leg_close': {
      const p = candidate.payload;

      // Wzlot zamyka się PO wyłączeniu silnika. Potwierdzenie przy pracującym silniku
      // albo w powietrzu znaczy, że ekran otworzył się nie w tym momencie — a czasy,
      // które pilot właśnie zatwierdza, jeszcze nie są kompletne.
      if (state.engineRunning) {
        v.push(
          error(
            'LEG_CLOSE_ENGINE_RUNNING',
            'Silnik pracuje — wzlot zamyka się po jego wyłączeniu.',
          ),
        );
      }
      // Zamykanie wzlotu, którego nie było: żaden cykl silnika nie zapadł.
      if (state.legs.length === 0) {
        v.push(
          error('LEG_CLOSE_WITHOUT_CYCLE', 'Nie ma czego zamykać — silnik ani razu nie ruszył.'),
        );
      } else if (!state.legs.some((l) => l.stoppedAt != null && !l.confirmed)) {
        // Nie ma zamkniętego wzlotu czekającego na potwierdzenie — czyli to duplikat
        // (dwa tapnięcia, wznowiony ekran po restarcie aplikacji). Pytamy o KONKRETNY
        // stan, nie o arytmetykę liczników: „ile potwierdzeń vs ile cykli" dawało ten
        // sam werdykt, ale nie umiało powiedzieć, którego wzlotu dotyczy.
        v.push(
          error('LEG_ALREADY_CLOSED', 'Wszystkie zamknięte wzloty są już potwierdzone.', {
            legs: state.legs.length,
            confirmed: state.legs.filter((l) => l.confirmed).length,
          }),
        );
      }
      if (p.reading != null) {
        v.push(...checkFuelReading(p.reading.fuelL, limits, 'Odczyt paliwa przy zamknięciu wzlotu'));
        // Łańcuch MH jest monotoniczny także wewnątrz sesji — odczyt niższy niż
        // startowy to literówka, którą pilot poprawi na miejscu. Miękko byłoby tu za
        // mało: ta wartość ma prawo stać się ogniwem łańcucha (§3.6b).
        if (state.mh.start != null && p.reading.mh < state.mh.start - MH_EPSILON_H) {
          v.push(
            error(
              'MH_REGRESSION',
              `Odczyt MH (${round2(p.reading.mh)}) jest niższy niż przy przejęciu (${round2(state.mh.start)}). Sprawdź licznik.`,
              { start: state.mh.start, reading: p.reading.mh },
            ),
          );
        }
      }
      break;
    }

    case 'manual_log_entry': {
      const p = candidate.payload;
      const times: Array<[string, EpochMillis | null | undefined]> = [
        ['off block', p.offBlock],
        ['T/O', p.takeoff],
        ['LDG', p.landing],
        ['on block', p.onBlock],
      ];
      const present = times.filter((t): t is [string, EpochMillis] => t[1] != null);
      if (present.length === 0) {
        v.push(error('MANUAL_ENTRY_EMPTY', 'Wpis ręczny bez żadnego czasu — uzupełnij co najmniej jedno pole.'));
      }
      for (let i = 1; i < present.length; i++) {
        if (present[i]![1] < present[i - 1]![1]) {
          v.push(
            error(
              'MANUAL_ENTRY_TIME_ORDER',
              `Czasy wpisu ręcznego są w złej kolejności: ${present[i]![0]} przed ${present[i - 1]![0]}.`,
            ),
          );
          break;
        }
      }
      break;
    }

    case 'day_close': {
      const p = candidate.payload;
      if (state.dutyStart == null) {
        v.push(error('PREFLIGHT_REQUIRED', 'Dzień nie został rozpoczęty — brak preflightu.'));
      }
      if (state.engineRunning || state.inFlight) {
        v.push(
          error(
            'ENGINE_RUNNING_AT_DAY_CLOSE',
            'Silnik pracuje — wyłącz silnik przed zdaniem samolotu.',
          ),
        );
      }
      // Klamra jest opcjonalna od schemaVersion 2 (§3.6a), więc reguła kolejności
      // budzi się TYLKO wtedy, gdy pilot podał obie godziny. Brak deklaracji nie jest
      // naruszeniem — jest stanem domyślnym.
      if (state.dutyStart != null && p.dutyEnd != null && p.dutyEnd < state.dutyStart) {
        v.push(
          error('DUTY_END_BEFORE_START', 'Koniec służby jest wcześniejszy niż meldunek.', {
            dutyStart: state.dutyStart,
            dutyEnd: p.dutyEnd,
          }),
        );
      }

      // Łańcuch MH (§4.5) — licznik motogodzin jest monotoniczny. Odczyt niższy niż
      // startowy to literówka, którą pilot poprawi na miejscu; zapisanie jej zatrułoby
      // scalanie sesji na serwerze (MH_REGRESSION).
      if (state.mh.start != null && p.finalReading.mh < state.mh.start - MH_EPSILON_H) {
        v.push(
          error(
            'MH_REGRESSION',
            `Odczyt MH (${round2(p.finalReading.mh)}) jest niższy niż na starcie dnia (${round2(state.mh.start)}). Sprawdź licznik.`,
            { start: state.mh.start, end: p.finalReading.mh },
          ),
        );
      }
      // Δ MH vs block time — miękko: rozbieżność bywa legalna (wpisy ręczne, przegapiony
      // cykl), a rozstrzyga to serwer po całym łańcuchu sesji (§4.5).
      if (state.mh.start != null && p.finalReading.mh >= state.mh.start) {
        const deltaH = p.finalReading.mh - state.mh.start;
        const blockH = state.blockTimeMs / HOUR_MS;
        if (Math.abs(deltaH - blockH) > MH_TOLERANCE_H) {
          v.push(
            warning(
              'MH_DELTA_MISMATCH',
              `Przyrost MH (${round2(deltaH)} h) różni się od czasu blokowego (${round2(blockH)} h).`,
              { deltaH, blockH },
            ),
          );
        }
      }

      v.push(...checkFuelReading(p.finalReading.fuelL, limits, 'Odczyt końcowy paliwa'));
      // Paliwo nie rośnie samo (§design-notes: „nie może rosnąć bez tankowania").
      // Wzrost w granicach tolerancji paliwomierza puszczamy — powyżej to brak zdarzenia
      // `refuel`, czyli dziura w rozliczeniu rozchodu, a nie szum przyrządu.
      if (state.fuel.lastReadingL != null) {
        const tolerance = fuelToleranceL(limits.capacityL);
        const growth = p.finalReading.fuelL - state.fuel.lastReadingL;
        if (growth > tolerance) {
          v.push(
            error(
              'FUEL_INCREASE_WITHOUT_REFUEL',
              `Paliwa jest więcej niż przed lotem (${round1(p.finalReading.fuelL)} L vs ${round1(state.fuel.lastReadingL)} L) — zapisz tankowanie.`,
              { endL: p.finalReading.fuelL, expectedL: state.fuel.lastReadingL, toleranceL: tolerance },
            ),
          );
        }
      }
      break;
    }

    default:
      assertNever(candidate);
  }

  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze
// ─────────────────────────────────────────────────────────────────────────────

/** Odczyt paliwomierza: nieujemny i mieszczący się w zbiornikach (§3.4). */
function checkFuelReading(
  value: number,
  limits: AircraftLimits,
  label: string,
): RuleViolation[] {
  const v: RuleViolation[] = [];
  if (value < 0) {
    v.push(error('FUEL_NEGATIVE', `${label} nie może być ujemny.`, { value }));
  }
  v.push(...checkCapacity(value, limits, label));
  return v;
}

/** Pojemność zbiorników jako twardy sufit — o ile znamy konfigurację (§5.4). */
function checkCapacity(
  value: number,
  limits: AircraftLimits,
  label: string,
): RuleViolation[] {
  if (limits.capacityL == null) return []; // offline bez cache — reguła śpi (§4.8)
  if (value <= limits.capacityL + FUEL_EPSILON_L) return [];
  return [
    error(
      'FUEL_OVER_CAPACITY',
      `${label} (${round1(value)} L) przekracza pojemność zbiorników (${round1(limits.capacityL)} L).`,
      { value, capacityL: limits.capacityL },
    ),
  ];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Strażnik wyczerpania unii — kompilator pilnuje, by nowy typ zdarzenia dostał regułę. */
function assertNever(value: never): never {
  throw new Error(`Typ zdarzenia bez reguł: ${JSON.stringify(value)}`);
}
