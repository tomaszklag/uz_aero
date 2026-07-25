/**
 * UZ Aero — testy automatu detekcji startu i lądowania (§3.3).
 *
 * Sens tych testów: consumer-grade GPS kłamie. Dokumentacja (§8) klasyfikuje fałszywe
 * detekcje jako ryzyko 🔴, a scenariusze, które je wywołują — ciasny zakręt, turbulencje,
 * utrata sygnału — w powietrzu trafiają się rzadko i nie da się ich wyklikać na biurku.
 * Tutaj odtwarzamy je deterministycznie.
 */

import {
  createDetectorState,
  runDetector,
  stepDetector,
  MAX_FIX_GAP_SEC,
  type GpsFix,
} from '../domain/detection/flightDetector';
import { GPS_THRESHOLDS as T } from '../domain/detection/thresholds';

const FIELD_ELEV = 800; // elewacja lotniska (ft) — z fixa przy ENGINE START
const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);

/** Sekunda scenariusza → epoch ms. */
const t = (sec: number) => T0 + sec * 1000;

/** Seria fixów co sekundę, od `fromSec`, o zadanych parametrach. */
function series(
  fromSec: number,
  count: number,
  groundSpeedKt: number,
  altitudeFt: number | null,
): GpsFix[] {
  return Array.from({ length: count }, (_, i) => ({
    time: t(fromSec + i),
    groundSpeedKt,
    altitudeFt,
  }));
}

const onGround = () => createDetectorState(FIELD_ELEV);
const airborne = () => ({ ...createDetectorState(FIELD_ELEV), phase: 'airborne' as const });

describe('detekcja startu', () => {
  it('rozbieg powyżej progu, utrzymany wymagany czas → takeoff', () => {
    // GS 60 kt (> 50) przez 5 s — warunek prędkościowy z zapasem ponad 3 s potwierdzenia.
    const { detections, state } = runDetector(onGround(), series(0, 5, 60, FIELD_ELEV));

    expect(detections).toHaveLength(1);
    expect(detections[0].detection).toBe('takeoff');
    expect(state.phase).toBe('airborne');
  });

  it('detekcja pada dopiero po upływie czasu potwierdzenia, nie przy pierwszym fixie', () => {
    const { detections } = runDetector(onGround(), series(0, 10, 60, FIELD_ELEV));

    // Warunek trzyma się od t=0; potwierdzenie po TAKEOFF_CONFIRM_SEC.
    expect(detections[0].at).toBe(t(T.TAKEOFF_CONFIRM_SEC));
  });

  it('krótka szpilka prędkości (poniżej czasu potwierdzenia) NIE wywołuje startu', () => {
    // 2 s szybko, potem znów wolno — typowy artefakt słabego fixa na płycie.
    const fixes = [
      ...series(0, 2, 60, FIELD_ELEV),
      ...series(2, 5, 5, FIELD_ELEV),
    ];
    const { detections, state } = runDetector(onGround(), fixes);

    expect(detections).toHaveLength(0);
    expect(state.phase).toBe('ground');
  });

  it('sam przyrost wysokości też wystarcza (warunek alternatywny), gdy GS kłamie', () => {
    // GS 10 kt (nierealnie mało jak na lot), ale 300 ft nad lotniskiem.
    const { detections } = runDetector(onGround(), series(0, 6, 10, FIELD_ELEV + 300));

    expect(detections).toHaveLength(1);
    expect(detections[0].detection).toBe('takeoff');
  });

  it('turbulencja przy ziemi (±30 ft) nie przekracza progu wysokości → brak startu', () => {
    // Skoki wysokości mniejsze niż TAKEOFF_ALT_DIFF_FT (50 ft), GS postojowy.
    const fixes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      time: t(i),
      groundSpeedKt: 3,
      altitudeFt: FIELD_ELEV + (i % 2 === 0 ? 30 : -30),
    }));
    const { detections } = runDetector(onGround(), fixes);

    expect(detections).toHaveLength(0);
  });
});

