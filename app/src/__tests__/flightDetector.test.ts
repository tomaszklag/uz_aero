/**
 * UZ Aero - testy automatu detekcji startu i lądowania (§3.3).
 *
 * Sens tych testów: consumer-grade GPS kłamie. Dokumentacja (§8) klasyfikuje fałszywe
 * detekcje jako ryzyko 🔴, a scenariusze, które je wywołują - ciasny zakręt, turbulencje,
 * utrata sygnału, static-hold odbiornika - w powietrzu trafiają się rzadko i nie da się
 * ich wyklikać na biurku. Tutaj odtwarzamy je deterministycznie.
 *
 * Po przebudowie 2026-07-30 doszła druga rodzina asercji, równie ważna jak „czy wykryto":
 * **KIEDY wykryto**. Detekcja zwraca teraz `at` (moment retro-datowany, odnaleziony wstecz
 * w buforze) obok `confirmedAt` (fix, który warunek potwierdził). Do dokumentów idzie `at`,
 * więc różnica między nimi jest przedmiotem testu, a nie szczegółem implementacji.
 */

import {
  createDetectorState,
  distanceNm,
  fixUsable,
  runDetector,
  stepDetector,
  syncDetectorPhase,
  MAX_FIX_GAP_SEC,
  type GpsFix,
} from '../domain';
import { GPS_THRESHOLDS as T } from '../domain';

const FIELD_ELEV = 800; // elewacja lotniska (ft) - z fixa przy ENGINE START
const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);

/** Sekunda scenariusza → epoch ms. */
const t = (sec: number) => T0 + sec * 1000;

/** Pozycja EPKK-okolice; przesunięcie o ~1 NM na północ to +1/60 stopnia szerokości. */
const FIELD = { lat: 50.078, lon: 19.785 };
const nmNorth = (nm: number) => ({ lat: FIELD.lat + nm / 60, lon: FIELD.lon });
const mNorth = (m: number) => nmNorth(m / 1852);

/** Seria fixów co sekundę, BEZ pozycji - tor prędkościowy w izolacji. */
function series(
  fromSec: number,
  count: number,
  groundSpeedKt: number | null,
  altitudeFt: number | null,
): GpsFix[] {
  return Array.from({ length: count }, (_, i) => ({
    time: t(fromSec + i),
    groundSpeedKt,
    altitudeFt,
  }));
}

/**
 * Seria fixów z POZYCJĄ przesuwającą się na północ z zadaną prędkością.
 * `doppler: false` odtwarza odbiornik, który prędkości nie podaje (albo podaje zero
 * mimo ruchu) - czyli dokładnie sytuację, w której stary algorytm był ślepy.
 */
function rolling(
  fromSec: number,
  count: number,
  kt: number,
  altitudeFt: number | null,
  opts: { doppler?: number | null; startM?: number } = {},
): GpsFix[] {
  const mPerSec = (kt * 1852) / 3600;
  const startM = opts.startM ?? 0;
  const doppler = 'doppler' in opts ? opts.doppler! : kt;
  return Array.from({ length: count }, (_, i) => ({
    time: t(fromSec + i),
    groundSpeedKt: doppler,
    altitudeFt,
    ...mNorth(startM + mPerSec * i),
  }));
}

/** Samolot na stanowisku: pozycja „pływa" w promieniu kilku metrów, jak realny odbiornik. */
function parked(
  fromSec: number,
  count: number,
  opts: { doppler?: number | null; driftM?: number } = {},
): GpsFix[] {
  const drift = opts.driftM ?? 4;
  return Array.from({ length: count }, (_, i) => ({
    time: t(fromSec + i),
    groundSpeedKt: 'doppler' in opts ? opts.doppler! : 0,
    altitudeFt: FIELD_ELEV,
    // Deterministyczny „szum" - sinus zamiast losowości, żeby test był powtarzalny.
    ...mNorth(drift * Math.sin(i * 1.7)),
  }));
}

const onGround = () => createDetectorState(FIELD_ELEV);
const airborne = () => ({ ...createDetectorState(FIELD_ELEV), phase: 'airborne' as const });

