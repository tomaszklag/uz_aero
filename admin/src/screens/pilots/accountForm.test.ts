/**
 * UZ Aero — panel: walidacja formularza konta (`A06a`) i budowa ciała żądania.
 */

import { describe, expect, it } from 'vitest';

import type { PilotListItemDto } from '../../api/dto';
import {
  ROLE_OPTIONS,
  codeState,
  createBody,
  draftOf,
  emailState,
  formState,
  hasChanges,
  nameState,
  normalizeCode,
  updateBody,
  type AccountDraft,
} from './accountForm';

const pilot: PilotListItemDto = {
  id: 'id-1',
  code: 'KZA',
  name: 'Katarzyna Zawadzka',
  email: 'k.zawadzka@uzaero.pl',
  active: true,
  role: 'pilot',
  updatedAt: '2026-07-31T06:41:00.000Z',
  flyingDays: 6,
};

const draft = (over: Partial<AccountDraft> = {}): AccountDraft => ({
  name: 'Katarzyna Zawadzka',
  code: 'KZA',
  email: 'k.zawadzka@uzaero.pl',
  role: 'pilot',
  ...over,
});

describe('pole: imię i nazwisko', () => {
  it('puste odmawia z powodem, nie samym „niepoprawne"', () => {
    const state = nameState('   ');
    expect(state.ok).toBe(false);
    expect(state.message).toContain('wymagane');
  });

  it('jedna litera to za mało, sto jeden znaków to za dużo', () => {
    expect(nameState('X').ok).toBe(false);
    expect(nameState('X'.repeat(101)).ok).toBe(false);
    expect(nameState('Jan Kos').ok).toBe(true);
  });
});

describe('pole: kod pilota', () => {
  it('normalizuje do wersalików — „kza" i „KZA" to ten sam kod', () => {
    expect(normalizeCode(' kza ')).toBe('KZA');
    expect(codeState('kza').ok).toBe(true);
  });

  it('spacja i myślnik są odrzucone z konkretnym powodem', () => {
    expect(codeState('K ZA').message).toContain('litery i cyfry');
    expect(codeState('K-ZA').ok).toBe(false);
  });

  it('długość poza 2–10 odpada', () => {
    expect(codeState('K').ok).toBe(false);
    expect(codeState('ABCDEFGHIJK').ok).toBe(false);
    expect(codeState('SP1').ok).toBe(true);
  });
});

describe('pole: e-mail', () => {
  it('puste jest DOZWOLONE — loginem bywa sam kod pilota', () => {
    expect(emailState('').ok).toBe(true);
    expect(emailState('   ').ok).toBe(true);
  });

  it('adres bez małpy albo bez kropki odpada', () => {
    expect(emailState('nie-email').ok).toBe(false);
    expect(emailState('a@b').ok).toBe(false);
    expect(emailState('a@b.pl').ok).toBe(true);
  });
});

describe('stan całego formularza', () => {
  it('poprawny szkic wolno wysłać, bez powodu blokady', () => {
    expect(formState(draft())).toMatchObject({ ok: true, reason: null });
  });

  it('jedno złe pole blokuje CAŁY zapis i podaje powód', () => {
    const state = formState(draft({ code: 'K ZA' }));
    expect(state.ok).toBe(false);
    expect(state.reason).not.toBeNull();
    expect(state.code.ok).toBe(false);
    expect(state.name.ok).toBe(true);
  });
});

describe('ciało żądania', () => {
  it('`POST` niesie tożsamość i rolę — i NIE niesie hasła', () => {
    const body = createBody(draft({ code: ' kza ', name: '  Katarzyna Zawadzka  ' }));
    expect(body).toEqual({
      code: 'KZA',
      name: 'Katarzyna Zawadzka',
      email: 'k.zawadzka@uzaero.pl',
      role: 'pilot',
    });
    expect(Object.keys(body)).not.toContain('password');
  });

  it('`PATCH` niesie WYŁĄCZNIE pola zmienione', () => {
    expect(updateBody(pilot, draft({ role: 'admin' }))).toEqual({ role: 'admin' });
    expect(updateBody(pilot, draft({ name: 'Katarzyna Nowak' }))).toEqual({
      name: 'Katarzyna Nowak',
    });
  });

  it('brak zmian → puste ciało, a przycisk ma być zablokowany', () => {
    // Serwer odmówiłby `no_changes`, a dziennik audytu dostałby wpis o niczym.
    expect(updateBody(pilot, draftOf(pilot))).toEqual({});
    expect(hasChanges(pilot, draftOf(pilot))).toBe(false);
  });

  it('sama zmiana wielkości liter w kodzie to NIE jest zmiana', () => {
    expect(hasChanges(pilot, draft({ code: 'kza' }))).toBe(false);
  });

  it('wyczyszczenie e-maila jest zmianą na pusty napis, nie pominięciem pola', () => {
    expect(updateBody(pilot, draft({ email: '' }))).toEqual({ email: '' });
    expect(updateBody({ ...pilot, email: null }, draft({ email: '' }))).toEqual({});
  });
});

describe('opisy ról', () => {
  it('trzy role, od najmniejszych uprawnień', () => {
    expect(ROLE_OPTIONS.map((r) => r.id)).toEqual(['pilot', 'training_lead', 'admin']);
  });

  it('każda ma opis, bo to jedyne miejsce, gdzie czyta się, co rola oznacza', () => {
    for (const option of ROLE_OPTIONS) {
      expect(option.desc.length).toBeGreaterThan(40);
    }
  });
});