describe('detekcja lądowania', () => {
  it('wolno i nisko przez wymagany czas → landing', () => {
    const { detections, state } = runDetector(airborne(), series(0, 8, 20, FIELD_ELEV + 10));

    expect(detections).toHaveLength(1);
    expect(detections[0].detection).toBe('landing');
    expect(state.phase).toBe('ground');
  });

  it('CIASNY ZAKRĘT: GS spada do zera, ale samolot jest wysoko → BRAK lądowania', () => {
    // Sedno ryzyka z §8: sam spadek GS to codzienność manewru, nie lądowanie.
    const { detections, state } = runDetector(
      airborne(),
      series(0, 10, 0, FIELD_ELEV + 2500),
    );

    expect(detections).toHaveLength(0);
    expect(state.phase).toBe('airborne');
  });

  it('nisko, ale szybko (przelot nad pasem) → BRAK lądowania', () => {
    const { detections } = runDetector(airborne(), series(0, 10, 90, FIELD_ELEV + 20));

    expect(detections).toHaveLength(0);
  });

  it('bez wysokości w fixie NIE zgadujemy lądowania (milczenie zamiast fałszywki)', () => {
    // Sam niski GS bez wysokości — świadomie nie wykrywamy; pilot ma wpis ręczny (05f).
    const { detections, state } = runDetector(airborne(), series(0, 12, 5, null));

    expect(detections).toHaveLength(0);
    expect(state.phase).toBe('airborne');
  });

  it('krótkie zwolnienie w locie (poniżej czasu potwierdzenia) nie kończy lotu', () => {
    const fixes = [
      ...series(0, 3, 20, FIELD_ELEV + 10), // 3 s < LANDING_CONFIRM_SEC (5 s)
      ...series(3, 5, 90, FIELD_ELEV + 500),
    ];
    const { detections } = runDetector(airborne(), fixes);

    expect(detections).toHaveLength(0);
  });
});

describe('histereza (cooldown)', () => {
  it('po starcie ignoruje kolejne detekcje przez czas histerezy', () => {
    // Start, a zaraz po nim warunki „lądowania" — bez histerezy powstałby lot 0-sekundowy.
    const fixes = [
      ...series(0, 5, 60, FIELD_ELEV), // takeoff ~t=3
      ...series(5, 20, 0, FIELD_ELEV), // wolno i nisko, ale w oknie histerezy
    ];
    const { detections } = runDetector(onGround(), fixes);

    expect(detections.map((d) => d.detection)).toEqual(['takeoff']);
  });

  it('po wygaśnięciu histerezy detekcja znów działa', () => {
    const cd = T.COOLDOWN_AFTER_TAKEOFF_SEC;
    const fixes = [
      ...series(0, 5, 60, FIELD_ELEV), // takeoff ~t=3
      ...series(cd + 10, 8, 15, FIELD_ELEV + 5), // po histerezie: wolno i nisko
    ];
    const { detections } = runDetector(onGround(), fixes);

    expect(detections.map((d) => d.detection)).toEqual(['takeoff', 'landing']);
  });
});

describe('odporność na sygnał', () => {
  it('przerwa w sygnale zeruje licznik utrzymania (brak detekcji „z rozpędu")', () => {
    // Warunek spełniony przez 2 s, potem GPS milczy dłużej niż próg, wraca spełniony.
    // Bez zerowania kandydata detekcja odpaliłaby natychmiast po powrocie sygnału.
    const fixes: GpsFix[] = [
      ...series(0, 2, 60, FIELD_ELEV),
      { time: t(2 + MAX_FIX_GAP_SEC + 5), groundSpeedKt: 60, altitudeFt: FIELD_ELEV },
    ];
    const { detections } = runDetector(onGround(), fixes);

    expect(detections).toHaveLength(0);
  });

  it('fix z przeszłości (skok zegara wstecz) jest ignorowany', () => {
    const s0 = onGround();
    const s1 = stepDetector(s0, { time: t(10), groundSpeedKt: 60, altitudeFt: FIELD_ELEV });
    const s2 = stepDetector(s1.state, { time: t(4), groundSpeedKt: 60, altitudeFt: FIELD_ELEV });

    expect(s2.detection).toBeNull();
    expect(s2.state.lastFixAt).toBe(t(10)); // stan nietknięty
  });

  it('brak elewacji lotniska: start wykrywany po GS, lądowanie wcale', () => {
    const noElev = createDetectorState(null);

    const up = runDetector(noElev, series(0, 5, 60, 1200));
    expect(up.detections.map((d) => d.detection)).toEqual(['takeoff']);

    const down = runDetector(up.state, series(100, 12, 5, 810));
    expect(down.detections).toHaveLength(0);
  });
});

describe('pełny cykl lotu', () => {
  it('kołowanie → start → przelot → podejście → lądowanie daje dokładnie 2 detekcje', () => {
    const cd = T.COOLDOWN_AFTER_TAKEOFF_SEC;
    const fixes: GpsFix[] = [
      ...series(0, 10, 8, FIELD_ELEV), // kołowanie
      ...series(10, 8, 65, FIELD_ELEV + 20), // rozbieg → takeoff
      ...series(20, 40, 110, FIELD_ELEV + 3000), // przelot
      ...series(60 + cd, 10, 70, FIELD_ELEV + 400), // podejście
      ...series(75 + cd, 10, 18, FIELD_ELEV + 8), // dobieg → landing
    ];
    const { detections, state } = runDetector(onGround(), fixes);

    expect(detections.map((d) => d.detection)).toEqual(['takeoff', 'landing']);
    expect(state.phase).toBe('ground');
  });
});