describe('detekcja startu', () => {
  it('rozbieg powyżej progu, utrzymany wymagany czas → takeoff', () => {
    const { detections, state } = runDetector(onGround(), series(0, 8, 60, FIELD_ELEV));

    // Seria zaczyna się od razu powyżej progu startu, więc automat nigdy nie widzi
    // samolotu „ruszającego" - kołowanie ma własny zestaw testów niżej.
    expect(detections.map((d) => d.detection)).toEqual(['takeoff']);
    expect(state.phase).toBe('airborne');
  });

  it('detekcja pada dopiero po upływie czasu potwierdzenia, nie przy pierwszym fixie', () => {
    const { detections } = runDetector(onGround(), series(0, 12, 60, FIELD_ELEV));

    const takeoff = detections.find((d) => d.detection === 'takeoff');
    expect(takeoff?.confirmedAt).toBe(t(T.TAKEOFF_CONFIRM_SEC));
  });

  it('krótka szpilka prędkości (poniżej czasu potwierdzenia) NIE wywołuje startu', () => {
    // 2 s szybko, potem znów wolno - typowy artefakt słabego fixa na płycie.
    const fixes = [...series(0, 2, 60, FIELD_ELEV), ...series(2, 8, 5, FIELD_ELEV)];
    const { detections, state } = runDetector(onGround(), fixes);

    // Szpilka nie daje STARTU. Kołowanie owszem - samolot naprawdę ruszył i to jest
    // osobna, tańsza informacja: fałszywy wpis kołowania dodaje wiersz w logu,
    // fałszywy start psułby czas lotu.
    expect(detections.map((d) => d.detection)).toEqual(['taxi']);
    expect(state.phase).toBe('ground');
  });

  it('sam przyrost wysokości też wystarcza (warunek alternatywny), gdy GS kłamie', () => {
    // GS 10 kt (nierealnie mało jak na lot), ale 300 ft nad lotniskiem.
    const { detections } = runDetector(onGround(), series(0, 8, 10, FIELD_ELEV + 300));

    expect(detections.map((d) => d.detection)).toEqual(['takeoff']);
  });

  it('turbulencja przy ziemi (±30 ft) nie przekracza progu wysokości → brak startu', () => {
    // Skoki wysokości mniejsze niż TAKEOFF_ALT_DIFF_FT (50 ft), GS postojowy.
    const fixes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      time: t(i),
      groundSpeedKt: 3,
      altitudeFt: FIELD_ELEV + (i % 2 === 0 ? 30 : -30),
    }));

    expect(runDetector(onGround(), fixes).detections).toHaveLength(0);
  });
});

/**
 * WETO HAMOWANIA - zamyka dziurę, przez którą dobieg po lądowaniu potrafił zostać
 * uznany za rozbieg. Samolot przechodzi wtedy przez próg startu Z GÓRY, przy wygasającej
 * histerezie, i po samej prędkości wygląda identycznie jak start.
 */
describe('rozbieg kontra dobieg (weto hamowania)', () => {
  /** Prędkość zmienia się liniowo od `fromKt` do `toKt` przez `count` sekund. */
  const ramp = (fromSec: number, count: number, fromKt: number, toKt: number): GpsFix[] =>
    Array.from({ length: count }, (_, i) => ({
      time: t(fromSec + i),
      groundSpeedKt: fromKt + ((toKt - fromKt) * i) / (count - 1),
      altitudeFt: FIELD_ELEV,
    }));

  it('HAMOWANIE przez próg startu (dobieg 70 → 20 kt) NIE daje startu', () => {
    const { detections, state } = runDetector(onGround(), ramp(0, 26, 70, 20));

    expect(detections.map((d) => d.detection)).not.toContain('takeoff');
    expect(state.phase).toBe('ground');
  });

  it('PRZYSPIESZANIE przez ten sam próg (rozbieg 20 → 70 kt) daje start', () => {
    const { detections, state } = runDetector(onGround(), ramp(0, 30, 20, 70));

    expect(detections.map((d) => d.detection)).toContain('takeoff');
    expect(state.phase).toBe('airborne');
  });
});

