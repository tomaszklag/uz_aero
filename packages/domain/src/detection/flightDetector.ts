/**
 * UZ Aero - automat detekcji startu i lądowania (§3.3).
 *
 * CZYSTA DOMENA: żadnego `expo-location`, żadnych timerów, żadnego Reacta. Dostaje
 * kolejne fixy i zwraca nowy stan + ewentualną detekcję. Dzięki temu cały algorytm -
 * łącznie z przypadkami brzegowymi, które w powietrzu trafiają się raz na sto lotów -
 * testujemy w Node w milisekundach.
 *
 * ZASADA NADRZĘDNA: detekcja **nie zapisuje zdarzenia**. Zwraca sygnał, na podstawie
 * którego UI pokazuje toast z odliczaniem („COFNIJ", §3.2); dopiero po jego upływie
 * leci komenda. Dlatego automat nie wie nic o zdarzeniach ani o zapisie.
 *
 * ── Architektura po przebudowie 2026-07-30 ───────────────────────────────────
 * Automat przestał decydować z pojedynczego fixa. Trzyma teraz w stanie OKNO HISTORII
 * (`history.ts`) i deleguje pracę do czterech modułów, z których każdy odpowiada za
 * jedno pytanie:
 *
 *   trends.ts   - jak zmienia się prędkość, położenie i kurs (cechy z okna);
 *   motion.ts   - czy samolot stoi, czy jedzie (PRZEMIESZCZENIE, nie prędkość chwilowa);
 *   onset.ts    - KIEDY zdarzenie naprawdę nastąpiło (szukanie wstecz w buforze);
 *   thresholds.ts - wszystkie liczby, w jednym miejscu, do kalibracji w fazie 5.
 *
 * Automat zostaje przy tym, co jest naprawdę jego: kolejność decyzji, fazy, histereza.
 *
 * Dlaczego warunki są takie, a nie prostsze (§3.3, §8 „znane ryzyka"):
 *  • START     - prędkość ponad próg (ORAZ dodatnie przyspieszenie) **LUB** przyrost
 *                wysokości ponad próg. Alternatywa, bo start bywa widoczny najpierw
 *                w prędkości (rozbieg), a przy słabym fixie prędkość potrafi kłamać -
 *                wtedy ratuje wysokość.
 *  • LĄDOWANIE - wolno **ORAZ** nisko **ORAZ** bez trwającego zakrętu. Koniunkcja, bo
 *                sam spadek prędkości to codzienność ciasnego zakrętu.
 *  • KOŁOWANIE - oddalenie od kotwicy postoju; prędkość tylko jako kanał wsparcia.
 *  • Oba warunki fazowe muszą się **utrzymać** przez kilka sekund, a po detekcji
 *    obowiązuje histereza (cooldown), żeby jedno zdarzenie nie odpaliło serii.
 */

import { GPS_THRESHOLDS, type GpsThresholds } from './thresholds';
import { distanceNm, type LatLon } from './geo';
import { fixPosition, type GpsFix } from './fix';
import { createHistory, fixesInWindow, pushFix, type FixHistory } from './history';
import { createMotionState, stepMotion, type MotionState } from './motion';
import { liftoffOnset, taxiOnset, touchdownOnset } from './onset';
import { groundSpeed, speedTrendKtPerSec, turnRateDps } from './trends';
import type { EpochMillis } from '../time';

/** Faza lotu z punktu widzenia detektora (nie mylić z fazą wyświetlaną w kokpicie). */
export type DetectorPhase = 'ground' | 'airborne';

/**
 * Co detektor wykrył w tym kroku (null = nic).
 *
 * `taxi` jest w tej unii, bo automat naprawdę je wykrywa - ale UI traktuje je inaczej:
 * start i lądowanie przechodzą przez okno „COFNIJ", kołowanie zapisuje się od razu.
 * Ta różnica to polityka interfejsu (fałszywy start psuje czas lotu, fałszywe kołowanie
 * dodaje wiersz w logu), więc mieszka w `useFlightDetection`, nie tutaj.
 */
export type Detection = 'taxi' | 'takeoff' | 'landing';

