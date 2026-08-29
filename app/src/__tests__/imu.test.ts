/**
 * UZ Aero - testy matematyki czujników inercyjnych (`domain/detection/imu.ts`).
 *
 * Ten moduł istnieje, bo naturalny pomysł „weźmy moduł przyspieszenia, będzie niezależny
 * od ułożenia telefonu" jest jednocześnie SŁUSZNY i BEZUŻYTECZNY: moduł faktycznie nie
 * zależy od obrotu, ale zawiera grawitację, która go całkowicie zdominowuje. Pierwszy
 * test poniżej mierzy tę pułapkę liczbowo, żeby nikt nie musiał jej odkrywać po raz drugi
 * na danych z lotu.
 *
 * Reszta testów pilnuje dwóch rzeczy, na których stoi cały kanał: że po odjęciu grawitacji
 * wynik NIE ZALEŻY od ułożenia telefonu, i że filtr grawitacji nie daje się nabrać na
 * długie przyspieszenie (zasada równoważności - akcelerometr z definicji nie odróżni
 * pochylenia od przyspieszania).
 */

import {
  GRAVITY_FREEZE_MAX_SEC,
  GRAVITY_TAU_SEC,
  createImuAccumulator,
  drainImu,
  linearAccelMps2,
  magnitude,
  pressureToRelativeFt,
  pushImuSample,
  stepGravity,
  type ImuAccumulator,
  type Vec3,
} from '../domain';

const G = 9.806_65;
/** Przyspieszenie rozbiegu: 0,25 g ≈ 2,45 m/s². */
const ROLL_MPS2 = 0.25 * G;

const scale = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

/**
 * Trzy ułożenia telefonu w uchwycie. `down` to kierunek grawitacji w układzie telefonu,
 * `forward` - prostopadły do niego kierunek ruchu. Oba jednostkowe.
 */
const ORIENTATIONS: { name: string; down: Vec3; forward: Vec3 }[] = [
  { name: 'płasko na desce', down: { x: 0, y: 0, z: 1 }, forward: { x: 1, y: 0, z: 0 } },
  { name: 'pochylony w uchwycie', down: { x: 0.6, y: 0, z: 0.8 }, forward: { x: 0.8, y: 0, z: -0.6 } },
  {
    name: 'przekręcony na ukos',
    down: { x: 1 / Math.sqrt(3), y: 1 / Math.sqrt(3), z: 1 / Math.sqrt(3) },
    forward: { x: 1 / Math.sqrt(2), y: -1 / Math.sqrt(2), z: 0 },
  },
];

/** Ustawia filtr grawitacji, karmiąc go spoczynkiem tak długo, aż zbiegnie. */
function settled(down: Vec3, sampleHz = 50): ImuAccumulator {
  const dt = 1 / sampleHz;
  const rest = scale(down, G);
  let acc = createImuAccumulator();
  // Pięć stałych czasowych = zbieżność do ~0,7 %.
  for (let i = 0; i < sampleHz * GRAVITY_TAU_SEC * 5; i += 1) {
    acc = pushImuSample(acc, rest, null, dt);
  }
  return acc;
}

describe('dlaczego sam moduł przyspieszenia nie wystarcza', () => {
  it('rozbieg podnosi |a| z 9,81 do 10,11 m/s² - o TRZY PROCENT', () => {
    const rest = { x: 0, y: 0, z: G };
    const rolling = add(rest, { x: ROLL_MPS2, y: 0, z: 0 });

    expect(magnitude(rest)).toBeCloseTo(9.81, 2);
    expect(magnitude(rolling)).toBeCloseTo(10.11, 2);

    // 3 % modulacji przy wibracjach silnika tłokowego rzędu ±1–3 m/s² to sygnał
    // utopiony w szumie. Stąd cały mechanizm usuwania grawitacji.
    expect(magnitude(rolling) / magnitude(rest) - 1).toBeLessThan(0.04);
  });

  it('po odjęciu grawitacji ten sam rozbieg to pełne 2,45 m/s² nad zerem', () => {
    const gravity = { x: 0, y: 0, z: G };
    const rolling = add(gravity, { x: ROLL_MPS2, y: 0, z: 0 });

    expect(linearAccelMps2(rolling, gravity)).toBeCloseTo(ROLL_MPS2, 6);
  });
});