describe('detekcja lądowania', () => {
  it('wolno i nisko przez wymagany czas → landing (i zaraz kołowanie, jak w mockupie 05)', () => {
    const { detections, state } = runDetector(airborne(), series(0, 12, 20, FIELD_ELEV + 10));

    // Para „landing → taxi" jest zamierzona: po przyziemieniu samolot toczy się po pasie,
    // a log w mockupie 05 pokazuje oba wpisy obok siebie („14:08 Landing", „14:08 Taxi").
    expect(detections.map((d) => d.detection)).toEqual(['landing', 'taxi']);
    expect(state.phase).toBe('ground');
  });

  it('CIASNY ZAKRĘT: GS spada do zera, ale samolot jest wysoko → BRAK lądowania', () => {
    // Sedno ryzyka z §8: sam spadek GS to codzienność manewru, nie lądowanie.
    const { detections, state } = runDetector(airborne(), series(0, 14, 0, FIELD_ELEV + 2500));

    expect(detections).toHaveLength(0);
    expect(state.phase).toBe('airborne');
  });

  it('nisko, ale szybko (przelot nad pasem) → BRAK lądowania', () => {
    const { detections } = runDetector(airborne(), series(0, 14, 90, FIELD_ELEV + 20));

    expect(detections).toHaveLength(0);
  });

  it('bez wysokości w fixie NIE zgadujemy lądowania (milczenie zamiast fałszywki)', () => {
    // Sam niski GS bez wysokości - świadomie nie wykrywamy; pilot ma wpis ręczny (05f).
    const { detections, state } = runDetector(airborne(), series(0, 16, 5, null));

    expect(detections).toHaveLength(0);
    expect(state.phase).toBe('airborne');
  });

  it('krótkie zwolnienie w locie (poniżej czasu potwierdzenia) nie kończy lotu', () => {
    const fixes = [
      ...series(0, 4, 20, FIELD_ELEV + 10), // krócej niż LANDING_CONFIRM_SEC
      ...series(4, 8, 90, FIELD_ELEV + 500),
    ];

    expect(runDetector(airborne(), fixes).detections).toHaveLength(0);
  });

  it('WETO ZAKRĘTU: wolno i nisko, ale kurs obraca się 5 °/s → to manewr, nie przyziemienie', () => {
    // Druga, niezależna obrona przed ryzykiem 🔴 z §8 - i to za darmo, bo kurs nad
    // ziemią jest w każdym odczycie lokalizacji. Przyziemienie ma kurs stabilny.
    const turning = series(0, 16, 20, FIELD_ELEV + 10).map((f, i) => ({
      ...f,
      trackDeg: (i * 5) % 360,
    }));

    expect(runDetector(airborne(), turning).detections).toHaveLength(0);
  });

  it('te same warunki z kursem STABILNYM → landing (weto tnie zakręt, nie lądowanie)', () => {
    const straight = series(0, 16, 20, FIELD_ELEV + 10).map((f) => ({ ...f, trackDeg: 271 }));

    expect(runDetector(airborne(), straight).detections.map((d) => d.detection)).toEqual([
      'landing',
      'taxi',
    ]);
  });
});

/**
 * RETRO-DATOWANIE - najważniejsza rodzina testów po przebudowie.
 *
 * Do dokumentów trafia `at`, nie `confirmedAt`. Wcześniej te dwie wartości były tym
 * samym, przez co KAŻDE zdarzenie było w logu systematycznie spóźnione - a ponieważ
 * w logu stała po prostu jakaś godzina, nikt tego nie widział.
 */
describe('retro-datowanie zdarzeń', () => {
  it('START dostaje moment ODERWANIA, nie moment potwierdzenia warunku', () => {
    const roll: GpsFix[] = [
      ...[20, 30, 40, 50, 60, 70].map((kt, i) => ({
        time: t(i),
        groundSpeedKt: kt,
        altitudeFt: FIELD_ELEV, // AGL 0 - koła na pasie
      })),
      // Oderwanie między t=6 a t=7: wysokość zaczyna rosnąć.
      ...[20, 60, 120, 200, 300, 400, 500, 620].map((agl, i) => ({
        time: t(6 + i),
        groundSpeedKt: 75,
        altitudeFt: FIELD_ELEV + agl,
      })),
    ];
    const { detections } = runDetector(onGround(), roll);
    const takeoff = detections.find((d) => d.detection === 'takeoff')!;

    expect(takeoff).toBeDefined();
    // Ostatni fix przy ziemi (AGL ≤ GROUND_CONTACT_AGL_FT) to t=6.
    expect(takeoff.at).toBe(t(6));
    // …i jest wyraźnie wcześniejszy niż chwila, w której algorytm się o tym dowiedział.
    expect(takeoff.confirmedAt).toBeGreaterThan(takeoff.at);
  });

  it('LĄDOWANIE dostaje moment PRZYZIEMIENIA, nie koniec okna potwierdzenia', () => {
    const approach: GpsFix[] = [
      ...[300, 200, 120, 60, 30].map((agl, i) => ({
        time: t(i),
        groundSpeedKt: 60,
        altitudeFt: FIELD_ELEV + agl,
      })),
      // Przyziemienie w t=5, potem dobieg z hamowaniem.
      ...[45, 40, 35, 30, 25, 20, 16, 13, 11, 9, 8, 7, 6, 6, 6].map((kt, i) => ({
        time: t(5 + i),
        groundSpeedKt: kt,
        altitudeFt: FIELD_ELEV + 5,
      })),
    ];
    const { detections } = runDetector(airborne(), approach);
    const landing = detections.find((d) => d.detection === 'landing')!;

    expect(landing).toBeDefined();
    expect(landing.at).toBe(t(5));
    // Okno potwierdzenia (8 s) plus opóźnienie mediany prędkości - kilkanaście sekund,
    // dokładnie tyle, ile wcześniej lądowanie było spóźnione w dokumentach.
    expect(landing.confirmedAt - landing.at).toBeGreaterThanOrEqual(10_000);
  });

  it('KOŁOWANIE dostaje moment zjazdu ze stanowiska, nie moment przekroczenia progu', () => {
    const fixes = [...parked(0, 20), ...rolling(20, 15, 8, FIELD_ELEV, { startM: 0 })];
    const { detections } = runDetector(onGround(), fixes);
    const taxi = detections.find((d) => d.detection === 'taxi')!;

    expect(taxi).toBeDefined();
    // Samolot ruszył w t=20; retro-datowanie ma trafić w okolicę, a nie w moment
    // potwierdzenia kilka sekund później.
    expect(taxi.at).toBeGreaterThanOrEqual(t(19));
    expect(taxi.at).toBeLessThanOrEqual(t(24));
    expect(taxi.confirmedAt).toBeGreaterThan(taxi.at);
  });
});

