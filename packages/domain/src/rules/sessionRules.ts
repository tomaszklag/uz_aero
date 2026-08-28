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

import type { CorrectionFields, Event, EventType } from '../events';
import type { ReferenceAircraft } from '../reference';
import type { EpochMillis } from '../time';
import { eventTime, type SessionState } from '../projections';
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
  OIL_EPSILON_L,
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
  /** Minimalny poziom oleju przed lotem (L); `null` = nieskonfigurowany → ostrzeżenie śpi (issue #60). */
  oilMinL: number | null;
  /** Pojemność zbiornika oleju (L); `null` = nieznana → sufit pomiaru i dolewki śpi. */
  oilCapacityL: number | null;
}

/** Brak wiedzy o samolocie — dozwolony stan offline (§4.8), nie błąd. */
export const UNKNOWN_LIMITS: AircraftLimits = {
  capacityL: null,
  oilMinL: null,
  oilCapacityL: null,
};

/** Wyciąga limity z rekordu cache referencyjnego (`null` → limity nieznane). */
export function aircraftLimitsFrom(
  aircraft: ReferenceAircraft | null | undefined,
): AircraftLimits {
  return {
    capacityL: aircraft?.capacityL ?? null,
    oilMinL: aircraft?.oilMinL ?? null,
    oilCapacityL: aircraft?.oilCapacityL ?? null,
  };
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
 * Okno korekty SESJI — JEDNA kotwica: zdanie samolotu (model 2026-08-10).
 *
 * Do 2026-08-10 każdy wzlot miał własne okno kotwiczone w `leg_close.confirmedAt`
 * (awaryjnie w `stoppedAt`). Po pivocie jednostką zatwierdzenia jest SESJA, a jej
 * zatwierdzeniem jest `day_close` — więc i okno jest jedno, liczone od `closedAt`.
 *
 * Sesja NIEZDANA nie ma okna, bo nie ma czego chronić: to sesja w toku, w której pilot
 * i tak może dopisywać zdarzenia i korekty (kokpit, 04c). Okno rusza dopiero wtedy,
 * gdy log został zatwierdzony — i od tej chwili odlicza prawo do samodzielnej poprawki.
 */
export interface CorrectionWindow {
  /** Czy sesja jest zatwierdzona (zdana) — dopiero wtedy okno w ogóle tyka. */
  confirmed: boolean;
  /** Czy pilot może jeszcze poprawiać samodzielnie (sesja w toku ALBO okno trwa). */
  open: boolean;
  /** Kiedy okno się zamyka (UTC); `null`, gdy sesja jeszcze niezdana albo już po. */
  closesAt: EpochMillis | null;
  /** Ile zostało (ms); 0 gdy nie tyka albo już wygasło. */
  remainingMs: number;
}

/** Liczy stan okna korekty sesji. Czysta funkcja — `now` podaje wołający. */
export function correctionWindow(state: SessionState, now: EpochMillis): CorrectionWindow {
  if (!state.closed || state.closedAt == null) {
    return { confirmed: false, open: true, closesAt: null, remainingMs: 0 };
  }
  const closesAt = state.closedAt + CORRECTION_WINDOW_MS;
  // Granica jest DOMKNIĘTA: równo 24 h jeszcze przechodzi, milisekundę dalej już nie —
  // ta sama ostra krawędź, którą miały okna per wzlot (pilnuje jej writeAuthority).
  const open = now <= closesAt;
  return {
    confirmed: true,
    open,
    closesAt: open ? closesAt : null,
    remainingMs: Math.max(0, closesAt - now),
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
    // (Sesja zdana z otwartym oknem; sesję NIEZDANĄ pokrywa już kolizja 1.)
    const window = correctionWindow(state, now);
    if (window.confirmed && window.open) {
      v.push(
        warning(
          'ADMIN_EDIT_PILOT_WINDOW_OPEN',
          'Pilot może jeszcze poprawić tę sesję samodzielnie (okno 24 h od zdania trwa).',
        ),
      );
    }
    return v;
  }

  // Pilot: JEDNO okno sesji, kotwiczone w zdaniu (model 2026-08-10). Sesja w toku nie
  // podlega oknu — korekta w kokpicie przed zatwierdzeniem jest normalną pracą. Do
  // 2026-08-10 okno liczyło się per wzlot od `leg_close`; razem z nim znikły funkcje
  // `legWindowOpen`/`targetLeg` i przypisywanie korekty do konkretnego cyklu.
  //
  // Wpis ręczny, który nie dotyka BIEGU (brak czasów albo czasy poza nim), dokłada
  // NOWY fakt zamiast poprawiać zatwierdzony log — nie podlega oknu, a jego poprawność
  // rozstrzygają reguły per typ (np. MANUAL_ENTRY_EMPTY). Ta sama zasada co przed
  // pivotem, tylko z jedną kotwicą zamiast okien per wzlot.
  if (candidate.type === 'manual_log_entry' && !manualEntryTouchesRun(state, candidate)) {
    return [];
  }
  if (correctionWindow(state, now).open) return [];
  return [
    error(
      'CORRECTION_WINDOW_EXPIRED',
      'Minęło 24 h od zdania samolotu — tę poprawkę wprowadzi administrator.',
    ),
  ];
}

/** Czy czasy wpisu ręcznego wpadają w zamknięty bieg silnika tej sesji. */
function manualEntryTouchesRun(state: SessionState, candidate: Event): boolean {
  if (candidate.type !== 'manual_log_entry') return false;
  const p = candidate.payload;
  const at = p.offBlock ?? p.takeoff ?? p.landing ?? p.onBlock ?? null;
  if (at == null) return false;
  return state.legs.some((l) => l.stoppedAt != null && at >= l.startedAt && at <= l.stoppedAt);
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
      // Pytamy o PREFLIGHT, nie o godzinę meldunku — ta sama poprawka co w `engine_start`
      // niżej, tyle że znaleziona dopiero w audycie 2026-08-08. `dutyStart` był od §3.6a
      // opcjonalny i ekran 02a go nie wysyłał (od issue #23 nie istnieje w ogóle), więc
      // warunek oparty na nim przepuszczał drugi preflight, a ten nadpisuje `mh.start`
      // i `fuel.startL`, czyli POCZĄTEK ŁAŃCUCHA MH (§4.5).
      if (state.preflightAt != null) {
        v.push(
          error('PREFLIGHT_ALREADY_CONFIRMED', 'Preflight tego dnia jest już potwierdzony.'),
        );
      }
      v.push(...checkFuelReading(p.reading.fuelL, limits, 'Odczyt paliwa'));
      if (p.reading.mh < 0) {
        v.push(error('MH_NEGATIVE', 'Odczyt motogodzin nie może być ujemny.', { mh: p.reading.mh }));
      }
      v.push(...checkOilAtPreflight(p.oilL ?? null, p.oilAddedL ?? null, limits));
      break;
    }

    case 'engine_start': {
      // Pytamy o PREFLIGHT, nie o godzinę meldunku. Klamra służby najpierw stała się
      // opcjonalna (§3.6a), a od issue #23 nie istnieje w ogóle — warunkowanie startu
      // silnika godziną meldunku unieruchamiało go u pilota, który zrobił wszystko
      // jak trzeba.
      if (state.preflightAt == null) {
        v.push(
          error('PREFLIGHT_REQUIRED', 'Najpierw potwierdź preflight — bez odczytu MH i paliwa nie ma dnia.'),
        );
      }
      if (state.engineRunning) {
        v.push(error('ENGINE_ALREADY_RUNNING', 'Silnik już pracuje.'));
      } else if (state.legs.some((l) => l.stoppedAt != null)) {
        // Sesja = JEDEN bieg silnika (2026-08-10): po zamkniętym cyklu nie ma drugiego
        // startu — kokpit pokazuje hero ZDAJ SAMOLOT, a kolejny lot to NOWE przejęcie.
        // Gwardia jest w domenie, nie tylko w UI, bo bez niej stary model („kolejne
        // wzloty w sesji") wracałby każdą inną drogą zapisu: wpisem ręcznym, korektą
        // administratora, replayem. `else` świadomie: przy pracującym silniku pilot ma
        // dostać JEDEN komunikat o właściwej rzeczy, nie dwa o tej samej.
        v.push(
          error(
            'SESSION_ALREADY_RAN',
            'Ta sesja miała już swój bieg silnika — zdaj samolot; kolejny lot to nowe przejęcie.',
          ),
        );
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

    case 'oil_add': {
      const p = candidate.payload;
      // Jak tankowanie: dolewa się przy zatrzymanym śmigle (issue #60, decyzja
      // 2026-08-27) — przed uruchomieniem i po wyłączeniu, do zdania samolotu
      // (po `day_close` blokuje ogólna bramka typów korekty).
      if (state.engineRunning) {
        v.push(
          error(
            'OIL_ADD_ENGINE_RUNNING',
            'Dolewka oleju przy pracującym silniku — wyłącz silnik.',
          ),
        );
      }
      // Ujemna ilość i dolewka ponad zbiornik — te same progi, co para na przejęciu.
      v.push(...checkOilValues(null, p.addedL, limits));
      break;
    }

    case 'drop': {
      const p = candidate.payload;
      // Skład jest OPCJONALNY (issue #21 pkt 5): zrzut bez liczb to legalny znacznik
      // faktu wyniesienia — raportowanie skoczków bywa odłożone albo pominięte.
      // Twardo odrzucamy wyłącznie skład wewnętrznie sprzeczny: ujemna liczba
      // skoczków nie jest podejrzana, jest niemożliwa.
      if (p.jumpers != null) {
        const { tandem, aff, solo } = p.jumpers;
        if (tandem < 0 || aff < 0 || solo < 0) {
          v.push(
            error('DROP_NEGATIVE_JUMPERS', 'Liczba skoczków nie może być ujemna.', {
              tandem,
              aff,
              solo,
            }),
          );
        }
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

    case 'boarding': {
      // Lustrzane odbicie gwardii zrzutu (issue #21 pkt 7): załadunek to znacznik
      // faktu z opcjonalnym składem — twardo tylko skład niemożliwy, miękko
      // okoliczności podejrzane. W locie nikt nie wsiada: to niemal na pewno pomyłka
      // „chciałem zapisać zrzut" — ale fakt z terenu zostaje zapisany, flaga sygnalizuje.
      const p = candidate.payload;
      if (p.jumpers != null) {
        const { tandem, aff, solo } = p.jumpers;
        if (tandem < 0 || aff < 0 || solo < 0) {
          v.push(
            error('BOARDING_NEGATIVE_JUMPERS', 'Liczba skoczków nie może być ujemna.', {
              tandem,
              aff,
              solo,
            }),
          );
        }
      }
      if (state.inFlight) {
        v.push(
          warning('BOARDING_IN_FLIGHT', 'Załadunek zapisany w locie — czy to miał być zrzut?'),
        );
      }
      if (state.operation != null && state.operation !== 'skoki') {
        v.push(
          warning(
            'BOARDING_OUTSIDE_JUMP_OPERATION',
            `Załadunek przy operacji „${state.operation}".`,
            { operation: state.operation },
          ),
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

      // Sama korekta pozostaje NIETYKALNA: poprawia się fakt, nie poprawkę — kolejna
      // korekta tego samego celu po prostu zastępuje poprzednią.
      if (targetType === 'event_correction') {
        v.push(
          error(
            'CORRECTION_TARGET_NOT_ALLOWED',
            'Korekty się nie poprawia — dopisz kolejną korektę tego samego zdarzenia.',
          ),
        );
      }

      // `session_claim` przyjmuje WYŁĄCZNIE `retime` (uwaga z urządzenia, issue #43).
      // Godzina przejęcia jest zwykłym faktem — „wziąłem samolot o 9:00, nie o 8:04" —
      // i pilot musi umieć ją sprostować. Nietykalna zostaje sama ISTOTA claimu:
      // `void` zabrałby sesji właściciela (§4.4), a `amend` nie ma tam czego zmienić
      // (tryb przejęcia opisuje, jak maszyna została wzięta, a nie liczbę do poprawy).
      if (targetType === 'session_claim' && p.action !== 'retime') {
        v.push(
          error(
            'CORRECTION_TARGET_NOT_ALLOWED',
            'Przejęcia nie da się unieważnić — sesja zostałaby bez właściciela. Poprawić można jego godzinę.',
          ),
        );
      }

      // `preflight_confirm` i `day_close` przestały być całkiem niekorygowalne (issue #43),
      // ale WYŁĄCZNIE przez `amend`: pilot musi umieć poprawić odczyt paliwa i licznika,
      // bo to jego jedyny zapis stanu maszyny. Czasu tych dwóch chwil się nie zmienia
      // (wyznacza je przejęcie i zdanie maszyny, czyli fakt o dwóch pilotach), a
      // unieważnienie rozbiłoby sesję w pół — zostawiłoby ją bez początku albo bez końca
      // łańcucha MH (§4.5).
      if (
        (targetType === 'preflight_confirm' || targetType === 'day_close') &&
        p.action !== 'amend'
      ) {
        v.push(
          error(
            'CORRECTION_TARGET_NOT_ALLOWED',
            'Przejęcia i zdania samolotu nie da się przesunąć w czasie ani unieważnić — poprawić można odczyt paliwa i motogodzin.',
          ),
        );
      }

      // Czas z przyszłości nie jest korektą, tylko przepowiednią. Odniesieniem jest
      // zegar telefonu w chwili zapisu poprawki — bardziej aktualnego „teraz" nie mamy.
      if (p.action === 'retime' && p.newTime > candidate.deviceTime) {
        v.push(error('CORRECTION_TIME_IN_FUTURE', 'Poprawiony czas nie może być z przyszłości.'));
      }

      if (p.action === 'amend' && targetType != null) {
        v.push(...checkAmendFields(p.fields, targetType, limits, state.sessionPicId));
      }
      break;
    }

    // Reguły `leg_close` (LEG_CLOSE_ENGINE_RUNNING / LEG_CLOSE_WITHOUT_CYCLE /
    // LEG_ALREADY_CLOSED) żyły tu między 2026-08-06 a 2026-08-10 — usunięte razem
    // ze zdarzeniem: sesję zatwierdza `day_close`, a monotoniczność MH pilnowana
    // jest tam (`MH_REGRESSION` na `finalReading`).

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
      if (state.preflightAt == null) {
        v.push(error('PREFLIGHT_REQUIRED', 'Samolot nie został przejęty — brak preflightu.'));
      }
      if (state.engineRunning || state.inFlight) {
        v.push(
          error(
            'ENGINE_RUNNING_AT_DAY_CLOSE',
            'Silnik pracuje — wyłącz silnik przed zdaniem samolotu.',
          ),
        );
      }
      // Sesja bez ani jednego cyklu silnika (09C): samolot był zajęty i nikt nie poleciał.
      // Bez powodu rejestr zostawia administratorowi pytanie zamiast informacji — ale to
      // MIĘKKA flaga, nie blokada. Odrzucenie zdarzenia skasowałoby jedyny ślad po tym,
      // że maszyna stała zablokowana, a to fakt cenniejszy od kompletności formularza.
      if (state.legs.length === 0 && p.noFlightReason == null) {
        v.push(
          warning(
            'NO_FLIGHT_WITHOUT_REASON',
            'Samolot zdany bez uruchomienia silnika i bez podanego powodu.',
          ),
        );
      }

      // Reguła `DUTY_END_BEFORE_START` żyła tu do 2026-08-11 — usunięta razem
      // z klamrą służby (issue #23): payload nie niesie już godzin do porównania.

      // Łańcuch MH (§4.5) — licznik motogodzin jest monotoniczny. Punktem odniesienia
      // jest OSTATNIE znane wskazanie (odczyt z wzlotu bije stan przy przejęciu), bo to
      // ta wartość zamyka łańcuch. Literówkę pilot poprawi na miejscu; zapisana zatrułaby
      // scalanie sesji na serwerze (MH_REGRESSION).
      const previousMh = lastKnownMh(state);
      if (previousMh != null && p.finalReading.mh < previousMh.value - MH_EPSILON_H) {
        v.push(
          error(
            'MH_REGRESSION',
            `Odczyt MH (${round2(p.finalReading.mh)}) jest niższy niż ${previousMh.since} (${round2(previousMh.value)}). Sprawdź licznik.`,
            { previous: previousMh.value, end: p.finalReading.mh },
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

/** Ostatnie znane wskazanie licznika MH razem ze źródłem — punkt odniesienia łańcucha. */
export interface KnownMh {
  value: number;
  /** „przy przejęciu" / „przy wzlocie 2" — wprost do komunikatu dla pilota. */
  since: string;
}

/**
 * Ostatnie znane wskazanie licznika motogodzin wraz z tym, SKĄD pochodzi.
 *
 * Po 2026-08-10 jedynym źródłem wewnątrz sesji jest stan przy przejęciu — pośrednie
 * odczyty per wzlot znikły razem z `leg_close`, a kolejny odczyt zapada dopiero przy
 * zdaniu (`day_close.finalReading`).
 *
 * PUBLICZNE, bo ekrany muszą ostrzegać dokładnie tym samym progiem, którym reguła
 * odrzuca zapis. Własna kopia porównania w widoku znaczyłaby, że arkusz mówi „w porządku"
 * chwilę przed tym, jak komenda odmawia — a to najgorszy rodzaj rozjazdu, bo wygląda
 * jak błąd aplikacji, nie jak literówka pilota.
 */
export function lastKnownMh(state: SessionState): KnownMh | null {
  return state.mh.start != null ? { value: state.mh.start, since: 'przy przejęciu' } : null;
}

/**
 * Pola dopuszczone przez `amend` dla danego typu celu (issue #43) — BIAŁA LISTA.
 *
 * Reguła jest tu, a nie w `applyCorrections`, bo to jest decyzja o WEJŚCIU: nakładanie
 * musi umieć przeżyć wiersz, którego nie rozumie (baza nie ma `CHECK`-a na payloadzie),
 * ale zapis nie ma prawa go wpuścić. Bez tej listy telefon mógłby wysłać „skoczkowie
 * przy wyłączeniu silnika" — payload przeszedłby walidację kształtu, po czym po cichu
 * nic by nie zrobił, bo `amend` nie miałby czego w nim zmienić.
 */
const AMEND_ALLOWED: Partial<Record<EventType, readonly (keyof CorrectionFields)[]>> = {
  // Notatka z kroku „zadanie" (02e) i skład załogi należą do preflightu: tam pilot
  // napisał jedno i zadeklarował drugie. Olej (issue #60) też: pomiar żyje wyłącznie
  // przy przejęciu — zdanie samolotu (day_close) oleju nie mierzy, więc go nie koryguje.
  preflight_confirm: ['fuelL', 'mh', 'oilL', 'oilAddedL', 'notes', 'dualId'],
  day_close: ['fuelL', 'mh'],
  drop: ['jumpers'],
  manual_log_entry: ['notes'],
};

/**
 * Pola, w których `null` jest WARTOŚCIĄ (skład niepodany, notatka skasowana, sesja
 * jednoosobowa, pomiar/dolewka oleju wycofane) — obecność liczy się po kluczu.
 */
const NULL_IS_VALUE: ReadonlySet<keyof CorrectionFields> = new Set([
  'jumpers',
  'notes',
  'dualId',
  'oilL',
  'oilAddedL',
]);

/** Nazwy pól dla komunikatu — pilot nie zna nazw z payloadu. */
const AMEND_FIELD_LABEL: Record<keyof CorrectionFields, string> = {
  fuelL: 'paliwo',
  mh: 'motogodziny',
  oilL: 'pomiar oleju',
  oilAddedL: 'dolewka oleju',
  jumpers: 'skład zrzutu',
  notes: 'notatka',
  dualId: 'drugi pilot',
};

/**
 * Wartości korekty `amend` — te same progi, co przy pierwszym zapisie.
 *
 * Poprawka nie jest furtką omijającą reguły: 300 litrów w zbiorniku na 212 jest tak samo
 * niemożliwe wpisane przy zdaniu, jak dopisane dzień później. Dlatego sięgamy po te same
 * funkcje (`checkFuelReading`), a nie po ich kopię.
 */
function checkAmendFields(
  fields: CorrectionFields,
  targetType: EventType,
  limits: AircraftLimits,
  /** PIC sesji — do reguły `DUAL_IS_PIC` przy korekcie załogi (issue #43). */
  sessionPicId: string | null,
): RuleViolation[] {
  const v: RuleViolation[] = [];
  const allowed = AMEND_ALLOWED[targetType] ?? [];
  // `jumpers: null`, `notes: null`, `oilL: null` itd. są WARTOŚCIAMI (skład niepodany,
  // notatka skasowana, pomiar wycofany), więc obecność liczymy po kluczu, nie po
  // `!== undefined` — listę trzyma `NULL_IS_VALUE`.
  const present = (Object.keys(fields) as (keyof CorrectionFields)[]).filter(
    (key) => fields[key] !== undefined || NULL_IS_VALUE.has(key),
  );

  if (present.length === 0) {
    v.push(
      error('CORRECTION_FIELD_NOT_ALLOWED', 'Korekta wartości nie wskazuje żadnego pola.'),
    );
  }

  for (const key of present) {
    if (!allowed.includes(key)) {
      v.push(
        error(
          'CORRECTION_FIELD_NOT_ALLOWED',
          `Pole „${AMEND_FIELD_LABEL[key]}" nie należy do tego zdarzenia.`,
          { field: key, targetType },
        ),
      );
    }
  }

  if (fields.fuelL != null) v.push(...checkFuelReading(fields.fuelL, limits, 'Odczyt paliwa'));
  if (fields.mh != null && fields.mh < 0) {
    v.push(error('MH_NEGATIVE', 'Odczyt motogodzin nie może być ujemny.', { mh: fields.mh }));
  }
  // Olej: te same TWARDE progi, co przy pierwszym zapisie (ujemne, ponad zbiornik).
  // Ostrzeżenie „poniżej minimum" tu NIE gra: to podpowiedź „dolej, zanim polecisz",
  // a korekta po fakcie niczego już nie doleje — i widzi zwykle tylko połowę pary
  // (pomiar ALBO dolewkę), więc rachunek minimum kłamałby częściej, niż pomagał.
  if ('oilL' in fields || 'oilAddedL' in fields) {
    v.push(...checkOilValues(fields.oilL ?? null, fields.oilAddedL ?? null, limits));
  }
  if (fields.jumpers != null) {
    const { tandem, aff, solo } = fields.jumpers;
    if (tandem < 0 || aff < 0 || solo < 0) {
      v.push(
        error('DROP_NEGATIVE_JUMPERS', 'Liczba skoczków nie może być ujemna.', {
          tandem,
          aff,
          solo,
        }),
      );
    }
  }
  // Ta sama reguła, co przy `crew_change`: jedna osoba nie leci sama ze sobą w dwóch
  // rolach, a czas blokowy policzony dwa razy temu samemu pilotowi jest nalotem z niczego.
  if (fields.dualId != null && fields.dualId === sessionPicId) {
    v.push(error('DUAL_IS_PIC', 'Dual nie może być tą samą osobą co PIC.'));
  }
  return v;
}

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

/**
 * Olej (issue #60) — TWARDA arytmetyka: ujemne wartości i stan ponad zbiornik.
 *
 * Sufit liczy się na STANIE PO DOLEWCE (`pomiar + dolane`), bo to z nim samolot idzie
 * w powietrze — dzięki temu pomiar 10,6 z dolewką 1,5 pada jednym błędem, a nie dwoma.
 * Dolewka bez pomiaru (bagnet gorący) ma własny wariant: więcej niż zbiornik i tak się
 * nie zmieści. Bez konfiguracji zbiornika (`null`) sufit śpi — jak `checkCapacity` (§4.8).
 */
function checkOilValues(
  levelL: number | null,
  addedL: number | null,
  limits: AircraftLimits,
): RuleViolation[] {
  const v: RuleViolation[] = [];
  if (levelL != null && levelL < 0) {
    v.push(error('OIL_NEGATIVE', 'Pomiar oleju nie może być ujemny.', { oilL: levelL }));
  }
  if (addedL != null && addedL < 0) {
    v.push(error('OIL_NEGATIVE', 'Dolewka oleju nie może być ujemna.', { oilAddedL: addedL }));
  }
  if (v.length > 0) return v; // arytmetyka na ujemnych mówiłaby o niczym

  const cap = limits.oilCapacityL;
  if (cap == null) return v;
  const afterL = levelL != null ? levelL + (addedL ?? 0) : null;
  if (afterL != null && afterL > cap + OIL_EPSILON_L) {
    v.push(
      error(
        'OIL_OVER_CAPACITY',
        (addedL ?? 0) > 0
          ? `Stan oleju po dolewce (${round1(afterL)} L) przekracza zbiornik (${round1(cap)} L).`
          : `Pomiar oleju (${round1(afterL)} L) przekracza zbiornik (${round1(cap)} L).`,
        { oilL: levelL, oilAddedL: addedL, oilAfterL: afterL, oilCapacityL: cap },
      ),
    );
  } else if (afterL == null && addedL != null && addedL > cap + OIL_EPSILON_L) {
    v.push(
      error(
        'OIL_OVER_CAPACITY',
        `Dolewka oleju (${round1(addedL)} L) nie zmieści się w zbiorniku (${round1(cap)} L).`,
        { oilAddedL: addedL, oilCapacityL: cap },
      ),
    );
  }
  return v;
}

/**
 * Olej przy przejęciu: twarda arytmetyka + MIĘKKIE „poniżej minimum" (issue #60).
 *
 * Minimum flaguje warning, nie error — PIC decyduje, a wpisane w konfiguracji minimum
 * bywa błędne (ta sama filozofia, co FUEL_MISMATCH: fakt z terenu jest cenniejszy niż
 * nasza pewność). Ostrzeżenie liczy się na stanie PO dolewce i mówi, ile brakuje —
 * dolewka domykająca minimum gasi je w całości. Bez pomiaru minimum milczy: nie ma
 * wartości, o której mogłoby orzekać.
 */
function checkOilAtPreflight(
  levelL: number | null,
  addedL: number | null,
  limits: AircraftLimits,
): RuleViolation[] {
  const v = checkOilValues(levelL, addedL, limits);
  if (v.length > 0) return v; // minimum na wartości ponad zbiornik byłoby szumem

  const minL = limits.oilMinL;
  if (minL == null || levelL == null) return v;
  const afterL = levelL + (addedL ?? 0);
  if (afterL < minL - OIL_EPSILON_L) {
    const missingL = minL - afterL;
    v.push(
      warning(
        'OIL_BELOW_MIN',
        `Olej poniżej minimum: ${round1(afterL)} L przy minimum ${round1(minL)} L — dolej co najmniej ${round1(missingL)} L.`,
        { oilAfterL: afterL, oilMinL: minL, missingL },
      ),
    );
  }
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
