import { describe, expect, it } from 'vitest';

import type { AircraftListItemDto } from '../../api/dto';
import {
  capacityValue,
  createBodyOf,
  deleteBlocker,
  disablesAircraftInUse,
  draftKey,
  draftOf,
  EMPTY_AIRCRAFT,
  hasChanges,
  updateBodyOf,
  verdictOf,
} from './aircraftForm';
import {
  CAPACITY_NOT_POSITIVE,
  INITIAL_FUEL_OVER_CAPACITY,
  OIL_MIN_ABOVE_CAPACITY,
  OIL_NOT_POSITIVE,
} from './aircraftRefusal';

const aircraft: AircraftListItemDto = {
  id: 'a-1',
  reg: 'SP-KLM',
  type: 'Cessna 182',
  year: 2011,
  capacityL: 1100,
  fuelToleranceL: 55,
  mhFormat: 'decimal',
  dualRequired: false,
  serviceStatus: 'active',
  oilMinL: null,
  oilCapacityL: null,
  oilNormLPerH: null,
  fuelNormLPerH: null,
  initialMh: null,
  initialFuelL: null,
  initialOilL: null,
  reading: null,
  openSessions: 0,
};

/**
 * KOMPLET pól wymaganych (uwagi do issue #66: olej, normy i „Aktualny stan" nie są
 * opcjonalne). Testy blokad podmieniają jedno pole na tym szkicu, żeby werdykt mówił
 * o badanej regule, a nie o brakach obok.
 */
const filled = {
  ...EMPTY_AIRCRAFT,
  reg: 'SP-KLM',
  type: 'Cessna 182',
  capacityL: '1100',
  oilMinL: '8,5',
  oilCapacityL: '11,4',
  oilNormLPerH: '0,12',
  fuelNormLPerH: '18,5',
  initialMh: '1236,5',
  initialFuelL: '112',
  initialOilL: '8,2',
};

describe('rejestracja', () => {
  it('normalizuje do wersalików i przyjmuje myślnik', () => {
    expect(createBodyOf({ ...filled, reg: ' sp-klm ' }).reg).toBe('SP-KLM');
    expect(verdictOf({ ...filled, reg: 'sp-klm' }, 'required').blocker).toBeNull();
  });

  it('odrzuca spację i znaki spoza wzorca', () => {
    expect(verdictOf({ ...filled, reg: 'SP KLM' }, 'required').invalid).toContain('reg');
  });
});

describe('pojemność', () => {
  it('przyjmuje przecinek - tym samym parserem, co aplikacja pilota', () => {
    expect(capacityValue({ ...filled, capacityL: '1100,5' })).toBe(1100.5);
  });

  it('zero dostaje ZDANIE ODMOWY SERWERA, nie własne', () => {
    // Jedna reguła, jedno zdanie - powiedziane wcześniej, nie napisane drugi raz.
    expect(verdictOf({ ...filled, capacityL: '0' }, 'required').blocker).toBe(
      CAPACITY_NOT_POSITIVE,
    );
  });

  it('wartość ujemna nie jest odczytem litrów i tak brzmi zdanie', () => {
    // `parseLitres` przyjmuje wyłącznie cyfry i separator dziesiętny - paliwomierz
    // nie pokazuje wartości ujemnych, więc „-5" nie jest pojemnością zmniejszoną,
    // tylko wpisem, którego nie da się odczytać. Zdanie ma mówić właśnie to.
    expect(verdictOf({ ...filled, capacityL: '-5' }, 'required').blocker).toBe(
      'Pojemność w litrach, np. 1100.',
    );
  });

  it('puste pole nie dostaje ZADNEGO zdania - brak widać w formularzu', () => {
    // Reguła z aplikacji pilota (issue #55). Zapisu i tak nie ma, ale przycisk milczy.
    const verdict = verdictOf({ ...filled, capacityL: '' }, 'required');
    expect(verdict.complete).toBe(false);
    expect(verdict.blocker).toBeNull();
    expect(verdict.invalid).toEqual([]);
  });
});

/**
 * OLEJ I NORMY SĄ WYMAGANE (uwagi do issue #66, pkt 1 i 5) - odwraca decyzję
 * z issue #60, w której puste pola znaczyły „nie prowadzimy".
 */