/**
 * Bramka JAKOŚCI fixa (audyt 2026-07-29): odbiornik pod zakłóceniami nie milknie -
 * raportuje śmieci. Fix z dokładnością gorszą niż próg albo z absurdalną prędkością
 * traktujemy jak BRAK fixa: system ma na to uczciwą ścieżkę (baner 05g + zapis
 * ręczny), a detekcja karmiona śmieciem umie wyprodukować fałszywe lądowanie w locie.
 * Brak pola (`accuracyM`, `groundSpeedKt`) nie dyskwalifikuje - odrzucamy tylko
 * POZYTYWNIE zły pomiar.
 */
export function fixUsable(fix: GpsFix, thresholds: GpsThresholds = GPS_THRESHOLDS): boolean {
  if (fix.accuracyM != null && fix.accuracyM > thresholds.MAX_FIX_ACCURACY_M) return false;
  if (fix.groundSpeedKt != null && fix.groundSpeedKt > thresholds.MAX_PLAUSIBLE_SPEED_KT) {
    return false;
  }
  return true;
}

export interface DetectorState {
  phase: DetectorPhase;
  /**
   * Czy w bieżącym locie odnotowano już rozpoczęcie kołowania.
   *
   * Zeruje się przy starcie (kolejne kołowanie będzie dopiero po lądowaniu) i przy
   * lądowaniu (samolot kołuje z powrotem). Bez tej flagi kołowanie emitowałoby się
   * przy każdym fixie w ruchu - a ma być JEDNYM wpisem otwierającym lot, jak w mockupie 05.
   */
  taxiing: boolean;
  /**
   * Elewacja lotniska = wysokość GPS w chwili ENGINE START (§3.3, §8 mitygacja), a gdy
   * wtedy nie było fixa z wysokością - z pierwszego fixa NA POSTOJU (§2.1).
   * Null tylko wtedy, gdy przed startem nie było ani jednego takiego fixa.
   */
  fieldElevationFt: number | null;
  /** Od kiedy nieprzerwanie trzyma się warunek zmiany fazy (null = nie trzyma się). */
  candidateSince: EpochMillis | null;
  /** Do kiedy ignorujemy detekcje (histereza po poprzedniej). */
  cooldownUntil: EpochMillis | null;
  /** Czas ostatniego przetworzonego fixa - do wykrywania przerw w sygnale. */
  lastFixAt: EpochMillis | null;
  /** Pozycja ostatniego DOBREGO fixa - test plauzybilności skoku (spoofing/multipath). */
  lastPosition: LatLon | null;
  /** Pozycja pola - kotwica pierwszego postoju; odniesienie geofence'u lądowania. */
  fieldPosition: LatLon | null;
  /**
   * Operacja lata Z i NA to samo lotnisko (skoki): lądowanie uznajemy tylko przy polu
   * (`LANDING_FIELD_VICINITY_NM`). Przelot MUSI mieć `false` - tam lądowanie
   * gdzie indziej jest normą i bramka odcięłaby prawdziwe przyziemienie.
   */
  sameFieldOnly: boolean;
  /** Okno obserwacji - podstawa cech trendowych i retro-datowania. */
  history: FixHistory;
  /** Automat „stoi / jedzie" oparty na przemieszczeniu (tor kołowania). */
  motion: MotionState;
}

export interface DetectorStep {
  state: DetectorState;
  /** Detekcja w tym kroku - UI ma pokazać toast z możliwością cofnięcia. */
  detection: Detection | null;
  /**
   * RETRO-DATOWANY czas zdarzenia: moment, w którym rzecz naprawdę nastąpiła, odnaleziony
   * wstecz w buforze (`onset.ts`). Bywa wyraźnie WCZEŚNIEJSZY niż fix, który detekcję
   * potwierdził - i to jest cały sens. Null, gdy nic nie wykryto.
   */
  detectedAt: EpochMillis | null;
}

/**
 * Maksymalna przerwa między fixami, przy której wciąż wierzymy, że warunek „trwał".
 *
 * Bez tego algorytm jest podatny na fałszywkę: GPS milknie na minutę, wraca ze spełnionym
 * warunkiem, a licznik „utrzymania" nadal wskazuje moment sprzed przerwy - detekcja odpala
 * natychmiast, choć nikt nie obserwował tego, co działo się w międzyczasie.
 */
export const MAX_FIX_GAP_SEC = 10;

