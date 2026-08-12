/**
 * UZ Aero — pasek akcji kokpitu: przycisk główny podpowiada NASTĘPNE zdarzenie
 * sekwencji lotu (decyzja 2026-08-11), a zrzut żyje tylko tam, gdzie może się wydarzyć.
 *
 * Testy pilnują dwóch reguł, które przed poprawką były złamane na urządzeniu:
 *  1. zaraz po START ENGINE pasek mówił „Take off", choć samolot stoi — pierwszym
 *     ogniwem sekwencji jest kołowanie i dopiero ono odblokowuje start;
 *  2. przycisk zrzutu wisiał (przygaszony) na ziemi i był aktywny w Climb — wyniesienie
 *     dzieje się w locie poziomym, więc aktywny jest wyłącznie w Cruise, z jednym
 *     wyjątkiem: bez GPS faza jest nieznana i bramka fazy nie ma prawa blokować
 *     jedynej drogi zapisu.
 */

import { buildCockpitActions } from '../ui/screens/logic/cockpitActions';
import type { FlightPhase } from '../domain';

/** Dzień skokowy w powietrzu — najczęstszy kontekst zrzutu; nadpisy per test. */
const build = (
  over: Partial<Parameters<typeof buildCockpitActions>[0]> = {},
): ReturnType<typeof buildCockpitActions> =>
  buildCockpitActions({
    inFlight: false,
    taxiing: false,
    jumpDay: true,
    gpsLost: false,
    phase: 'idle',
    ...over,
  });

describe('przycisk główny — sekwencja idle → Taxi → Take off → Landing', () => {
  test('zaraz po START ENGINE (samolot stoi) następne jest KOŁOWANIE, nie start', () => {
    const view = build();
    expect(view.primary).toBe('taxi');
    expect(view.primaryLabel).toBe('Taxi');
    expect(view.primaryIcon).toBe('phase-taxi');
  });

  test('kołowanie trwa → przycisk zmienia się na Take off', () => {
    const view = build({ taxiing: true, phase: 'taxi' });
    expect(view.primary).toBe('takeoff');
    expect(view.primaryLabel).toBe('Take off');
    expect(view.primaryIcon).toBe('takeoff');
  });

  test('w powietrzu następne jest lądowanie — kołowanie z projekcji już nie gra roli', () => {
    // `taxiing` gaśnie w projekcji przy starcie, ale przycisk i tak nie ma prawa
    // na nim polegać, gdy samolot jest w powietrzu.
    const view = build({ inFlight: true, taxiing: true, phase: 'cruise' });
    expect(view.primary).toBe('landing');
    expect(view.primaryLabel).toBe('Landing');
    expect(view.primaryIcon).toBe('landing');
  });

  test('po lądowaniu (ziemia, bez kołowania) sekwencja wraca do Taxi — kolejny lot serii', () => {
    const view = build({ inFlight: false, taxiing: false, phase: 'idle' });
    expect(view.primary).toBe('taxi');
  });

  test('utrata GPS nie zmienia przycisku — ani nazwy, ani koloru', () => {
    // Do 2026-08-12 bez fixa etykieta dostawała dopisek „· ręcznie", a przycisk ton
    // amber. Żadne z dwojga nic nie rozróżniało: pilot sięga po ten przycisk zawsze
    // z tego samego powodu (logger nie rozpoznał stanu) i zawsze zapisuje
    // `method: 'manual'` — brak fixa i zła detekcja przy zdrowym odbiorniku znaczą
    // dla niego to samo. Stan czujnika opisuje baner 05g i siatka parametrów.
    expect(build({ gpsLost: true })).toEqual(build({ gpsLost: false }));
    expect(build({ gpsLost: true, taxiing: true }).primaryLabel).toBe('Take off');
    expect(build({ gpsLost: true, inFlight: true }).primaryLabel).toBe('Landing');
  });
});

describe('zrzut — istnieje w powietrzu dnia skokowego, aktywny tylko w Cruise', () => {
  test('poza dniem skokowym przycisku nie ma w żadnym stanie (brak akcji, nie blokada)', () => {
    expect(build({ jumpDay: false }).showDrop).toBe(false);
    expect(build({ jumpDay: false, inFlight: true, phase: 'cruise' }).showDrop).toBe(false);
  });

  test('w dniu skokowym NA ZIEMI przycisku nie ma — ani na postoju, ani w kołowaniu', () => {
    expect(build().showDrop).toBe(false);
    expect(build({ taxiing: true, phase: 'taxi' }).showDrop).toBe(false);
  });

  test('w Cruise przycisk jest i jest aktywny', () => {
    const view = build({ inFlight: true, phase: 'cruise' });
    expect(view.showDrop).toBe(true);
    expect(view.dropDisabledReason).toBeNull();
  });

  test.each<FlightPhase>(['climb', 'descent'])(
    'w fazie %s przycisk stoi w pasku (stała geometria), ale przygaszony z powodem',
    (phase) => {
      const view = build({ inFlight: true, phase });
      expect(view.showDrop).toBe(true);
      expect(view.dropDisabledReason).toBe('Zrzut zapiszesz w locie poziomym');
    },
  );

  test('bez GPS w locie przycisk zostaje AKTYWNY — bramka fazy nie działa bez danych o fazie', () => {
    // Detektor po utracie fixa potrafi trzymać ostatnią fazę albo spaść na idle —
    // żadna z nich nie może przygasić jedynej drogi zapisu zrzutu, który naprawdę zaszedł.
    expect(build({ inFlight: true, gpsLost: true, phase: 'climb' }).dropDisabledReason).toBeNull();
    expect(build({ inFlight: true, gpsLost: true, phase: 'idle' }).dropDisabledReason).toBeNull();
  });

  test('start zapisany RĘCZNIE (GPS żyje, ale detektor nie widzi lotu) NIE przygasza zrzutu', () => {
    // `inFlight` pochodzi ze zdarzeń, faza z detektora GPS — po ręcznym starcie detektor
    // dalej twierdzi, że samolot stoi (idle) albo kołuje. To nie jest wiedza „nie jesteś
    // w poziomie", tylko brak wiedzy o locie w ogóle: bramka działa wyłącznie na
    // pozytywnym Climb/Descent, inaczej zamykałaby zrzut na cały lot zapisany ręcznie.
    expect(build({ inFlight: true, phase: 'idle' }).dropDisabledReason).toBeNull();
    expect(build({ inFlight: true, phase: 'taxi' }).dropDisabledReason).toBeNull();
  });
});

describe('załadunek — naziemna połowa pary zrzut/załadunek (issue #21 pkt 7)', () => {
  test('na ziemi dnia skokowego przycisk JEST — na postoju i w kołowaniu', () => {
    expect(build().showBoarding).toBe(true);
    expect(build({ taxiing: true, phase: 'taxi' }).showBoarding).toBe(true);
  });

  test('w powietrzu przycisku nie ma — jego slot zajmuje zrzut (stała geometria pary)', () => {
    const view = build({ inFlight: true, phase: 'cruise' });
    expect(view.showBoarding).toBe(false);
    expect(view.showDrop).toBe(true);
  });

  test('poza dniem skokowym przycisku nie ma w żadnym stanie (brak akcji, nie blokada)', () => {
    expect(build({ jumpDay: false }).showBoarding).toBe(false);
    expect(build({ jumpDay: false, taxiing: true }).showBoarding).toBe(false);
  });

  test('brak GPS nie rusza załadunku — to zapis naziemny, nie zależy od detekcji', () => {
    expect(build({ gpsLost: true }).showBoarding).toBe(true);
  });
});