describe('olej i normy z dokumentacji są WYMAGANE', () => {
  it('komplet pól przechodzi', () => {
    const verdict = verdictOf(filled, 'required');
    expect(verdict.complete).toBe(true);
    expect(verdict.blocker).toBeNull();
    expect(verdict.invalid).toEqual([]);
  });

  it('puste pole blokuje BRAKIEM, bez zdania i bez ramki', () => {
    // Brak widać w formularzu nad przyciskiem (issue #55) - przycisk po prostu milczy.
    for (const field of ['oilMinL', 'oilCapacityL', 'oilNormLPerH', 'fuelNormLPerH'] as const) {
      const verdict = verdictOf({ ...filled, [field]: '' }, 'required');
      expect(verdict.complete).toBe(false);
      expect(verdict.blocker).toBeNull();
      expect(verdict.invalid).toEqual([]);
    }
  });

  it('wymóg obowiązuje TAKŻE przy edycji - stary wiersz z pustym olejem nie zapisze się', () => {
    expect(verdictOf({ ...filled, oilNormLPerH: '' }, 'editable').complete).toBe(false);
    expect(verdictOf({ ...filled, oilNormLPerH: '' }, 'locked').complete).toBe(false);
  });

  it('zero dostaje zdanie odmowy serwera - norma zerowa jest literówką', () => {
    expect(verdictOf({ ...filled, oilNormLPerH: '0' }, 'required').blocker).toBe(OIL_NOT_POSITIVE);
    expect(verdictOf({ ...filled, fuelNormLPerH: '0' }, 'required').invalid).toContain(
      'fuelNormLPerH',
    );
  });

  it('minimum większe od zbiornika blokuje zdaniem serwera', () => {
    const draft = { ...filled, oilMinL: '12', oilCapacityL: '8' };
    expect(verdictOf(draft, 'required').blocker).toBe(OIL_MIN_ABOVE_CAPACITY);
    expect(verdictOf(draft, 'required').invalid).toContain('oilMinL');
  });
});

describe('rok produkcji', () => {
  it('puste pole jest poprawne', () => {
    expect(verdictOf({ ...filled, year: '' }, 'required').blocker).toBeNull();
    expect(createBodyOf({ ...filled, year: '' }).year).toBe('');
  });

  it('odrzuca liczbę, która nie jest czterocyfrowym rokiem', () => {
    expect(verdictOf({ ...filled, year: '11' }, 'required').invalid).toContain('year');
    expect(verdictOf({ ...filled, year: '19,99' }, 'required').invalid).toContain('year');
  });
});

describe('ciało PATCH', () => {
  it('niesie wyłącznie zmienione pola', () => {
    const draft = { ...draftOf(aircraft), dualRequired: true };
    expect(updateBodyOf(aircraft, draft, 'editable')).toEqual({ dualRequired: true });
  });

  it('otwarcie i zapisanie bez zmian nie jest zmianą', () => {
    expect(hasChanges(aircraft, draftOf(aircraft), 'editable')).toBe(false);
    expect(hasChanges(aircraft, draftOf(aircraft), 'locked')).toBe(false);
  });

  it('ten sam zapis liczby innym napisem NIE jest zmianą', () => {
    // „1100" i „1100,0" to ta sama pojemność. Bez porównania wartości panel wysyłałby
    // zmianę, której nie było - i zostawiał po niej wpis w dzienniku audytu.
    expect(hasChanges(aircraft, { ...draftOf(aircraft), capacityL: '1100,0' }, 'editable')).toBe(
      false,
    );
  });

  it('wyczyszczenie rocznika jedzie jako pusty napis, a oleju jako null', () => {
    const draft = { ...draftOf({ ...aircraft, oilMinL: 8 }), year: '', oilMinL: '' };
    const body = updateBodyOf({ ...aircraft, oilMinL: 8 }, draft, 'editable');
    expect(body.year).toBe('');
    expect(body.oilMinL).toBeNull();
  });
});

