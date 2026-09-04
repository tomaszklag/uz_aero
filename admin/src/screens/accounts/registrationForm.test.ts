/**
 * UZ Aero - panel 2.0: formularz zatwierdzenia zgłoszenia (`registrationForm.ts`).
 */

import { describe, expect, it } from 'vitest';

import type { RegistrationDto } from '../../api/dto';
import {
  approveBodyOf,
  proposeCode,
  registrationDraftOf,
  registrationVerdictOf,
} from './registrationForm';

const registration: RegistrationDto = {
  provider: 'google',
  subject: '1175',
  email: 'jan.kowalski@gmail.com',
  name: 'Jan Kowalski',
  status: 'pending',
  rejectReason: null,
  createdAt: '2026-09-04T09:38:00.000Z',
  lastLoginAt: null,
  decidedAt: null,
  decidedBy: null,
  pilotId: null,
  pilotCode: null,
};

describe('proposeCode - podpowiedź kodu z imienia', () => {
  it('bierze inicjały wszystkich członów, wersalikami', () => {
    expect(proposeCode('Jan Kowalski')).toBe('JK');
    expect(proposeCode('Anna Maria Nowak')).toBe('AMN');
  });

  it('nazwisko dwuczłonowe daje trzy litery - myślnik dzieli tak jak spacja', () => {
    expect(proposeCode('Jan Kowalski-Nowak')).toBe('JKN');
  });

  it('ogonki schodzą do ASCII - kod stoi w arkuszu klubu', () => {
    expect(proposeCode('Łukasz Żółć')).toBe('LZ');
    expect(proposeCode('Świętosław Ćma')).toBe('SC');
  });

  it('puste i „samo śmieci" dają pusty kod - formularz nie zgaduje', () => {
    expect(proposeCode('')).toBe('');
    expect(proposeCode('  ')).toBe('');
    expect(proposeCode('123 !!')).toBe('');
  });

  it('nie przekracza czterech liter - dłuższy kod przestaje być skrótem', () => {
    expect(proposeCode('Anna Barbara Celina Dorota Ewa')).toBe('ABCD');
  });
});

describe('registrationDraftOf', () => {
  it('imię z Google jest punktem wyjścia, kod z inicjałów, rola pilota', () => {
    expect(registrationDraftOf(registration)).toEqual({
      code: 'JK',
      name: 'Jan Kowalski',
      role: 'pilot',
    });
  });
});

describe('registrationVerdictOf', () => {
  it('kompletny szkic przechodzi bez ramek', () => {
    expect(registrationVerdictOf({ code: 'JK', name: 'Jan', role: 'pilot' })).toEqual({
      invalid: [],
      complete: true,
    });
  });

  it('puste pole blokuje BEZ czerwonej ramki - widać je z formularza', () => {
    expect(registrationVerdictOf({ code: '', name: 'Jan', role: 'pilot' })).toEqual({
      invalid: [],
      complete: false,
    });
    expect(registrationVerdictOf({ code: 'JK', name: '  ', role: 'pilot' })).toEqual({
      invalid: [],
      complete: false,
    });
  });

  it('kod spoza kształtu (znaki, długość) dostaje ramkę i blokuje', () => {
    expect(registrationVerdictOf({ code: 'J K!', name: 'Jan', role: 'pilot' })).toEqual({
      invalid: ['code'],
      complete: false,
    });
    expect(
      registrationVerdictOf({ code: 'ABCDEFGHIJKLM', name: 'Jan', role: 'pilot' }).invalid,
    ).toEqual(['code']);
  });
});

describe('approveBodyOf', () => {
  it('wysyła kod znormalizowany i imię przycięte, rolę bez zmian', () => {
    expect(approveBodyOf({ code: ' jk ', name: '  Jan Kowalski ', role: 'admin' })).toEqual({
      code: 'JK',
      name: 'Jan Kowalski',
      role: 'admin',
    });
  });
});
