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
import { CAPACITY_NOT_POSITIVE, OIL_MIN_ABOVE_CAPACITY } from './aircraftRefusal';

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
  openSessions: 0,
};

const filled = { ...EMPTY_AIRCRAFT, reg: 'SP-KLM', type: 'Cessna 182', capacityL: '1100' };

describe('rejestracja', () => {
  it('normalizuje do wersalików i przyjmuje myślnik', () => {
    expect(createBodyOf({ ...filled, reg: ' sp-klm ' }).reg).toBe('SP-KLM');
    expect(verdictOf({ ...filled, reg: 'sp-klm' }).blocker).toBeNull();
  });

  it('odrzuca spację i znaki spoza wzorca', () => {
    expect(verdictOf({ ...filled, reg: 'SP KLM' }).invalid).toContain('reg');
  });
});

describe('pojemność', () => {
  it('przyjmuje przecinek - tym samym parserem, co aplikacja pilota', () => {
    expect(capacityValue({ ...filled, capacityL: '1100,5' })).toBe(1100.5);
  });

  it('zero dostaje ZDANIE ODMOWY SERWERA, nie własne', () => {
    // Jedna reguła, jedno zdanie - powiedziane wcześniej, nie napisane drugi raz.
    expect(verdictOf({ ...filled, capacityL: '0' }).blocker).toBe(CAPACITY_NOT_POSITIVE);
  });

  it('wartość ujemna nie jest odczytem litrów i tak brzmi zdanie', () => {
    // `parseLitres` przyjmuje wyłącznie cyfry i separator dziesiętny - paliwomierz
    // nie pokazuje wartości ujemnych, więc „-5" nie jest pojemnością zmniejszoną,
    // tylko wpisem, którego nie da się odczytać. Zdanie ma mówić właśnie to.
    expect(verdictOf({ ...filled, capacityL: '-5' }).blocker).toBe('Pojemność w litrach, np. 1100.');
  });

  it('puste pole nie dostaje ZADNEGO zdania - brak widać w formularzu', () => {
    // Reguła z aplikacji pilota (issue #55). Zapisu i tak nie ma, ale przycisk milczy.
    const verdict = verdictOf({ ...filled, capacityL: '' });
    expect(verdict.complete).toBe(false);
    expect(verdict.blocker).toBeNull();
    expect(verdict.invalid).toEqual([]);
  });
});

describe('olej jest opcjonalny W CAŁOSCI', () => {
  it('trzy puste pola to poprawny formularz', () => {
    expect(verdictOf(filled).blocker).toBeNull();
    expect(createBodyOf(filled).oilMinL).toBeNull();
  });

  it('minimum większe od zbiornika blokuje zdaniem serwera', () => {
    const draft = { ...filled, oilMinL: '12', oilCapacityL: '8' };
    expect(verdictOf(draft).blocker).toBe(OIL_MIN_ABOVE_CAPACITY);
    expect(verdictOf(draft).invalid).toContain('oilMinL');
  });

  it('samo minimum, bez zbiornika, jest dozwolone', () => {
    expect(verdictOf({ ...filled, oilMinL: '8,5' }).blocker).toBeNull();
  });
});

describe('rok produkcji', () => {
  it('puste pole jest poprawne', () => {
    expect(verdictOf({ ...filled, year: '' }).blocker).toBeNull();
    expect(createBodyOf({ ...filled, year: '' }).year).toBe('');
  });

  it('odrzuca liczbę, która nie jest czterocyfrowym rokiem', () => {
    expect(verdictOf({ ...filled, year: '11' }).invalid).toContain('year');
    expect(verdictOf({ ...filled, year: '19,99' }).invalid).toContain('year');
  });
});

describe('ciało PATCH', () => {
  it('niesie wyłącznie zmienione pola', () => {
    const draft = { ...draftOf(aircraft), dualRequired: true };
    expect(updateBodyOf(aircraft, draft)).toEqual({ dualRequired: true });
  });

  it('otwarcie i zapisanie bez zmian nie jest zmianą', () => {
    expect(hasChanges(aircraft, draftOf(aircraft))).toBe(false);
  });

  it('ten sam zapis liczby innym napisem NIE jest zmianą', () => {
    // „1100" i „1100,0" to ta sama pojemność. Bez porównania wartości panel wysyłałby
    // zmianę, której nie było - i zostawiał po niej wpis w dzienniku audytu.
    expect(hasChanges(aircraft, { ...draftOf(aircraft), capacityL: '1100,0' })).toBe(false);
  });

  it('wyczyszczenie rocznika jedzie jako pusty napis, a oleju jako null', () => {
    const draft = { ...draftOf({ ...aircraft, oilMinL: 8 }), year: '', oilMinL: '' };
    const body = updateBodyOf({ ...aircraft, oilMinL: 8 }, draft);
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
    expect(updateBodyOf(seeded, draftOf(seeded))).toEqual({});
    expect(hasChanges(seeded, draftOf(seeded))).toBe(false);
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