describe('kiedy wolno usunąć jednostkę', () => {
  it('poza służbą - próba ma sens', () => {
    expect(deleteBlocker({ ...aircraft, serviceStatus: 'disabled' })).toBeNull();
  });

  it('W SŁUŻBIE blokuje - i to jest ważniejsze niż przy koncie', () => {
    // Telefon nie kasuje wierszy: maszyna usunięta „na gorąco" zostałaby na nim jako
    // W SŁUŻBIE, czyli WYBIERALNA - pilot zacząłby lot na jednostce, której serwer
    // nie zna. Wyłączenie ze służby aplikacja rozumie i blokuje wybór.
    expect(deleteBlocker(aircraft)).toBe('Najpierw wyłącz samolot ze służby.');
  });

  it('pyta o stan ZAPISANY, nie o szkic', () => {
    // Dopóki „Wyłączony" nie jest zapisane, telefony o tym nie wiedzą - a na nich
    // opiera się cała dwustopniowość tej operacji.
    expect(deleteBlocker(aircraft)).not.toBeNull();
  });
});

describe('klucz synchronizacji szkicu', () => {
  it('BRAK klucza, dopóki jednostki nie ma na liście', () => {
    // Wejście z linku: szuflada montuje się PRZED listą. Bez tego formularz zostawał
    // pusty nad samolotem, który istnieje.
    expect(draftKey(false, null)).toBeNull();
    expect(draftKey(true, null)).toBe('nowy');
  });

  it('klucz to TOŻSAMOŚĆ jednostki, więc odświeżenie listy go nie rusza', () => {
    expect(draftKey(false, aircraft)).toBe('a-1');
    expect(draftKey(false, { ...aircraft, capacityL: 900 })).toBe('a-1');
  });
});

describe('rejestracja zapisana małymi literami', () => {
  it('NIE udaje zmiany', () => {
    // Ta sama pułapka, co przy kodzie pilota: wiersz założony z pominięciem trasy
    // (seed, `INSERT` ręką) ma małe litery, a wpis jest normalizowany.
    const seeded = { ...aircraft, reg: 'sp-klm' };
    expect(updateBodyOf(seeded, draftOf(seeded), 'editable')).toEqual({});
    expect(hasChanges(seeded, draftOf(seeded), 'editable')).toBe(false);
  });
});

describe('wyłączenie jednostki, na której ktoś lata', () => {
  const busy = { ...aircraft, openSessions: 1 };

  it('jest rozpoznane PRZED wysłaniem żądania', () => {
    expect(disablesAircraftInUse(busy, { ...draftOf(busy), serviceStatus: 'disabled' })).toBe(true);
  });

  it('nie dotyczy jednostki już wyłączonej ani zmiany innego pola', () => {
    const disabled = { ...busy, serviceStatus: 'disabled' as const };
    expect(disablesAircraftInUse(disabled, draftOf(disabled))).toBe(false);
    expect(disablesAircraftInUse(busy, { ...draftOf(busy), type: 'An-2' })).toBe(false);
  });

  it('wolna jednostka wyłącza się bez przeszkód', () => {
    expect(
      disablesAircraftInUse(aircraft, { ...draftOf(aircraft), serviceStatus: 'disabled' }),
    ).toBe(false);
  });
});

/**
 * „AKTUALNY STAN" (dawny stan początkowy, issue #66 + uwagi).
 *
 * Dwa rodzaje liczb w jednym formularzu i to jest tu najważniejsze do przypilnowania:
 * norma zerowa jest LITERÓWKĄ (silnik bez paliwa nie istnieje), a stan zerowy -
 * zwyczajnym faktem (nowy silnik, puste zbiorniki). Sklejenie tych dwóch reguł
 * odebrałoby klubowi możliwość wpisania maszyny prosto z remontu.
 */