/**
 * KOŁOWANIE Z PRZEMIESZCZENIA - sedno naprawy „ciężko wykryć początek taxi".
 *
 * Prędkość chwilowa w tym zakresie jest na granicy czułości dopplera, a odbiornik
 * dodatkowo zeruje ją filtrem static-hold. Przemieszczenie widzi to samo zjawisko
 * z kilkukrotnie lepszym kontrastem.
 */
describe('kołowanie wykrywane z przemieszczenia', () => {
  it('odbiornik NIE PODAJE prędkości, a samolot jedzie → kołowanie mimo to wykryte', () => {
    const fixes = [
      ...parked(0, 20, { doppler: null }),
      ...rolling(20, 15, 8, FIELD_ELEV, { doppler: null }),
    ];
    const { detections } = runDetector(onGround(), fixes);

    expect(detections.map((d) => d.detection)).toEqual(['taxi']);
  });

  it('STATIC-HOLD: odbiornik uparcie melduje 0 kt, choć pozycja jedzie → kołowanie wykryte', () => {
    // Realny tryb porażki układu GNSS w telefonie, nie hipoteza: przy małych
    // prędkościach chip przykleja prędkość do zera, żeby mapa nie „pływała".
    const fixes = [
      ...parked(0, 20, { doppler: 0 }),
      ...rolling(20, 15, 8, FIELD_ELEV, { doppler: 0 }),
    ];
    const { detections } = runDetector(onGround(), fixes);

    expect(detections.map((d) => d.detection)).toEqual(['taxi']);
  });

  it('dryf odbiornika na stanowisku (±4 m przez minutę) NIE wywołuje kołowania', () => {
    // Kontrola czułości: skoro kanał przemieszczeniowy jest tak czuły, musi umieć
    // odróżnić ruch samolotu od pływania pozycji przy zaparkowanym.
    expect(runDetector(onGround(), parked(0, 60, { doppler: null })).detections).toHaveLength(0);
  });
});

/**
 * KANAŁ RUCHU KONTRA NIERUCHOMY TELEFON - zgłoszenie z terenu 2026-08-04: telefon
 * odłożony na stole, pozycja realnie bez zmian, a w logu wylądowało `taxi`.
 *
 * Trzy tryby porażki, każdy z własnym testem: pojedynczy odskok pozycji (multipath)
 * wyzwalał ruch JEDNYM fixem; fix o niepewności większej niż próg ruchu „dowodził"
 * przemieszczenia, którego sam nie umiał zmierzyć; szum dopplera przegłosowywał
 * pozycję mówiącą „stoi przy kotwicy".
 */