describe('niezmienniczość względem ułożenia telefonu', () => {
  it.each(ORIENTATIONS)(
    'ułożenie „$name": rozbieg daje ten sam wynik co w każdym innym',
    ({ down, forward }) => {
      const acc = settled(down);
      const rolling = add(scale(down, G), scale(forward, ROLL_MPS2));

      // Estymata grawitacji zbiegła do kierunku „w dół" TEGO telefonu - bez żadnej
      // wiedzy o tym, jak on leży. Stąd wynik nie zależy od ułożenia.
      const linear = linearAccelMps2(rolling, acc.gravity!);
      expect(linear).toBeCloseTo(ROLL_MPS2, 1);
    },
  );

  it('spoczynek daje ~0, a nie 9,81 - grawitacja naprawdę wyszła', () => {
    const acc = settled({ x: 0, y: 0, z: 1 });
    expect(linearAccelMps2({ x: 0, y: 0, z: G }, acc.gravity!)).toBeLessThan(0.05);
  });
});

describe('zamrożenie filtra grawitacji (zasada równoważności)', () => {
  it('30 s STAŁEGO przyspieszenia nie zostaje uznane za nowy pion', () => {
    // Bez zamrożenia filtr o stałej 30 s przesunąłby się o ~63 % w kierunek ruchu
    // i przyspieszenie rozbiegu „wyparowałoby" pod koniec rozbiegu - czyli dokładnie
    // wtedy, gdy jest najbardziej potrzebne.
    const down = { x: 0, y: 0, z: 1 };
    const forward = { x: 1, y: 0, z: 0 };
    // Drenaż po ustawieniu filtra: statystyki mają objąć TYLKO rozbieg.
    let acc = drainImu(settled(down)).next;

    const rolling = add(scale(down, G), scale(forward, ROLL_MPS2));
    const dt = 1 / 50;
    for (let i = 0; i < 50 * 30; i += 1) acc = pushImuSample(acc, rolling, null, dt);

    const { aggregate } = drainImu(acc);
    expect(aggregate!.accelMeanMps2).toBeCloseTo(ROLL_MPS2, 1);
  });

  it('ZAMROŻENIE NIE JEST TRWAŁE: po przełożeniu telefonu filtr dociąga się do nowego pionu', () => {
    // Regresja z prawdziwej dziury w pierwszej wersji: warunek „to musi być manewr"
    // spełniał się po przełożeniu telefonu NA ZAWSZE (skok pionu o ~13,9 m/s² nigdy nie
    // spada pod próg), więc estymata grawitacji zostawała przy starym ułożeniu do końca
    // dnia i każdy kolejny odczyt przyspieszenia był śmieciem - bez żadnego sygnału.
    let acc = drainImu(settled({ x: 0, y: 0, z: 1 })).next;

    const newRest = { x: G, y: 0, z: 0 };
    const dt = 1 / 50;
    // Budżet zamrożenia (60 s) + siedem stałych czasowych na dociągnięcie ≈ 4,5 minuty.
    // Tyle wynosi gwarancja: kanał wraca do zdrowia sam, w czasie ograniczonym z góry.
    const seconds = GRAVITY_FREEZE_MAX_SEC + GRAVITY_TAU_SEC * 7;
    for (let i = 0; i < 50 * seconds; i += 1) acc = pushImuSample(acc, newRest, null, dt);

    expect(linearAccelMps2(newRest, acc.gravity!)).toBeLessThan(0.05);
  });

  it('budżet zamrożenia jest DŁUŻSZY niż każdy rozbieg - prawdziwy start pionu nie rusza', () => {
    // Tu leży cały kompromis: 60 s > 30 s rozbiegu, więc manewr mieści się w budżecie,
    // a trwała zmiana ułożenia go wyczerpuje.
    expect(GRAVITY_FREEZE_MAX_SEC).toBeGreaterThan(30);
  });

  it('stepGravity: pierwsza próbka staje się estymatą wprost', () => {
    const first = { x: 1, y: 2, z: 3 };
    expect(stepGravity(null, first, 0.02)).toEqual(first);
  });
});