/** Stan początkowy - zwykle tworzony przy ENGINE START, z elewacją lotniska. */
export function createDetectorState(
  fieldElevationFt: number | null = null,
  options: { sameFieldOnly?: boolean } = {},
): DetectorState {
  return {
    phase: 'ground',
    taxiing: false,
    fieldElevationFt,
    candidateSince: null,
    cooldownUntil: null,
    lastFixAt: null,
    lastPosition: null,
    fieldPosition: null,
    sameFieldOnly: options.sameFieldOnly ?? false,
    history: createHistory(),
    motion: createMotionState(),
  };
}

/**
 * Uzgadnia fazę automatu z REJESTREM zdarzeń (issue #30). Rejestr wygrywa.
 *
 * Automat i rejestr to dwa niezależne przekonania o tym samym samolocie: pierwsze
 * pochodzi z GPS i żyje tylko tak długo, jak zamontowany kokpit, drugie - ze zdarzeń
 * i przeżywa restart. Rozjeżdżają się przy każdym zapisie spoza automatu: wpisie
 * ręcznym pilota (05f, przyciski Take off / Landing), „COFNIJ" w toaście (faza już się
 * zmieniła, ale zdarzenie świadomie NIE powstało) i przy odrodzeniu detektora w locie.
 *
 * Rozjazd nie jest kosmetyczny, bo faza wybiera, CZEGO automat szuka (§8): po cofniętym
 * fałszywym starcie automat stoi w `airborne` i wypatruje wyłącznie lądowania - prawdziwy
 * start przegapiłby w całości, a z nim cały lot. Pierwszeństwo ma rejestr, bo to on niesie
 * decyzje pilota i to on trafia do dokumentów.
 *
 * `cooldownUntil` zostaje **nietknięty** i to jest wybór, nie przeoczenie: „COFNIJ" znaczy
 * „to nie był start", a warunek, który detekcję wywołał, zwykle jeszcze się trzyma -
 * wyzerowana histereza wystawiłaby ten sam toast na następnym fixie.
 */
export function syncDetectorPhase(state: DetectorState, inFlight: boolean): DetectorState {
  const phase: DetectorPhase = inFlight ? 'airborne' : 'ground';
  if (state.phase === phase) return state;
  return {
    ...state,
    phase,
    // Kandydat zbierał się pod PORZUCONY warunek (np. start, choć jesteśmy już w locie).
    candidateSince: null,
    // Kołowanie należy do fazy naziemnej; po powrocie na ziemię zaczyna się od nowa,
    // a duplikat wobec rejestru odsieje spoina (`ui/hooks/taxiWrite.ts`).
    taxiing: false,
  };
}

/** Wysokość nad lotniskiem; null gdy brakuje którejkolwiek składowej. */
function heightAboveField(fix: GpsFix, state: DetectorState): number | null {
  if (fix.altitudeFt == null || state.fieldElevationFt == null) return null;
  return fix.altitudeFt - state.fieldElevationFt;
}

/**
 * Warunek startu: rozpędzony i NIEHAMUJĄCY, albo wzniesiony ponad lotnisko.
 *
 * Weto na hamowanie zamyka dziurę dobiegu: po lądowaniu faza wraca na `ground`,
 * histereza trwa 30 s, a hamowanie z prędkości przyziemienia do kołowania bywa dłuższe -
 * samolot przechodził wtedy przez próg startu Z GÓRY i wyglądał jak rozbieg. Dlaczego
 * weto, a nie wymóg przyspieszania: `TAKEOFF_MAX_DECEL_KT_PER_SEC`.
 */
function takeoffConditionMet(fix: GpsFix, state: DetectorState, t: GpsThresholds): boolean {
  const speed = groundSpeed(fixesInWindow(state.history, t.SPEED_WINDOW_SEC));
  if (speed != null && speed.kt > t.TAKEOFF_SPEED_KT) {
    const accel = speedTrendKtPerSec(fixesInWindow(state.history, t.TREND_WINDOW_SEC));
    if (accel == null || accel >= -t.TAKEOFF_MAX_DECEL_KT_PER_SEC) return true;
  }

  const agl = heightAboveField(fix, state);
  return agl != null && agl > t.TAKEOFF_ALT_DIFF_FT;
}