describe('kanał ruchu kontra nieruchomy telefon (zgłoszenie 2026-08-04)', () => {
  it('pojedynczy odskok pozycji (35 m przez 2 s, multipath) NIE wywołuje kołowania', () => {
    // Implikowana prędkość odskoku (~68 kt) przechodzi bramkę plauzybilności, więc
    // jedyną obroną jest wymóg UTRZYMANIA warunku - prawdziwe kołowanie się oddala,
    // odbicie wraca do kotwicy po paru sekundach.
    const fixes: GpsFix[] = [
      ...parked(0, 30, { doppler: 0 }),
      { time: t(30), groundSpeedKt: 0, altitudeFt: FIELD_ELEV, ...mNorth(35) },
      { time: t(31), groundSpeedKt: 0, altitudeFt: FIELD_ELEV, ...mNorth(35) },
      ...parked(32, 15, { doppler: 0 }),
    ];

    expect(runDetector(onGround(), fixes).detections).toHaveLength(0);
  });

  it('offset mniejszy niż deklarowana niepewność (30 m przy accuracyM 40) NIE wywołuje kołowania', () => {
    // Odbiornik sam przyznaje, że może mylić się o 40 m - taki fix nie może dowodzić
    // ruchu o 30 m, choćby utrzymywał się dowolnie długo. Bramka jakości go wpuszcza
    // (50 m), więc próg ruchu musi uwzględnić niepewność pomiaru.
    const offset: GpsFix[] = Array.from({ length: 12 }, (_, i) => ({
      time: t(30 + i),
      groundSpeedKt: 0,
      altitudeFt: FIELD_ELEV,
      accuracyM: 40,
      ...mNorth(30),
    }));

    expect(
      runDetector(onGround(), [...parked(0, 30, { doppler: 0 }), ...offset]).detections,
    ).toHaveLength(0);
  });

  it('szum dopplera (6 kt) przy pozycji stojącej przy kotwicy NIE wywołuje kołowania', () => {
    // Kanał wsparcia nie może przegłosować kanału głównego: gdy pozycja jest i mówi
    // „przy kotwicy", doppler decyduje wyłącznie tam, gdzie pozycji brak.
    expect(runDetector(onGround(), parked(0, 30, { doppler: 6 })).detections).toHaveLength(0);
  });

  it('prawdziwe kołowanie z dobrą dokładnością: wykryte, onset wciąż przy zwolnieniu hamulców', () => {
    // Kontrola kosztu odczulenia: potwierdzenie przychodzi później, ale do rejestru
    // idzie moment retro-datowany - czas w logu nie ma prawa się pogorszyć.
    const fixes = [
      ...parked(0, 20).map((f) => ({ ...f, accuracyM: 5 })),
      ...rolling(20, 15, 8, FIELD_ELEV).map((f) => ({ ...f, accuracyM: 5 })),
    ];
    const { detections } = runDetector(onGround(), fixes);

    expect(detections.map((d) => d.detection)).toEqual(['taxi']);
    expect(detections[0]!.at).toBeGreaterThanOrEqual(t(19));
    expect(detections[0]!.at).toBeLessThanOrEqual(t(24));
  });
});

describe('histereza (cooldown)', () => {
  it('po starcie ignoruje kolejne detekcje przez czas histerezy', () => {
    // Start, a zaraz po nim warunki „lądowania" - bez histerezy powstałby lot 0-sekundowy.
    const fixes = [
      ...series(0, 8, 60, FIELD_ELEV),
      ...series(8, 25, 0, FIELD_ELEV), // wolno i nisko, ale w oknie histerezy
    ];

    expect(runDetector(onGround(), fixes).detections.map((d) => d.detection)).toEqual(['takeoff']);
  });

  it('po wygaśnięciu histerezy detekcja znów działa', () => {
    const cd = T.COOLDOWN_AFTER_TAKEOFF_SEC;
    const fixes = [
      ...series(0, 8, 60, FIELD_ELEV),
      ...series(cd + 10, 14, 15, FIELD_ELEV + 5), // po histerezie: wolno i nisko
    ];

    expect(runDetector(onGround(), fixes).detections.map((d) => d.detection)).toEqual([
      'takeoff',
      'landing',
      'taxi',
    ]);
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

    expect(runDetector(onGround(), fixes).detections).toHaveLength(0);
  });

  it('fix z przeszłości (skok zegara wstecz) jest ignorowany', () => {
    const s1 = stepDetector(onGround(), {
      time: t(10),
      groundSpeedKt: 60,
      altitudeFt: FIELD_ELEV,
    });
    const s2 = stepDetector(s1.state, { time: t(4), groundSpeedKt: 60, altitudeFt: FIELD_ELEV });

    expect(s2.detection).toBeNull();
    expect(s2.state.lastFixAt).toBe(t(10)); // stan nietknięty
    expect(s2.state.history.fixes).toHaveLength(1); // do bufora też nie wszedł
  });

  it('brak elewacji i brak postoju: start wykrywany po GS, lądowanie wcale', () => {
    // Automat od pierwszego fixa widzi rozpędzony samolot, więc nie ma postoju, z którego
    // dałoby się dobrać elewację - i wtedy nadal świadomie milczy przy lądowaniu.
    const noElev = createDetectorState(null);

    const up = runDetector(noElev, series(0, 8, 60, 1200));
    expect(up.detections.map((d) => d.detection)).toEqual(['takeoff']);
    expect(up.state.fieldElevationFt).toBeNull();

    const down = runDetector(up.state, series(100, 16, 5, 810));
    expect(down.detections).toHaveLength(0);
  });

  it('brak elewacji przy ENGINE START: dobiera ją z pierwszego fixa na postoju', () => {
    // Silnik odpalony w hangarze albo przy zimnym odbiorniku - wysokości w tej chwili nie
    // ma. Do issue #5 zostawało to `null` na CAŁY lot i wyłączało lądowanie.
    const noElev = createDetectorState(null);

    const { state } = runDetector(noElev, parked(0, 6));

    expect(state.fieldElevationFt).toBe(FIELD_ELEV);
  });

  it('dobrana elewacja przywraca wykrywanie lądowania', () => {
    // Sedno poprawki: bez tego cały lot kończył się bez wpisu LDG, a pilot musiał go
    // dopisywać ręcznie (05f).
    const parkedFirst = runDetector(createDetectorState(null), parked(0, 6));
    const up = runDetector(parkedFirst.state, rolling(10, 10, 60, FIELD_ELEV + 20));
    expect(up.state.phase).toBe('airborne');

    const down = runDetector(up.state, rolling(200, 20, 20, FIELD_ELEV + 10, { doppler: 20 }));

    expect(down.detections.map((d) => d.detection)).toContain('landing');
  });

  it('nie bierze elewacji z powietrza, gdy samolot jest w ruchu', () => {
    // Gdyby wystarczyła sama faza `ground`, automat ze spóźnionym startem zapisałby jako
    // „elewację lotniska" wysokość przelotową - a stąd AGL ≈ 0 i fałszywe lądowanie.
    const noElev = createDetectorState(null);

    const { state } = runDetector(noElev, rolling(0, 8, 90, 4000));

    expect(state.fieldElevationFt).toBeNull();
  });
});

