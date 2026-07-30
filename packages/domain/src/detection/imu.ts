/**
 * UZ Aero — czujniki inercyjne: usunięcie grawitacji i agregaty sekundowe.
 *
 * ── DLACZEGO SAM MODUŁ PRZYSPIESZENIA NIE WYSTARCZA ──────────────────────────
 * Naturalny pomysł brzmi: „weźmy moduł wektora przyspieszenia, będzie niezależny od tego,
 * jak leży telefon". Moduł faktycznie jest niezmienniczy względem obrotu — ale zawiera
 * grawitację, a ta go całkowicie zdominowuje. Rachunek: rozbieg to około 0,25 g poziomo,
 * więc |a| rośnie z 9,81 do √(9,81² + 2,45²) = 10,11 m/s². **Trzy procent.** Przy
 * wibracjach silnika tłokowego rzędu ±1–3 m/s² ten sygnał jest utopiony w szumie.
 *
 * Grawitację da się jednak usunąć BEZ znajomości orientacji telefonu: mocny filtr
 * dolnoprzepustowy zbiega do kierunku „w dół", bo wibracja jest zeromodalna i uśrednia
 * się do zera. Po odjęciu tego wektora zostaje |a_liniowe| — wciąż niezmiennicze względem
 * obrotu, ale z bazą bliską zeru. Te same 2,45 m/s² rozbiegu to teraz sygnał
 * kilkudziesięciokrotnie nad tłem, a nie trzy procent.
 *
 * ── ZASADA RÓWNOWAŻNOŚCI, CZYLI DLACZEGO FILTR TRZEBA ZAMRAŻAĆ ───────────────
 * Akcelerometr z definicji nie odróżni pochylenia od przyspieszania. Przy długim, stałym
 * przyspieszeniu filtr grawitacji zacząłby więc „wjeżdżać" w kierunek ruchu i po
 * kilkudziesięciu sekundach uznałby rozbieg za nowy pion. Dlatego estymatę aktualizujemy
 * WYŁĄCZNIE wtedy, gdy przyspieszenie liniowe jest małe (`GRAVITY_UPDATE_MAX_MPS2`) —
 * czyli gdy naprawdę mierzymy pion, a nie manewr.
 *
 * ── ŻYROSKOP: MODUŁ, NIE OSIE ────────────────────────────────────────────────
 * Z żyroskopu bierzemy |ω| — moduł prędkości kątowej. Poszczególne osie są bez znaczenia,
 * bo nie wiemy, która jest którą; moduł mówi „samolot manewruje" niezależnie od tego,
 * jak telefon leży w uchwycie.
 *
 * ── CZEGO TU ŚWIADOMIE NIE MA ────────────────────────────────────────────────
 * Te agregaty NIE wchodzą (jeszcze) do decyzji detektora. Trafiają wyłącznie do śladu
 * kalibracyjnego, żeby po fazie 5 stroić progi na nagraniach z realnych lotów, a nie na
 * liczbach wymyślonych przy biurku. Wpięcie do automatu to osobny, późniejszy krok.
 *
 * Czysta domena: żadnego `expo-sensors`, żadnych timerów — wchodzą próbki, wychodzą liczby.
 */

/** Wektor z czujnika (jednostki: m/s² dla akcelerometru, °/s dla żyroskopu). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Stała czasowa filtra grawitacji (s).
 *
 * Musi być DUŻO dłuższa niż rozbieg (20–30 s), inaczej filtr zdąży uznać przyspieszenie
 * za pion — i jednocześnie na tyle krótka, żeby po zmianie ułożenia telefonu w uchwycie
 * pion wrócił w rozsądnym czasie. Kompromis do kalibracji z danymi z fazy 5.
 */
export const GRAVITY_TAU_SEC = 30;

/**
 * Powyżej tego przyspieszenia liniowego (m/s²) NIE aktualizujemy estymaty grawitacji.
 * To jest praktyczna realizacja zasady równoważności: aktualizujemy pion tylko wtedy,
 * gdy mamy powody wierzyć, że mierzymy pion.
 */
export const GRAVITY_UPDATE_MAX_MPS2 = 0.5;

/**
 * Po tylu sekundach NIEPRZERWANEGO zamrożenia filtr wraca do pracy, choćby odczyt
 * nadal wyglądał na manewr.
 *
 * Bez tego limitu zamrożenie jest TRWAŁE i to jest realna awaria, nie hipoteza: pilot
 * przekłada telefon w uchwycie, pion przeskakuje o kilkanaście m/s², warunek „to musi
 * być manewr" spełnia się na zawsze i estymata grawitacji zostaje przy STARYM ułożeniu
 * do końca dnia lotnego. Od tej chwili każdy odczyt przyspieszenia liniowego jest
 * śmieciem — a nic tego nie zgłasza.
 *
 * 60 s jest dłuższe niż każdy rozbieg (20–30 s), więc prawdziwe przyspieszenie mieści
 * się w budżecie i nie rusza pionu ani o milimetr. Trwała zmiana ułożenia budżet
 * wyczerpuje i filtr dociąga się normalnym tempem.
 */