/**
 * Warunek lądowania: wolno ORAZ nisko ORAZ bez zakrętu (ORAZ przy polu, gdy operacja
 * jednolotniskowa).
 *
 * Gdy wysokości brak, świadomie **nie wykrywamy** lądowania - sam niski GS to za mało,
 * a zmyślona detekcja kosztuje więcej niż jej brak: pilot ma ekran wpisu ręcznego (05f)
 * i toast korekty. Milczenie jest tu bezpieczniejsze od zgadywania. (Tę lukę domknie
 * dopiero niezależny tor pionowy z barometru, po kalibracji w fazie 5.)
 *
 * Weto prędkości kątowej i geofence odcinają wyłącznie pomiar POZYTYWNIE przeczący -
 * brak kursu albo brak pozycji niczego nie blokuje.
 */
function landingConditionMet(fix: GpsFix, state: DetectorState, t: GpsThresholds): boolean {
  const speed = groundSpeed(fixesInWindow(state.history, t.SPEED_WINDOW_SEC));
  if (speed == null || speed.kt >= t.LANDING_SPEED_KT) return false;

  const agl = heightAboveField(fix, state);
  if (agl == null || agl >= t.LANDING_ALT_DIFF_FT) return false;

  const turn = turnRateDps(fixesInWindow(state.history, t.TREND_WINDOW_SEC));
  if (turn != null && turn > t.LANDING_TURN_RATE_VETO_DPS) return false;

  if (state.sameFieldOnly && state.fieldPosition != null) {
    const here = fixPosition(fix);
    if (here != null && distanceNm(here, state.fieldPosition) > t.LANDING_FIELD_VICINITY_NM) {
      return false;
    }
  }
  return true;
}

/** Onset nigdy nie może być z przyszłości; brak onsetu = zostajemy przy czasie fixa. */
function resolveOnset(onset: EpochMillis | null, fallback: EpochMillis): EpochMillis {
  if (onset == null || onset > fallback) return fallback;
  return onset;
}

/**
 * Przetwarza jeden fix. Funkcja czysta: ten sam stan + ten sam fix = ten sam wynik.
 *
 * Kolejność decyzji ma znaczenie:
 *   1. fix z przeszłości → ignorujemy (zegar potrafi skoczyć wstecz);
 *   2. bramka jakości i plauzybilności → śmieć liczy się jak brak fixa;
 *   3. przerwa w sygnale → zerujemy kandydatów (patrz `MAX_FIX_GAP_SEC`);
 *   4. cooldown → tylko odnotowujemy fix, żadnych zmian fazy;
 *   5. warunek fazy → utrzymanie przez wymagany czas → detekcja + retro-datowanie;
 *   6. dopiero gdy fazy nie zmieniono - kołowanie.
 */
