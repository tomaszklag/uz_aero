/**
 * UZ Aero - test RACHUNKÓW paliwa i motogodzin (ekran 10, issue #38 pkt 4, 5 i 6;
 * issue #40 pkt 7 i 8).
 *
 * Od issue #40 karta pokazuje SAMĄ plakietkę werdyktu, a pasmo, stawki i rozpisane
 * działanie mieszkają w arkuszu (`details`) - otwieranym przez tego, kto zapyta
 * „dlaczego tak". Test pilnuje przede wszystkim tego, że arkusz istnieje dokładnie
 * wtedy, co werdykt: plakietka bez szczegółów byłaby wyrokiem bez uzasadnienia.
 *
 * Trzy rzeczy są tu ważniejsze od arytmetyki:
 *  • **werdykt liczy się dla TEJ mieszanki faz**, a nie dla średniej z okna - sesja
 *    z długim kołowaniem nie może wychodzić „poniżej normy" tylko dlatego, że mniej
 *    latała (to była wada, którą zgłosił issue #38 pkt 6),
 *  • **motogodziny mają WŁASNĄ normę** - przyrost licznika nie równa się czasowi
 *    blokowemu i ekran nie ma prawa tego twierdzić (pkt 4),
 *  • **brak danych kończy się zdaniem, nie kreską** - pusty pasek przy liczbach
 *    z licznika wygląda jak awaria aplikacji.
 */

import { fuelBalance, mhBalance } from '../ui/screens/logic/sessionBalance';
import type { BalanceView } from '../ui/screens/logic/sessionBalance';
import { emptySessionState } from '../domain';
import type { ConsumptionNorm, SessionState } from '../domain';

const HOUR = 3_600_000;

/** Wartość wiersza arkusza normy - po etykiecie, bo o kolejność pyta osobny test. */
function detail(view: BalanceView, label: string): string | undefined {
  return view.details?.rows.find((row) => row.label === label)?.value;
}

/** Sesja z mockupu 10: blok 1:43, w powietrzu 1:16, 150 +48 −171 = 27 L, +1:35 MH. */
function session(over: Partial<SessionState> = {}): SessionState {
  return {
    ...emptySessionState(),
    sessionUuid: 's-1',
    aircraftId: 'SP-AXA',
    mhFormat: 'hhmm',
    blockTimeMs: 103 * 60_000,
    flightTimeMs: 76 * 60_000,
    fuel: { startL: 150, addedL: 48, endL: 171, consumedL: 27, lastReadingL: 171 },
    mh: { start: 1234.5, end: 1234.5 + 95 / 60, deltaH: 95 / 60 },
    ...over,
  };
}

/** Norma SP-AXA: ziemia 8 L/h, powietrze 20 L/h, licznik obrotomierzowy 1,00 / 0,40. */
function norm(over: Partial<ConsumptionNorm> = {}): ConsumptionNorm {
  return {
    windowDays: 90,
    blockLPerHLow: 12,
    blockLPerHHigh: 18,
    blockLPerH: 15,
    airLPerH: 20,
    groundLPerH: 8,
    litersPerFlight: 22,
    fuelRatioLow: 0.9,
    fuelRatioHigh: 1.1,
    mh: {
      kind: 'tach',
      perFlightHour: 1,
      perGroundHour: 0.4,
      ratioLow: 0.95,
      ratioHigh: 1.05,
      sessions: 12,
    },
    intervals: 96,
    engineMs: 118 * HOUR,
    computedAt: Date.UTC(2026, 7, 5, 17, 30),
    ...over,
  };
}