export const GRAVITY_FREEZE_MAX_SEC = 60;

/** Docelowa częstotliwość próbkowania (Hz) — wystarcza na pasmo dudnienia kół 1–20 Hz. */
export const IMU_SAMPLE_HZ = 50;

/** Długość okna agregacji (s). Do śladu idzie JEDEN wiersz na okno, nie surowe próbki. */
export const IMU_AGGREGATE_SEC = 1;

/**
 * Agregat okna — to trafia do śladu kalibracyjnego.
 *
 * Surowy strumień (50 Hz × 6 h ≈ milion próbek dziennie) jest niezapisywalny obok śladu
 * GPS, który ma ~30 tys. wierszy na dzień. Agregat sekundowy jest tego samego rzędu
 * wielkości co fixy, a do strojenia progów w zupełności wystarcza.
 */
export interface ImuAggregate {
  /** Średni moduł przyspieszenia liniowego w oknie (m/s²). */
  accelMeanMps2: number;
  /** Maksymalny moduł przyspieszenia liniowego (m/s²) — uderzenie przyziemienia. */
  accelMaxMps2: number;
  /**
   * ODCHYLENIE STANDARDOWE modułu przyspieszenia w oknie (m/s²) — miara wibracji.
   *
   * Zastępuje FFT i robi to celowo. Interesuje nas ENERGIA pasma szybkozmiennego, a nie
   * jego widmo: jazda po nawierzchni generuje szerokopasmowe uderzenia, których nie ma
   * przy pracującym silniku na postoju, a oderwanie kół gasi je skokowo. Odchylenie
   * standardowe w oknie sekundowym mierzy dokładnie tę energię, jednym przebiegiem
   * po próbkach i bez bufora.
   */
  vibrationRmsMps2: number;
  /** Średni moduł prędkości kątowej (°/s). */
  gyroMeanDps: number;
  /** Maksymalny moduł prędkości kątowej (°/s). */
  gyroMaxDps: number;
  /** Liczba surowych próbek w oknie — miara jakości agregatu. */
  samples: number;
}

export interface ImuAccumulator {
  /** Bieżąca estymata wektora grawitacji; null, dopóki nie ma pierwszej próbki. */
  gravity: Vec3 | null;
  /** Ile sekund NIEPRZERWANIE trwa zamrożenie estymaty (budżet `GRAVITY_FREEZE_MAX_SEC`). */
  frozenSec: number;
  /**
   * Budżet zamrożenia wyczerpany — filtr dociąga się do nowego pionu, aż odczyt wróci
   * pod próg. Bez tej flagi po wyczerpaniu budżetu filtr wykonywałby JEDEN krok i zamrażał
   * się od nowa, czyli czołgał się do nowego ułożenia godzinami.
   */
  recovering: boolean;
  accelSum: number;
  accelSumSq: number;
  accelMax: number;
  gyroSum: number;
  gyroMax: number;
  samples: number;
}

export function createImuAccumulator(): ImuAccumulator {
  return {
    gravity: null,
    frozenSec: 0,
    recovering: false,
    accelSum: 0,
    accelSumSq: 0,
    accelMax: 0,
    gyroSum: 0,
    gyroMax: 0,
    samples: 0,
  };
}

/**
 * Nowa estymata grawitacji po jednej próbce (filtr jednobiegunowy).
 *
 * Pierwsza próbka staje się estymatą wprost — zakładamy, że w chwili uruchomienia
 * czujników telefon spoczywa. To założenie jest spełnione w praktyce (nasłuch startuje
 * przy uruchomieniu silnika, na stanowisku), a gdyby nie było, filtr sam się dociągnie.
 */
export function stepGravity(
  previous: Vec3 | null,
  sample: Vec3,
  dtSec: number,
  tauSec: number = GRAVITY_TAU_SEC,
): Vec3 {
  if (previous == null) return { ...sample };
  if (dtSec <= 0) return previous;

  const alpha = Math.min(1, dtSec / tauSec);
  return {
    x: previous.x + alpha * (sample.x - previous.x),
    y: previous.y + alpha * (sample.y - previous.y),
    z: previous.z + alpha * (sample.z - previous.z),
  };
}

/** Moduł przyspieszenia po odjęciu grawitacji — wielkość niezmiennicza względem obrotu. */
export function linearAccelMps2(sample: Vec3, gravity: Vec3): number {
  return magnitude({
    x: sample.x - gravity.x,
    y: sample.y - gravity.y,
    z: sample.z - gravity.z,
  });
}

/**
 * Dokłada jedną próbkę do akumulatora. Czysta: zwraca nowy akumulator.
 *
 * `gyroDps` bywa `null` — telefon bez żyroskopu (albo z wyłączonym nasłuchem) nadal
 * dostarcza użyteczny kanał przyspieszenia, więc brak jednego czujnika nie unieważnia
 * drugiego.
 */
