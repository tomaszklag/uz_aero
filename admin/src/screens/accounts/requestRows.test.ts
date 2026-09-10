import { describe, expect, it } from 'vitest';

import type { MembershipRequestDto } from '../../api/dto';
import { requestRow } from './requestRows';

const request = (over: Partial<MembershipRequestDto> = {}): MembershipRequestDto => ({
  pilotId: 'person-1',
  name: 'Michał Sowa',
  email: 'michal.sowa@gmail.com',
  requestedAt: '2026-09-06T18:22:00.000Z',
  ...over,
});

describe('wiersz kolejki zgłoszeń', () => {
  it('niesie imię z Google i chwilę zgłoszenia JAWNIE w UTC', () => {
    // Sufiks „UTC" nie jest ozdobą: panel nie ma innej strefy i mówi to przy każdym
    // stemplu - tak samo jak kolejka zgłoszeń błędów.
    expect(requestRow(request())).toEqual({
      pilotId: 'person-1',
      name: 'Michał Sowa',
      email: 'michal.sowa@gmail.com',
      waiting: '6 WRZ 18:22 UTC',
    });
  });

  it('brak adresu to KRESKA panelu, nie pusta komórka', () => {
    // Przy zgłoszeniu kodem adres jest zawsze (pochodzi z konta Google); kreska zostaje
    // dla wiersza z backfillu 1.x, gdzie kolumna osoby bywa pusta.
    expect(requestRow(request({ email: null })).email).toBe('—');
  });

  it('ADRESEM DECYZJI jest identyfikator OSOBY, nie kod pilota', () => {
    // Kandydat kodu jeszcze nie ma - dostaje go dopiero przy zatwierdzeniu.
    expect(requestRow(request()).pilotId).toBe('person-1');
    expect(requestRow(request())).not.toHaveProperty('code');
  });
});