describe('rachunek paliwa', () => {
  it('rozpisuje odczyty i dolewki jako przesłanki wyniku', () => {
    const view = fuelBalance(session(), norm(), 2, null);

    expect(view.rows.map((row) => `${row.op}${row.label} = ${row.value}`)).toEqual([
      'Odczyt przy przejęciu = 150 L',
      '+Dolane · 2 tankowania = 48 L',
      '−Odczyt przy zdaniu = 171 L',
    ]);
    expect(view.totalValue).toBe('27 L');
  });

  it('wiersz dolewek zostaje także przy zerze - brak wiersza kazałby zgadywać', () => {
    const view = fuelBalance(session({ fuel: { ...session().fuel, addedL: 0 } }), norm(), 0, null);

    expect(view.rows[1]!.label).toBe('Dolane');
    expect(view.rows[1]!.value).toBe('0 L');
  });

  it('werdykt liczy oczekiwanie z PROPORCJI faz tej sesji', () => {
    // 1:16 lotu × 20 L/h + 0:27 ziemi × 8 L/h ≈ 29,0 L. Rozrzut ±10% dałby 26–32 L,
    // ale pasmo rozpycha PODŁOGA z błędu odczytu (±6 L, `policy.ts`): przy tak małym
    // zużyciu dwa odczyty paliwomierza są mniej dokładne niż sam model.
    const view = fuelBalance(session(), norm(), 2, null);

    expect(view.verdict?.label).toBe('✓ W NORMIE');
    expect(view.verdict?.tone).toBe('green');
    expect(detail(view, 'Oczekiwane po tej sesji')).toBe('23 L – 35 L');
    expect(view.details?.note).toContain('1:16 lotu × 20 L/h + 0:27 ziemi × 8 L/h ≈ 29 L');
  });

  it('arkusz normy zestawia stawki z rzeczywistą średnią TEJ sesji (issue #40 pkt 7)', () => {
    const view = fuelBalance(session(), norm(), 2, null);

    expect(view.details?.title).toBe('NORMA PALIWA');
    expect(view.details?.summary).toContain('W normie - 27 L przy oczekiwanych 23 L – 35 L');
    expect(detail(view, 'Zużyte w tej sesji')).toBe('27 L');
    // 27 L na 1:43 pracy silnika ≈ 16 L/h - mniej niż stawka lotu, bo prawie pół
    // godziny silnik pracował na ziemi. Po to ta liczba w arkuszu stoi.
    expect(detail(view, 'Średnia tej sesji')).toBe('16 L/h');
    expect(detail(view, 'Norma w locie')).toBe('20 L/h');
    expect(detail(view, 'Norma na ziemi')).toBe('8 L/h');
    expect(detail(view, 'Podstawa')).toBe('90 dni');
  });

  it('plakietka i arkusz istnieją albo znikają RAZEM', () => {
    // Werdykt bez uzasadnienia byłby wyrokiem, którego nie da się sprawdzić.
    expect(fuelBalance(session(), norm(), 2, null).details).not.toBeNull();
    expect(fuelBalance(session(), null, 2, null).details).toBeNull();
    expect(mhBalance(session(), norm({ mh: null })).details).toBeNull();
  });

  it('ta sama liczba litrów przy innej mieszance faz daje inny werdykt', () => {
    // Ten sam blok, ale prawie same kołowanie: oczekiwanie spada i 27 L to za dużo.
    const kolowanie = session({ flightTimeMs: 10 * 60_000 });
    const view = fuelBalance(kolowanie, norm(), 2, null);

    expect(view.verdict?.label).toBe('↑ POWYŻEJ NORMY');
    expect(view.verdict?.tone).toBe('amber');
  });

  it('bez stawek fazowych schodzi na godzinę pracy silnika', () => {
    const view = fuelBalance(session(), norm({ airLPerH: null, groundLPerH: null }), 2, null);

    // 1:43 × 15 L/h ≈ 25,8 L, pasmo z centyli okna (12–18 L/h) rozepchane do podłogi.
    expect(detail(view, 'Oczekiwane po tej sesji')).toBe('20 L – 32 L');
    expect(detail(view, 'Norma')).toBe('15 L/h pracy silnika');
    // Arkusz mówi wprost, że model nie rozdzielił faz - to słabsza odpowiedź niż
    // stawki fazowe i pilot ma prawo o tym wiedzieć.
    expect(view.details?.summary).toContain('nie rozdzielił jeszcze faz');
  });

  it('silnik, który nie pracował, nie ma z czym porównywać - i mówi to wprost', () => {
    const bezLotu = session({
      blockTimeMs: 0,
      flightTimeMs: 0,
      fuel: { startL: 240, addedL: 0, endL: 240, consumedL: 0, lastReadingL: 240 },
    });
    const view = fuelBalance(bezLotu, norm(), 0, null);

    expect(view.verdict).toBeNull();
    expect(view.naNote).toContain('silnik nie pracował');
  });

  it('samolot bez normy milczy o normie, ale rachunek pokazuje', () => {
    const view = fuelBalance(session(), null, 2, null);

    expect(view.totalValue).toBe('27 L');
    expect(view.verdict).toBeNull();
    expect(view.naNote).toContain('nie ma jeszcze policzonej normy');
  });

  it('brak odczytu przy zdaniu wyklucza werdykt, nie rachunek', () => {
    const otwarta = session({
      fuel: { startL: 150, addedL: 48, endL: null, consumedL: null, lastReadingL: 150 },
    });
    const view = fuelBalance(otwarta, norm(), 2, null);

    expect(view.totalValue).toBe('-');
    expect(view.verdict).toBeNull();
    expect(view.naNote).toContain('brakuje odczytu przy zdaniu');
  });
});

