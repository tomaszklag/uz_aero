/**
 * UZ Aero - treść ekranów 00c/00d (`ui/screens/logic/registrationView.ts`).
 */

import type { RemoteRegistration } from '../application/ports';
import { initialsOf, registrationView, whenLabel } from '../ui/screens/logic/registrationView';

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0); // 4 września 2026, 12:00 UTC

const pending: RemoteRegistration = {
  provider: 'google',
  name: 'Tomasz Małkiewicz',
  email: 't.malkiewicz@gmail.com',
  status: 'pending',
  rejectReason: null,
  createdAt: '2026-09-04T09:38:00.000Z',
  decidedAt: null,
};

describe('whenLabel', () => {
  it('ta sama doba UTC: „dziś HH:MM UTC"', () => {
    expect(whenLabel('2026-09-04T09:38:00.000Z', NOW)).toBe('dziś 09:38 UTC');
  });

  it('inna doba: data z formatu wspólnego (dzień, skrót miesiąca, godzina)', () => {
    expect(whenLabel('2026-09-03T14:20:00.000Z', NOW)).toBe('3 WRZ 14:20 UTC');
  });

  it('doba liczy się w UTC - 23:59 wczoraj nie jest „dziś"', () => {
    expect(whenLabel('2026-09-03T23:59:00.000Z', NOW)).not.toContain('dziś');
  });
});

describe('initialsOf', () => {
  it('dwa pierwsze człony, wersalikami', () => {
    expect(initialsOf('Tomasz Małkiewicz')).toBe('TM');
    expect(initialsOf('anna maria nowak')).toBe('AM');
  });

  it('jeden człon daje jedną literę; pusty - znak zapytania', () => {
    expect(initialsOf('Madonna')).toBe('M');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('registrationView', () => {
  it('zgłoszenie czeka: tytuł, instrukcja, kiedy zgłoszono, bez powodu', () => {
    const view = registrationView(pending, NOW);
    expect(view.rejected).toBe(false);
    expect(view.title).toBe('CZEKA NA ZATWIERDZENIE');
    expect(view.body).toContain('nadać Ci kod pilota');
    expect(view.meta).toBe('Zgłoszono dziś 09:38 UTC');
    expect(view.initials).toBe('TM');
    expect(view.reason).toBeNull();
  });

  it('odrzucone: cytuje POWÓD administratora i chwilę decyzji', () => {
    const view = registrationView(
      {
        ...pending,
        status: 'rejected',
        rejectReason: 'To konto prywatne - zgłoś się adresem klubowym.',
        decidedAt: '2026-09-03T14:20:00.000Z',
      },
      NOW,
    );
    expect(view.rejected).toBe(true);
    expect(view.title).toBe('ZGŁOSZENIE ODRZUCONE');
    expect(view.reason).toBe('To konto prywatne - zgłoś się adresem klubowym.');
    expect(view.meta).toBe('Decyzja 3 WRZ 14:20 UTC');
  });

  it('odrzucone bez stempla decyzji (stary serwer) nie zostaje bez daty', () => {
    const view = registrationView({ ...pending, status: 'rejected', rejectReason: 'x' }, NOW);
    expect(view.meta).toBe('Decyzja dziś 09:38 UTC');
  });
});