describe('pełny cykl lotu', () => {
  it('kołowanie → start → przelot → podejście → lądowanie → kołowanie z powrotem', () => {
    const cd = T.COOLDOWN_AFTER_TAKEOFF_SEC;
    const fixes: GpsFix[] = [
      ...series(0, 10, 8, FIELD_ELEV), // kołowanie
      ...series(10, 12, 65, FIELD_ELEV + 20), // rozbieg → takeoff
      ...series(24, 40, 110, FIELD_ELEV + 3000), // przelot
      ...series(70 + cd, 10, 70, FIELD_ELEV + 400), // podejście
      ...series(85 + cd, 20, 18, FIELD_ELEV + 8), // przyziemienie i dobieg → landing
      ...series(110 + cd, 10, 12, FIELD_ELEV), // kołowanie z powrotem
    ];
    const { detections, state } = runDetector(onGround(), fixes);

    // Ostatnie kołowanie to zjazd z pasa - otwiera kolejny lot, tak jak w mockupie 05.
    expect(detections.map((d) => d.detection)).toEqual(['taxi', 'takeoff', 'landing', 'taxi']);
    expect(state.phase).toBe('ground');
  });
});

/**
 * Kołowanie ma inną „cenę pomyłki" niż start i lądowanie: nie wyznacza żadnego czasu
 * w dokumentach, tylko otwiera lot w logu. Dlatego zapisuje się od razu (bez okna
 * „COFNIJ") - i tym bardziej nie może migotać.
 */
