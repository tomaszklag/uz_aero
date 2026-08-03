/**
 * UZ Aero — panel: formularz samolotu (`A07a`) — walidacja i szkic.
 *
 * Reguły są LUSTREM reguł serwera; test pilnuje, żeby lustro nie było krzywe —
 * inaczej formularz przepuszcza dane, które serwer odrzuci bez wyjaśnienia.
 */

import { describe, expect, it } from 'vitest';

import type { AircraftListItemDto } from '../../api/dto';
import {
  EMPTY_DRAFT,
  capacityState,
  createBody,
  draftOf,
  formState,
  hasChanges,
  normalizeReg,
  parseCapacity,
  regState,
  typeState,
  updateBody,
  yearState,
  type AircraftDraft,
} from './aircraftForm';

const dto = (over: Partial<AircraftListItemDto> = {}): AircraftListItemDto => ({
  id: 'ac-1',
  reg: 'SP-KLM',
  type: 'Cessna 208 Caravan',
  year: 2011,
  capacityL: 1257,
  fuelToleranceL: 62.85,
  mhFormat: 'decimal',
  dualRequired: true,
  serviceStatus: 'active',
  updatedAt: '2026-07-30T18:41:00.000Z',
  claim: null,
  reading: null,
  lastEventAt: null,
  openSessions: 0,
  openFlags: 0,
  ...over,
});

const draft = (over: Partial<AircraftDraft> = {}): AircraftDraft => ({
  ...draftOf(dto()),
  ...over,
});

describe('rejestracja', () => {
  it('normalizujemy do WERSALIKÓW — indeks UNIQUE jest wrażliwy na wielkość', () => {
    expect(normalizeReg('  sp-klm ')).toBe('SP-KLM');
    expect(regState('sp-klm').ok).toBe(true);
  });

  it('puste pole i zły znak dostają POWÓD, nie samo „niepoprawne"', () => {
    expect(regState('').message).toContain('wymagana');
    expect(regState('SP KLM').message).toContain('myślnik');
    expect(regState('SP').ok).toBe(false);
  });
});

describe('typ i rok', () => {
  it('typ jest wymagany', () => {
    expect(typeState('').ok).toBe(false);
    expect(typeState('Aero AT-3').ok).toBe(true);
  });

  it('rok może zostać PUSTY — tabliczka bez daty to realny przypadek', () => {
    expect(yearState('').ok).toBe(true);
    expect(yearState('2011').ok).toBe(true);
  });

  it('rok spoza zakresu i nie-cyfry są odrzucane', () => {
    expect(yearState('11').ok).toBe(false);
    expect(yearState('1800').ok).toBe(false);
    expect(yearState('rok').ok).toBe(false);
  });
});

describe('pojemność', () => {
  it('przyjmuje przecinek i spacje — pole wypełnia człowiek, nie parser JSON-a', () => {
    expect(parseCapacity('1 100')).toBe(1100);
    expect(parseCapacity('1100,5')).toBe(1100.5);
  });

  it('wpis nieczytelny daje `null`, a nie zgadniętą liczbę', () => {
    expect(parseCapacity('dużo')).toBeNull();
    expect(parseCapacity('')).toBeNull();
  });

  it('zero jest odrzucane Z POWODEM — to od tej liczby zależy próg flagi', () => {
    const state = capacityState('0');
    expect(state.ok).toBe(false);
    expect(state.message).toContain('FUEL_MISMATCH');
  });
});

describe('stan formularza', () => {
  it('pusty formularz nie przechodzi i mówi dlaczego', () => {
    const state = formState(EMPTY_DRAFT);
    expect(state.ok).toBe(false);
    expect(state.reason).not.toBeNull();
  });

  it('wypełniony poprawnie przechodzi bez powodu blokady', () => {
    const state = formState(draft());
    expect(state.ok).toBe(true);
    expect(state.reason).toBeNull();
  });
});

describe('szkic → ciało żądania', () => {
  it('`POST` niesie znormalizowaną rejestrację i pojemność jako liczbę', () => {
    expect(createBody(draft({ reg: 'sp-nowy', capacity: '1 100', year: '' }))).toEqual({
      reg: 'SP-NOWY',
      type: 'Cessna 208 Caravan',
      year: '',
      capacityL: 1100,
      mhFormat: 'decimal',
      dualRequired: true,
      serviceStatus: 'active',
    });
  });

  it('`PATCH` niesie WYŁĄCZNIE pola zmienione — dziennik audytu zapisuje diff', () => {
    const before = dto();
    expect(updateBody(before, draft({ capacity: '1100' }))).toEqual({ capacityL: 1100 });
  });

  it('bez zmiany `PATCH` jest pusty, a przycisk „Zapisz" ma być zgaszony', () => {
    const before = dto();
    expect(updateBody(before, draft())).toEqual({});
    expect(hasChanges(before, draft())).toBe(false);
  });

  it('wyczyszczony rok jedzie jako pusty napis — „nie wiadomo", nie „rok 0"', () => {
    const before = dto({ year: 2011 });
    expect(updateBody(before, draft({ year: '' }))).toEqual({ year: '' });
  });

  it('pojemność NIECZYTELNA nie trafia do `PATCH`-a — lepiej nie wysłać niż zgadnąć', () => {
    const before = dto();
    expect(updateBody(before, draft({ capacity: 'dużo' }))).toEqual({});
  });

  it('zmiana samej wielkości liter w rejestracji NIE jest zmianą', () => {
    const before = dto({ reg: 'SP-KLM' });
    expect(hasChanges(before, draft({ reg: 'sp-klm' }))).toBe(false);
  });

  it('wyłączenie ze służby jedzie jako pole formularza, nie osobną akcją', () => {
    const before = dto();
    expect(updateBody(before, draft({ serviceStatus: 'disabled' }))).toEqual({
      serviceStatus: 'disabled',
    });
  });
});