describe('rachunek motogodzin', () => {
  it('ma tę samą formę co paliwo - przesłanki, wynik, werdykt', () => {
    const view = mhBalance(session(), norm());

    expect(view.rows.map((row) => `${row.op}${row.label} = ${row.value}`)).toEqual([
      'Licznik przy przejęciu = 1234:30',
      '−Licznik przy zdaniu = 1236:05',
    ]);
    expect(view.totalLabel).toBe('Przyrost');
    expect(view.totalValue).toBe('+1:35');
  });

  it('oczekiwanie jest MNIEJSZE niż czas blokowy - obrotomierz na ziemi chodzi wolniej', () => {
    // 1:16 × 1,00 + 0:27 × 0,40 = 1,45 h ≈ 1:27, a blok wynosi 1:43. Pasmo ±5%
    // rozepchane do podziałki licznika (±0,1 h) daje 1:21 – 1:33.
    const view = mhBalance(session(), norm());

    expect(view.verdict?.label).toBe('↑ POWYŻEJ NORMY');
    expect(detail(view, 'Oczekiwane po tej sesji')).toBe('+1:21 – +1:33');
    expect(detail(view, 'Przelicznik w locie')).toBe('1,00 MH/h');
    expect(detail(view, 'Przelicznik na ziemi')).toBe('0,40 MH/h');
    expect(detail(view, 'Podstawa')).toBe('12 sesji · licznik obrotomierzowy');
    expect(view.details?.title).toBe('NORMA MOTOGODZIN');
  });

  it('licznik godzinowy oczekuje przyrostu równego czasowi blokowemu', () => {
    const hobbs = norm({
      mh: { kind: 'hobbs', perFlightHour: 1, perGroundHour: 1, ratioLow: 0.98, ratioHigh: 1.02, sessions: 20 },
    });
    // 1:43 pracy silnika × 1,00 → oczekiwane ≈ 1:43; odczyt +1:35 jest wtedy za niski.
    const view = mhBalance(session(), hobbs);

    expect(view.verdict?.label).toBe('↓ PONIŻEJ NORMY');
    expect(detail(view, 'Podstawa')).toContain('licznik godzinowy');
  });

  it('samolot bez przeliczników licznika nie dostaje zmyślonego pasma', () => {
    const view = mhBalance(session(), norm({ mh: null }));

    expect(view.totalValue).toBe('+1:35');
    expect(view.verdict).toBeNull();
    // Licznik nie ma drabiny do dokumentacji (issue #66) - żadna instrukcja nie podaje
    // przelicznika obrotomierza - więc mówi o przelicznikach, a nie o „normie" wprost.
    expect(view.naNote).toContain('nie ma jeszcze policzonych przeliczników licznika');
  });

  it('format licznika dziesiętnego przechodzi do wszystkich wartości', () => {
    const view = mhBalance(session({ mhFormat: 'decimal' }), norm());

    expect(view.rows[0]!.value).toBe('1234.5');
    expect(view.totalValue).toBe('+1.6');
  });
});

/**
 * NORMA Z DOKUMENTACJI NA EKRANIE SESJI (issue #66).
 *
 * Dwie role, obie z tego samego zgłoszenia: bez modelu maszyny liczba z instrukcji
 * JEST normą, a z modelem staje się WARTOŚCIĄ REFERENCYJNĄ, wobec której da się
 * zmierzyć odchyłkę - „za pomocą takiej średniej z instrukcji można badać, jakie jest
 * odchylenie nowej średniej oraz średniej z operacji od wartości referencyjnej".
 */
describe('norma z dokumentacji na karcie rachunku (issue #66)', () => {
  it('samolot bez modelu dostaje werdykt Z DOKUMENTACJI, a nie milczenie', () => {
    // 1:43 pracy silnika × 16 L/h ≈ 27,5 L; zużyto 27 L, więc mieści się w paśmie.
    const view = fuelBalance(session(), null, 2, 16);

    expect(view.verdict?.label).toBe('✓ W NORMIE');
    expect(view.naNote).toBeNull();
    expect(detail(view, 'Norma z dokumentacji')).toBe('16 L/h pracy silnika');
    // Podstawa mówi WPROST, skąd ta liczba - to najważniejsza różnica między tym
    // werdyktem a wszystkimi pozostałymi: pasmo jest zadeklarowane, nie zmierzone.
    expect(detail(view, 'Podstawa')).toBe('dokumentacja jednostki');
    expect(view.details?.summary).toContain('Pasmo pochodzi z dokumentacji jednostki');
  });

  it('MODEL WYGRYWA, a dokumentacja zostaje odniesieniem z odchyłką', () => {
    const view = fuelBalance(session(), norm(), 2, 20);

    // Stawki modelu zostają na swoim miejscu - dokumentacja niczego nie nadpisuje.
    expect(detail(view, 'Norma w locie')).toBe('20 L/h');
    expect(detail(view, 'Z dokumentacji')).toBe('20 L/h pracy silnika');
    // 27 L na 1:43 to 15,7 L/h → −21% wobec 20; norma maszyny 15 L/h → −25%.
    // Odchyłkę liczymy z wartości DOKŁADNEJ, nie z zaokrąglonej „16 L/h" z wiersza
    // wyżej - zaokrąglanie dwa razy dodaje błąd, którego nikt nie zamawiał.
    expect(detail(view, 'Odchyłka od dokumentacji')).toBe('ta sesja −21% · norma maszyny −25%');
  });

  it('bez wpisanej dokumentacji wiersze odniesienia NIE POWSTAJĄ', () => {
    const view = fuelBalance(session(), norm(), 2, null);

    expect(detail(view, 'Z dokumentacji')).toBeUndefined();
    expect(detail(view, 'Odchyłka od dokumentacji')).toBeUndefined();
  });

  it('brak obu norm mówi o OBU - drugą da się naprawić w panelu', () => {
    const view = fuelBalance(session(), null, 2, null);

    expect(view.verdict).toBeNull();
    expect(view.naNote).toContain('ani wpisanego spalania z dokumentacji');
  });
});