describe('detekcja kołowania - tor prędkościowy', () => {
  it('ruszenie z miejsca daje DOKŁADNIE jedno zdarzenie, nie jedno na fix', () => {
    const { detections } = runDetector(onGround(), series(0, 20, 12, FIELD_ELEV));

    expect(detections.map((d) => d.detection)).toEqual(['taxi']);
    expect(detections[0]!.confirmedAt).toBe(t(T.TAXI_CONFIRM_SEC));
  });

  it('szum prędkości na postoju (0–3 kt) nie wywołuje kołowania', () => {
    const fixes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({
      time: t(i),
      groundSpeedKt: i % 2 === 0 ? 3 : 1,
      altitudeFt: FIELD_ELEV,
    }));

    expect(runDetector(onGround(), fixes).detections).toHaveLength(0);
  });

  it('pojedyncza szpilka poniżej czasu potwierdzenia nie wystarcza', () => {
    const fixes = [...series(0, 2, 12, FIELD_ELEV), ...series(2, 8, 0, FIELD_ELEV)];

    expect(runDetector(onGround(), fixes).detections).toHaveLength(0);
  });

  it('po lądowaniu kołowanie zapada PONOWNIE - to już następny lot', () => {
    // Mockup 05: „14:08 Landing" i zaraz „14:08 Taxi" otwierające Lot 2.
    const fixes: GpsFix[] = [
      ...series(0, 14, 20, FIELD_ELEV + 10), // dobieg → landing
      ...series(14, 10, 12, FIELD_ELEV), // zjazd z pasa
    ];
    const { detections } = runDetector(airborne(), fixes);

    expect(detections.map((d) => d.detection)).toEqual(['landing', 'taxi']);
  });

  it('w powietrzu kołowanie nie jest wykrywane', () => {
    // Wolny przelot ma GS ponad progiem kołowania - bez warunku fazy sypałby zdarzeniami.
    const { detections } = runDetector(airborne(), series(0, 12, 60, FIELD_ELEV + 3000));

    expect(detections).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Zakłócenia GPS (audyt 2026-07-29): jamming to częściej DEGRADACJA niż cisza -
// fixy przychodzą, ale kłamią.
// ─────────────────────────────────────────────────────────────────────────────

describe('bramka jakości fixa (zakłócenia)', () => {
  it('fixUsable: odcina dokładność ponad próg i absurdalną prędkość', () => {
    expect(fixUsable({ time: t(0), groundSpeedKt: 60, altitudeFt: 900 })).toBe(true);
    expect(
      fixUsable({
        time: t(0),
        groundSpeedKt: 60,
        altitudeFt: 900,
        accuracyM: T.MAX_FIX_ACCURACY_M + 1,
      }),
    ).toBe(false);
    expect(
      fixUsable({ time: t(0), groundSpeedKt: T.MAX_PLAUSIBLE_SPEED_KT + 50, altitudeFt: 900 }),
    ).toBe(false);
    // Brak pomiaru NIE dyskwalifikuje - odrzucamy tylko pozytywnie zły pomiar.
    expect(fixUsable({ time: t(0), groundSpeedKt: 60, altitudeFt: 900, accuracyM: null })).toBe(
      true,
    );
    expect(fixUsable({ time: t(0), groundSpeedKt: null, altitudeFt: 900 })).toBe(true);
  });

  it('w locie strumień „wolno i nisko" ze śmieciową dokładnością NIE ląduje samolotu', () => {
    // Zagłuszany odbiornik raportuje niską prędkość i wysokość przy dokładności 120 m -
    // bez bramki byłoby to podręcznikowe fałszywe lądowanie w powietrzu.
    const garbage = series(0, 20, 15, FIELD_ELEV + 5).map((f) => ({ ...f, accuracyM: 120 }));

    expect(runDetector(airborne(), garbage).detections).toHaveLength(0);
  });

  it('śmieciowy fix nie trafia do bufora historii - cechy trendowe liczymy z czystych danych', () => {
    const step = stepDetector(onGround(), {
      time: t(0),
      groundSpeedKt: 15,
      altitudeFt: FIELD_ELEV,
      accuracyM: 300,
    });

    expect(step.state.history.fixes).toHaveLength(0);
  });

  it('po śmieciach wraca dobry sygnał - detekcja działa od nowa, bez pamięci o śmieciu', () => {
    const fixes: GpsFix[] = [
      ...series(0, 5, 15, FIELD_ELEV + 5).map((f) => ({ ...f, accuracyM: 200 })), // śmieci
      ...series(5, 14, 20, FIELD_ELEV + 5).map((f) => ({ ...f, accuracyM: 5 })), // zdrowy dobieg
    ];

    expect(runDetector(airborne(), fixes).detections.map((d) => d.detection)).toEqual([
      'landing',
      'taxi',
    ]);
  });

  it('teleportacja pozycji (spoofing) zeruje kandydata - szpilka GS nie robi startu', () => {
    // Na postoju: pozycja skacze o 5 NM między sekundami (implikowane tysiące kt),
    // a odbiornik deklaruje niewinne 60 kt - dokładnie profil rozbiegu.
    const fixes: GpsFix[] = Array.from({ length: 10 }, (_, i) => ({
      time: t(i),
      groundSpeedKt: 60,
      altitudeFt: FIELD_ELEV,
      ...(i % 2 === 0 ? FIELD : nmNorth(5)),
    }));

    expect(runDetector(onGround(), fixes).detections).toHaveLength(0);
  });
});

describe('geofence lądowania (operacja jednolotniskowa)', () => {
  const skoki = () => createDetectorState(FIELD_ELEV, { sameFieldOnly: true });

  /** Postój na płycie utrwala pozycję pola, potem faza w powietrzu. */
  const airborneAtField = () => {
    let state = skoki();
    for (const f of series(0, 3, 0, FIELD_ELEV)) {
      state = stepDetector(state, { ...f, ...FIELD }).state;
    }
    return { ...state, phase: 'airborne' as const, lastPosition: null };
  };

  it('„wolno i nisko" 5 NM od pola to artefakt, nie przyziemienie - cisza', () => {
    const far = series(10, 14, 20, FIELD_ELEV + 5).map((f) => ({ ...f, ...nmNorth(5) }));

    expect(runDetector(airborneAtField(), far).detections).toHaveLength(0);
  });

  it('te same warunki przy polu → landing (krąg mieści się w promieniu)', () => {
    const near = series(10, 14, 20, FIELD_ELEV + 5).map((f) => ({ ...f, ...nmNorth(1) }));

    expect(runDetector(airborneAtField(), near).detections.map((d) => d.detection)).toEqual([
      'landing',
      'taxi',
    ]);
  });

  it('przelot (bez bramki) ląduje na INNYM lotnisku jak dotąd - regresja niedopuszczalna', () => {
    const away = series(0, 14, 20, FIELD_ELEV + 5).map((f) => ({ ...f, ...nmNorth(150) }));

    expect(runDetector(airborne(), away).detections.map((d) => d.detection)).toEqual([
      'landing',
      'taxi',
    ]);
  });

  it('brak pozycji w fixie nie blokuje lądowania - bramka tnie tylko pozytywnie zły pomiar', () => {
    const noPos = series(10, 14, 20, FIELD_ELEV + 5); // fixy bez lat/lon

    expect(runDetector(airborneAtField(), noPos).detections.map((d) => d.detection)).toEqual([
      'landing',
      'taxi',
    ]);
  });

  it('distanceNm: minuta szerokości geograficznej = 1 NM (sanity trygonometrii)', () => {
    expect(distanceNm(FIELD, nmNorth(1))).toBeCloseTo(1, 2);
    expect(distanceNm(FIELD, FIELD)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rejestr steruje automatem (issue #30). Faza automatu żyje w pamięci ekranu, więc
// nie widzi zapisów spoza siebie: wpisu ręcznego, „COFNIJ", restartu aplikacji.
// ─────────────────────────────────────────────────────────────────────────────

describe('uzgodnienie fazy z rejestrem', () => {
  it('zgodna faza zostawia stan NIETKNIĘTY (ten sam obiekt)', () => {
    const ground = onGround();
    const air = airborne();

    expect(syncDetectorPhase(ground, false)).toBe(ground);
    expect(syncDetectorPhase(air, true)).toBe(air);
  });

  it('rejestr mówi „w locie" - automat przestawia się na wypatrywanie lądowania', () => {
    // Tak wygląda automat po ręcznym starcie z kokpitu albo po restarcie w locie.
    const stale = { ...onGround(), candidateSince: t(3), taxiing: true };
    const synced = syncDetectorPhase(stale, true);

    expect(synced.phase).toBe('airborne');
    // Kandydat zbierał się pod warunek startu - po przestawieniu nie ma czego liczyć.
    expect(synced.candidateSince).toBeNull();
    expect(synced.taxiing).toBe(false);
  });

  it('rejestr mówi „na ziemi" - automat wraca do wypatrywania startu', () => {
    expect(syncDetectorPhase(airborne(), false).phase).toBe('ground');
  });

  it('histereza przeżywa uzgodnienie - „COFNIJ" nie wystawia tego samego toasta na nowo', () => {
    // Warunek, który wywołał cofniętą detekcję, zwykle trzyma się jeszcze kilkanaście
    // sekund. Wyzerowana histereza odpaliłaby ją ponownie na następnym fixie.
    const undone = { ...airborne(), cooldownUntil: t(60) };

    expect(syncDetectorPhase(undone, false).cooldownUntil).toBe(t(60));
  });

  it('bez uzgodnienia automat po cofniętym starcie GUBI prawdziwy start', () => {
    // Fałszywy start: automat przeszedł w `airborne`, ale pilot cofnął toast, więc
    // w rejestrze NIE MA zdarzenia. Od tej chwili automat wypatruje wyłącznie lądowania.
    const afterUndo = runDetector(onGround(), series(0, 8, 60, FIELD_ELEV)).state;
    expect(afterUndo.phase).toBe('airborne');

    // Prawdziwy start dwie minuty później - poza histerezą, więc nic go nie tłumi.
    const realTakeoff = series(120, 12, 60, FIELD_ELEV + 200);
    expect(runDetector(afterUndo, realTakeoff).detections).toEqual([]);

    // Rejestr („nie ma otwartego lotu") prostuje fazę i lot zostaje zapisany.
    const synced = syncDetectorPhase(afterUndo, false);
    expect(runDetector(synced, realTakeoff).detections.map((d) => d.detection)).toEqual(['takeoff']);
  });
});
