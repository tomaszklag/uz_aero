import { describe, expect, it } from 'vitest';

import {
  approvalBodyOf,
  approveVerdict,
  EMPTY_REQUEST,
  rejectVerdict,
  type RequestDraft,
} from './requestForm';

const draft = (over: Partial<RequestDraft> = {}): RequestDraft => ({ ...EMPTY_REQUEST, ...over });

describe('zatwierdzenie zgłoszenia', () => {
  it('KOD STARTUJE PUSTY - podpowiedziany wyglądałby jak nadany', () => {
    expect(EMPTY_REQUEST.code).toBe('');
    // Rola ma wartość domyślną, bo zgłaszający jest pilotem, dopóki klub nie postanowi
    // inaczej - a to jest wybór, którego brak niczego nie psuje.
    expect(EMPTY_REQUEST.role).toBe('pilot');
  });

  it('puste pole wymagane blokuje BEZ ZDANIA - widać je nad przyciskiem', () => {
    expect(approveVerdict(draft())).toEqual({
      invalidCode: false,
      complete: false,
      blocker: null,
    });
  });

  it('wpis nieczytelny dostaje ramkę I zdanie', () => {
    expect(approveVerdict(draft({ code: 'M S' }))).toEqual({
      invalidCode: true,
      complete: true,
      blocker: 'Kod pilota: tylko litery i cyfry.',
    });
    expect(approveVerdict(draft({ code: 'M' })).blocker).toBe('Kod pilota ma od 2 do 10 znaków.');
  });

  it('kod idzie WERSALIKAMI, jak wszędzie indziej w tym panelu', () => {
    expect(approvalBodyOf(draft({ code: ' mso ', role: 'admin' }))).toEqual({
      code: 'MSO',
      role: 'admin',
    });
  });
});

describe('odrzucenie zgłoszenia', () => {
  it('puste pole blokuje bez zdania, za krótkie - ze zdaniem', () => {
    // Pusty powód widać nad przyciskiem; wpis za krótki wygląda jak wypełniony, więc
    // sam widok pola nie mówi, czego brakuje.
    expect(rejectVerdict(draft()).blocker).toBeNull();
    expect(rejectVerdict(draft()).complete).toBe(false);
    expect(rejectVerdict(draft({ reason: 'x' })).blocker).toBe('Powód: co najmniej 3 znaki.');
  });

  it('sam odstęp to nadal pusty powód', () => {
    expect(rejectVerdict(draft({ reason: '   ' })).complete).toBe(false);
  });

  it('powód od trzech znaków przechodzi', () => {
    expect(rejectVerdict(draft({ reason: 'nie ten klub' }))).toEqual({
      invalidCode: false,
      complete: true,
      blocker: null,
    });
  });
});