export function pushImuSample(
  acc: ImuAccumulator,
  accel: Vec3,
  gyroDps: Vec3 | null,
  dtSec: number,
): ImuAccumulator {
  const filtered = stepGravity(acc.gravity, accel, dtSec);
  // Przyspieszenie liniowe liczymy względem estymaty SPRZED aktualizacji — inaczej pion
  // goniłby manewr i wielkość liniowa systematycznie malałaby w trakcie rozbiegu.
  const reference = acc.gravity ?? filtered;
  const linear = linearAccelMps2(accel, reference);

  // Zamrożenie z BUDŻETEM: pion aktualizujemy, gdy naprawdę mierzymy pion — ale jeśli
  // „manewr" trwa dłużej niż jakikolwiek rozbieg, to nie jest manewr, tylko zmiana
  // ułożenia telefonu, i trzymanie starego pionu byłoby trwałą awarią kanału.
  const calm = linear <= GRAVITY_UPDATE_MAX_MPS2;
  const frozenSec = calm ? 0 : acc.frozenSec + dtSec;
  const recovering = calm ? false : acc.recovering || frozenSec > GRAVITY_FREEZE_MAX_SEC;
  const nextGravity = calm || recovering ? filtered : reference;

  const gyro = gyroDps == null ? 0 : magnitude(gyroDps);

  return {
    gravity: nextGravity,
    frozenSec,
    recovering,
    accelSum: acc.accelSum + linear,
    accelSumSq: acc.accelSumSq + linear * linear,
    accelMax: Math.max(acc.accelMax, linear),
    gyroSum: acc.gyroSum + gyro,
    gyroMax: Math.max(acc.gyroMax, gyro),
    samples: acc.samples + 1,
  };
}

/**
 * Zamyka okno: zwraca agregat i akumulator wyzerowany do następnego okna.
 *
 * Stan FILTRA (estymata grawitacji, budżet zamrożenia) przeżywa zamknięcie okna —
 * filtr o stałej czasowej 30 s musi być ciągły, a nie startować od nowa co sekundę.
 * Zerują się tylko sumy statystyczne, bo one opisują właśnie zamknięte okno.
 */
export function drainImu(acc: ImuAccumulator): {
  aggregate: ImuAggregate | null;
  next: ImuAccumulator;
} {
  const next: ImuAccumulator = {
    ...createImuAccumulator(),
    gravity: acc.gravity,
    frozenSec: acc.frozenSec,
    recovering: acc.recovering,
  };

  if (acc.samples === 0) return { aggregate: null, next };

  const mean = acc.accelSum / acc.samples;
  // Wariancja z sum — jeden przebieg po próbkach, bez trzymania ich w pamięci.
  // `max(0, …)` chroni przed ujemnym wynikiem z błędu zaokrągleń przy stałym sygnale.
  const variance = Math.max(0, acc.accelSumSq / acc.samples - mean * mean);

  return {
    aggregate: {
      accelMeanMps2: mean,
      accelMaxMps2: acc.accelMax,
      vibrationRmsMps2: Math.sqrt(variance),
      gyroMeanDps: acc.gyroSum / acc.samples,
      gyroMaxDps: acc.gyroMax,
      samples: acc.samples,
    },
    next,
  };
}

/**
 * Wysokość względna z ciśnienia (stopy) — barometryczny tor pionowy.
 *
 * Bezwzględna wysokość barometryczna wymagałaby QNH, którego nie mamy. Ale detektor
 * i tak pracuje na RÓŻNICY względem elewacji pola z chwili ENGINE START, a różnica
 * ciśnień daje ją bez żadnego nastawiania: ~27 ft na hektopaskal, przy rozdzielczości
 * czujnika w telefonie rzędu pół stopy. GPS na wysokości myli się o 15–50 ft, więc to
 * poprawa o dwa rzędy wielkości — i to jest powód, dla którego barometr jest wart
 * więcej niż wszystkie pozostałe czujniki razem.
 *
 * Wzór barometryczny w formie logarytmicznej (troposfera, atmosfera wzorcowa). Dryf
 * pogodowy (QNH potrafi przejść 5 hPa w ciągu dnia lotnego = ~135 ft) wymaga
 * PRZEZEROWANIA datum na każdym postoju — jedno odniesienie na cały dzień to błąd.
 */
export function pressureToRelativeFt(pressureHpa: number, datumHpa: number): number {
  if (pressureHpa <= 0 || datumHpa <= 0) return 0;
  const METERS_PER_FOOT = 0.3048;
  // h = 44330 · (1 − (p/p0)^0.1903) — postać skrócona atmosfery wzorcowej ISA.
  const heightM = 44_330 * (1 - Math.pow(pressureHpa / datumHpa, 0.190_284));
  return heightM / METERS_PER_FOOT;
}
