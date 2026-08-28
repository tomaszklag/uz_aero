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
  oilMinL: null,
  oilCapacityL: null,
  oilNormLPerH: null,
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
      // Olej (issue #60): nieskonfigurowany jedzie jako JAWNE nulle — moduł milczy.
      oilMinL: null,
      oilCapacityL: null,
      oilNormLPerH: null,
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

// ── konfiguracja oleju (issue #60, etap D) ──────────────────────────────────────

describe('pola oleju — lustro `fleetGuards.refuseOil`', () => {
  it('puste pola są legalne (moduł milczy), a szkic wysyła jawne nulle przy tworzeniu', () => {
    const draft = { ...EMPTY_DRAFT, reg: 'SP-OIL', type: 'Cessna 182', capacity: '330' };
    expect(formState(draft).ok).toBe(true);
    expect(createBody(draft)).toMatchObject({ oilMinL: null, oilCapacityL: null, oilNormLPerH: null });
  });

  it('wpisane wartości parsują polski przecinek i wchodzą do ciała', () => {
    const draft = {
      ...EMPTY_DRAFT,
      reg: 'SP-OIL',
      type: 'Cessna 182',
      capacity: '330',
      oilMin: '8,5',
      oilCapacity: '11,4',
      oilNorm: '0,12',
    };
    expect(formState(draft).ok).toBe(true);
    expect(createBody(draft)).toMatchObject({ oilMinL: 8.5, oilCapacityL: 11.4, oilNormLPerH: 0.12 });
  });

  it('zero i śmieci odbijają z powodem pod POLEM, minimum ponad zbiornik — pod PARĄ', () => {
    const zero = formState({ ...EMPTY_DRAFT, reg: 'SP-OIL', type: 'C182', capacity: '330', oilMin: '0' });
    expect(zero.ok).toBe(false);
    expect(zero.oilMin.message).toContain('większe od zera');

    const garbage = formState({ ...EMPTY_DRAFT, reg: 'SP-OIL', type: 'C182', capacity: '330', oilNorm: 'dużo' });
    expect(garbage.oilNorm.ok).toBe(false);

    const inverted = formState({
      ...EMPTY_DRAFT,
      reg: 'SP-OIL',
      type: 'C182',
      capacity: '330',
      oilMin: '12',
      oilCapacity: '10',
    });
    expect(inverted.ok).toBe(false);
    expect(inverted.oilPair.message).toContain('nie może przekraczać zbiornika');
  });

  it('PATCH: wyczyszczone pole jedzie jako jawny null, pominięta zmiana nie jedzie wcale', () => {
    const before = dto({ oilMinL: 8.5, oilCapacityL: 11.4, oilNormLPerH: 0.12 });
    const draft = draftOf(before);
    expect(draft.oilMin).toBe('8,5');

    // Bez zmian — ciało puste (serwer odmawia `no_changes`).
    expect(updateBody(before, draft)).toEqual({});

    // Wyczyszczenie minimum = jawny null; reszta pól nietknięta.
    expect(updateBody(before, { ...draft, oilMin: '' })).toEqual({ oilMinL: null });

    // Zmiana wartości = liczba.
    expect(updateBody(before, { ...draft, oilNorm: '0,15' })).toEqual({ oilNormLPerH: 0.15 });
  });
});