describe('agregat okna', () => {
  it('sygnał stały ma zerową miarę wibracji, sygnał zmienny - niezerową', () => {
    const down = { x: 0, y: 0, z: 1 };
    const dt = 1 / 50;

    let steady = settled(down);
    for (let i = 0; i < 50; i += 1) steady = pushImuSample(steady, scale(down, G), null, dt);

    let shaking = settled(down);
    for (let i = 0; i < 50; i += 1) {
      // Dudnienie kół: naprzemienne uderzenia wzdłuż osi ruchu.
      const bump = { x: i % 2 === 0 ? 1.5 : -1.5, y: 0, z: 0 };
      shaking = pushImuSample(shaking, add(scale(down, G), bump), null, dt);
    }

    expect(drainImu(steady).aggregate!.vibrationRmsMps2).toBeLessThan(0.01);
    expect(drainImu(shaking).aggregate!.vibrationRmsMps2).toBeGreaterThan(0.1);
  });

  it('moduł prędkości kątowej: średnia i maksimum, bez patrzenia na osie', () => {
    let acc = createImuAccumulator();
    const rest = { x: 0, y: 0, z: G };
    // 3-4-5: moduł (3,4,0) = 5 °/s. Która oś jest którą - bez znaczenia.
    acc = pushImuSample(acc, rest, { x: 3, y: 4, z: 0 }, 0.02);
    acc = pushImuSample(acc, rest, { x: 0, y: 0, z: 15 }, 0.02);

    const { aggregate } = drainImu(acc);
    expect(aggregate!.gyroMeanDps).toBeCloseTo(10, 6);
    expect(aggregate!.gyroMaxDps).toBeCloseTo(15, 6);
  });

  it('okno bez próbek daje null, nie zera - „nie wiem" to nie „zero"', () => {
    expect(drainImu(createImuAccumulator()).aggregate).toBeNull();
  });

  it('zamknięcie okna zeruje sumy, ale ZACHOWUJE estymatę grawitacji', () => {
    // Filtr o stałej 30 s musi być ciągły; start od nowa co sekundę czyniłby go bezużytecznym.
    const acc = settled({ x: 0, y: 0, z: 1 });
    const { next } = drainImu(acc);

    expect(next.samples).toBe(0);
    expect(next.accelSum).toBe(0);
    expect(next.gravity).toEqual(acc.gravity);
  });
});

describe('barometryczny tor pionowy', () => {
  it('hektopaskal to około 27 stóp przy ciśnieniu przy ziemi', () => {
    expect(pressureToRelativeFt(1012, 1013)).toBeCloseTo(27, 0);
  });

  it('to samo ciśnienie co datum = zero stóp (żadnego QNH nie potrzebujemy)', () => {
    // Detektor pracuje na RÓŻNICY względem elewacji pola z ENGINE START, a różnica
    // ciśnień daje ją bez nastawiania wysokościomierza.
    expect(pressureToRelativeFt(1013.25, 1013.25)).toBe(0);
  });

  it('wyższe ciśnienie niż datum = poniżej datum (znak się nie gubi)', () => {
    expect(pressureToRelativeFt(1020, 1013)).toBeLessThan(0);
  });

  it('rozdzielczość czujnika w telefonie odpowiada mniej niż stopie', () => {
    // 0,02 hPa to typowa rozdzielczość - i to jest cała przewaga nad GPS-em,
    // który na wysokości myli się o 15–50 ft.
    expect(pressureToRelativeFt(1013.23, 1013.25)).toBeGreaterThan(-1);
    expect(pressureToRelativeFt(1013.23, 1013.25)).toBeLessThan(1);
  });
});