describe('„Aktualny stan" (issue #66 + uwagi)', () => {
  it('przy tworzeniu jest WYMAGANY, przy edycji już nie', () => {
    // Zamówienie z issue #66: „jak dodaję samolot to powinno być pole w którym wpiszę
    // startowy stan…" - a uwagi z przeglądu zrobiły z opcji wymóg. Przy edycji wymóg
    // blokowałby niezwiązaną poprawkę (np. wyłączenie ze służby) na starym wierszu.
    expect(verdictOf({ ...filled, initialMh: '' }, 'required').complete).toBe(false);
    expect(verdictOf({ ...filled, initialMh: '' }, 'editable').complete).toBe(true);
  });

  it('stan zerowy przechodzi - zero jest tu WARTOŚCIĄ, nie literówką', () => {
    const fresh = verdictOf(
      { ...filled, initialMh: '0', initialFuelL: '0', initialOilL: '0' },
      'required',
    );
    expect(fresh.invalid).toEqual([]);
    expect(fresh.blocker).toBeNull();
    expect(createBodyOf({ ...filled, initialMh: '0', initialFuelL: '0' })).toMatchObject({
      initialMh: 0,
      initialFuelL: 0,
    });
  });

  it('paliwo ponad zbiornik mówi TYM SAMYM zdaniem, co serwer', () => {
    const over = verdictOf({ ...filled, initialFuelL: '2000' }, 'required');
    expect(over.invalid).toContain('initialFuelL');
    expect(over.blocker).toBe(INITIAL_FUEL_OVER_CAPACITY);
  });

  it('olej mierzy się ZBIORNIKIEM OLEJU, nie zbiornikiem paliwa', () => {
    // 12 L oleju mieści się w 1100 L paliwa i właśnie dlatego sufit musi być własny.
    const over = verdictOf({ ...filled, oilCapacityL: '11.4', initialOilL: '12' }, 'required');
    expect(over.invalid).toContain('initialOilL');
  });

  it('w trybie LOCKED pól stanu nie ocenia się wcale', () => {
    // Pola są na ekranie do odczytu (wartości z dziennika), więc szkic `initial*`
    // to martwy zapis z bazy - błąd na nim wskazywałby pole, którego nie widać.
    const over = { ...filled, initialFuelL: '2000' };
    expect(verdictOf(over, 'locked').invalid).toEqual([]);
    expect(verdictOf(over, 'locked').blocker).toBeNull();
  });

  it('w trybie LOCKED PATCH nie niesie pól stanu', () => {
    // Formatowanie licznika do napisu bywa stratne („1236.55" → „1236.6"), więc
    // wykluczenie jest twarde, a nie „i tak się nie zmieni".
    const before = { ...aircraft, initialMh: 1236.55, initialFuelL: 112 };
    const draft = { ...draftOf(before), dualRequired: true };
    expect(updateBodyOf(before, draft, 'locked')).toEqual({ dualRequired: true });

    // W trybie EDITABLE zmiana stanu przenosi się normalnie (wartość okrągła, żeby
    // test mówił o wykluczeniu, a nie o stratnym formatowaniu z wiersza wyżej).
    const exact = { ...aircraft, initialMh: 1236.5, initialFuelL: 112 };
    const edited = { ...draftOf(exact), initialFuelL: '90' };
    expect(updateBodyOf(exact, edited, 'editable')).toEqual({ initialFuelL: 90 });
  });

  it('licznik przyjmuje OBA zapisy i wychodzi zawsze dziesiętny', () => {
    // Administrator przepisuje liczbę z tarczy i nie ma się zastanawiać, jak
    // jednostka jest skonfigurowana.
    expect(createBodyOf({ ...filled, initialMh: '1236:30' }).initialMh).toBe(1236.5);
    expect(createBodyOf({ ...filled, initialMh: '1236,5' }).initialMh).toBe(1236.5);
    expect(verdictOf({ ...filled, initialMh: 'abc' }, 'required').invalid).toContain('initialMh');
  });

  it('licznik WRACA do pola w formacie tej maszyny, nie zawsze dziesiętnie', () => {
    const hhmm = { ...aircraft, mhFormat: 'hhmm' as const, initialMh: 1236.5 };
    expect(draftOf(hhmm).initialMh).toBe('1236:30');
    expect(draftOf({ ...aircraft, initialMh: 1236.5 }).initialMh).toBe('1236.5');
    // Odczyt → pole → z powrotem nie może udawać zmiany, bo dopisałby do dziennika
    // audytu wpis o poprawce, której nie było.
    expect(hasChanges(hhmm, draftOf(hhmm), 'editable')).toBe(false);
  });

  it('PATCH niesie tylko to, co ruszone - reszta pól zostaje po staremu', () => {
    const body = updateBodyOf(aircraft, { ...draftOf(aircraft), fuelNormLPerH: '18,5' }, 'editable');
    expect(body).toEqual({ fuelNormLPerH: 18.5 });
  });
});