export function stepDetector(
  state: DetectorState,
  fix: GpsFix,
  thresholds: GpsThresholds = GPS_THRESHOLDS,
): DetectorStep {
  // 1. Fix starszy niż ostatnio przetworzony - poza kolejnością, pomijamy.
  if (state.lastFixAt != null && fix.time < state.lastFixAt) {
    return { state, detection: null, detectedAt: null };
  }

  // 2. Bramka jakości: śmieciowy fix (dokładność, absurdalna prędkość) = brak fixa.
  //    Kandydatów zerujemy - nie wiemy, co działo się „pod" śmieciem; `lastFixAt`
  //    zostaje przy ostatnim DOBRYM fixie, więc ciągłość policzy `MAX_FIX_GAP_SEC`.
  //    Do historii też go NIE wpuszczamy: cechy trendowe liczone ze śmiecia byłyby
  //    śmieciem o wiarygodnym wyglądzie.
  if (!fixUsable(fix, thresholds)) {
    return {
      state: { ...state, candidateSince: null },
      detection: null,
      detectedAt: null,
    };
  }

  // 2a. Plauzybilność skoku: pozycja przeskoczyła szybciej, niż samolot umie lecieć
  //     (spoofing/multipath „teleportuje" odbiornik przy niewinnie wyglądającym GS).
  const here = fixPosition(fix);
  if (state.lastPosition != null && state.lastFixAt != null && here != null) {
    const dtH = (fix.time - state.lastFixAt) / 3_600_000;
    if (dtH > 0) {
      const impliedKt = distanceNm(state.lastPosition, here) / dtH;
      if (impliedKt > thresholds.MAX_PLAUSIBLE_SPEED_KT) {
        return {
          state: { ...state, candidateSince: null },
          detection: null,
          detectedAt: null,
        };
      }
    }
  }

  const gapSec = state.lastFixAt == null ? 0 : (fix.time - state.lastFixAt) / 1000;
  const signalBroken = gapSec > MAX_FIX_GAP_SEC;

  const history = pushFix(state.history, fix);

  const next: DetectorState = {
    ...state,
    history,
    lastFixAt: fix.time,
    lastPosition: here ?? state.lastPosition,
    candidateSince: signalBroken ? null : state.candidateSince,
  };
  next.motion = stepMotion(state.motion, history, signalBroken, thresholds);

  // Pozycja pola: kotwica PIERWSZEGO postoju (analogicznie do elewacji §3.3).
  // Tylko przed pierwszym startem - po lądowaniu pole już znamy.
  next.fieldPosition =
    state.fieldPosition ??
    (next.phase === 'ground' && !next.motion.moving ? next.motion.anchor : null);

  // Elewacja pola: DOBIERANA z pierwszego fixa na postoju, gdy przy ENGINE START nie było
  // jej z czego wziąć (§2.1). Bez tego jeden brakujący fix - silnik odpalony w hangarze,
  // odbiornik jeszcze bez wysokości - wyłączał gałąź wysokościową na CAŁY lot, a wraz z nią
  // lądowanie, które bez AGL świadomie milczy (§8.2).
  //
  // Warunek jest MOCNIEJSZY niż „faza ground i nie w ruchu" i to jest jego sedno. `moving`
  // wymaga potwierdzenia przez `TAXI_CONFIRM_SEC`, więc na pierwszym fixie jest fałszywe
  // niezależnie od tego, co samolot naprawdę robi - sama ta para wzięłaby za „elewację
  // lotniska" wysokość przelotową odbiornika ożywionego w powietrzu, a stąd AGL ≈ 0
  // i natychmiastowe fałszywe lądowanie. Dlatego żądamy ZMIERZONEGO postoju: prędkość musi
  // być znana i niższa od progu „stoi".
  //
  // Wartość ZOSTAJE Z GPS, nie z katalogu lotnisk: wysokość fixa i elewacja pola muszą
  // pochodzić z tego samego układu odniesienia, bo w `heightAboveField()` się odejmują
  // i wspólny błąd odbiornika się skraca. Elewacja z mapy (AMSL) przy wysokości znad
  // elipsoidy WGS84 wniosłaby stały błąd rzędu 100 ft - więcej niż każdy próg wysokościowy
  // w tym pliku (uzasadnienie: issue #5).
  const standstillSpeed = groundSpeed(fixesInWindow(history, thresholds.SPEED_WINDOW_SEC));
  const standingStill =
    next.phase === 'ground' &&
    !next.motion.moving &&
    standstillSpeed != null &&
    standstillSpeed.kt < thresholds.TAXI_SPEED_KT;

  next.fieldElevationFt = state.fieldElevationFt ?? (standingStill ? fix.altitudeFt : null);

  // 4. Histereza po poprzedniej detekcji - dotyczy WYŁĄCZNIE zmian fazy.
  //
  //    Kołowanie fazy nie zmienia, więc histereza go nie blokuje: gdyby blokowała, wpis
  //    po lądowaniu spóźniałby się o pół minuty, a w mockupie 05 kołowanie zaczyna się
  //    dokładnie wtedy, gdy samolot zjeżdża z pasa („14:08 Landing", „14:08 Taxi").
  const inCooldown = next.cooldownUntil != null && fix.time < next.cooldownUntil;

  const conditionMet =
    !inCooldown &&
    (next.phase === 'ground'
      ? takeoffConditionMet(fix, next, thresholds)
      : landingConditionMet(fix, next, thresholds));

  if (conditionMet) {
    const since = next.candidateSince ?? fix.time;
    const heldSec = (fix.time - since) / 1000;
    const requiredSec =
      next.phase === 'ground' ? thresholds.TAKEOFF_CONFIRM_SEC : thresholds.LANDING_CONFIRM_SEC;

    if (heldSec < requiredSec) {
      return {
        state: { ...next, candidateSince: since },
        detection: null,
        detectedAt: null,
      };
    }
  } else {
    next.candidateSince = null;

    // 6. Kołowanie rozpatrujemy DOPIERO, gdy w tym kroku nie zaszła zmiana fazy.
    //
    //    Kolejność ma znaczenie: gdyby kołowanie było sprawdzane pierwsze, jego wykrycie
    //    kończyłoby krok i „zjadało" tick, w którym potwierdzał się start - start
    //    przesuwałby się o jeden fix. Poza tym wpis „ruszył kołować" w tej samej chwili,
    //    w której samolot się oderwał, byłby bez sensu.
    if (next.phase === 'ground' && !next.taxiing && next.motion.moving) {
      return {
        state: { ...next, taxiing: true },
        detection: 'taxi',
        detectedAt: resolveOnset(
          taxiOnset(history, next.motion.anchor, thresholds.TAXI_ANCHOR_RADIUS_M),
          fix.time,
        ),
      };
    }

    return { state: next, detection: null, detectedAt: null };
  }

  // 5. Detekcja: zmiana fazy + histereza + retro-datowanie.
  const detection: Detection = next.phase === 'ground' ? 'takeoff' : 'landing';
  const cooldownSec =
    detection === 'takeoff'
      ? thresholds.COOLDOWN_AFTER_TAKEOFF_SEC
      : thresholds.COOLDOWN_AFTER_LANDING_SEC;

  const detectedAt = resolveOnset(
    detection === 'takeoff'
      ? liftoffOnset(history, next.fieldElevationFt, thresholds.GROUND_CONTACT_AGL_FT)
      : touchdownOnset(history, next.fieldElevationFt, thresholds.GROUND_CONTACT_AGL_FT),
    fix.time,
  );

  return {
    state: {
      ...next,
      phase: detection === 'takeoff' ? 'airborne' : 'ground',
      // Start zamyka kołowanie tego lotu; lądowanie otwiera drogę do kolejnego -
      // samolot zjeżdża z pasa i kołuje z powrotem, co jest nowym wpisem.
      taxiing: false,
      candidateSince: null,
      cooldownUntil: fix.time + cooldownSec * 1000,
      // Po starcie kotwica nie ma sensu (samolot jest w powietrzu). Po lądowaniu
      // ustawiamy ją na PUNKT PRZYZIEMIENIA: dobieg oddali się od niej w sekundę,
      // więc kołowanie po lądowaniu dostanie moment tuż po kołach na pasie - dokładnie
      // tak, jak pokazuje log w mockupie 05. Gdyby kotwica liczyła się wtedy od nowa
      // z okna, jej centroid siedziałby gdzieś na prostej do lądowania.
      motion: {
        anchor: detection === 'landing' ? (here ?? next.lastPosition) : null,
        moving: true,
        moveCandidateSince: null,
        speedCandidateSince: null,
      },
    },
    detection,
    detectedAt,
  };
}

/**
 * Przetwarza serię fixów (wygodne w testach i przy odtwarzaniu zapisu z lotu).
 *
 * `at` to czas RETRO-DATOWANY (kiedy się wydarzyło), `confirmedAt` - czas fixa, który
 * detekcję potwierdził (kiedy się o tym dowiedzieliśmy). Różnica między nimi to opóźnienie
 * algorytmu i przy kalibracji jest osobno interesująca.
 */
export function runDetector(
  state: DetectorState,
  fixes: readonly GpsFix[],
  thresholds: GpsThresholds = GPS_THRESHOLDS,
): {
  state: DetectorState;
  detections: { at: EpochMillis; confirmedAt: EpochMillis; detection: Detection }[];
} {
  let current = state;
  const detections: { at: EpochMillis; confirmedAt: EpochMillis; detection: Detection }[] = [];

  for (const fix of fixes) {
    const step = stepDetector(current, fix, thresholds);
    current = step.state;
    if (step.detection) {
      detections.push({
        at: step.detectedAt ?? fix.time,
        confirmedAt: fix.time,
        detection: step.detection,
      });
    }
  }

  return { state: current, detections };
}
