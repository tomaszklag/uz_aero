/**
 * UZ Aero (serwer) — zakazy przy zmianach na kontach (`domain/accountGuards.ts`).
 *
 * Testy bez bazy i bez HTTP, bo reguła jest czysta: wejściem jest „kto, komu, z jakiej
 * roli na jaką i ilu jest jeszcze administratorów". Wersja przez `app.inject` żyje
 * w `adminAccounts.test.ts` i sprawdza co innego — że brama naprawdę tych funkcji
 * używa i że odmowa dojeżdża do klienta z powodem.
 *
 * Scenariusz, dla którego to w ogóle istnieje, wydarzył się 2026-08-01: administrator
 * bez dostępu, zero ścieżek naprawy w produkcie. Konto odcięte jednym kliknięciem
 * wraca dokładnie do tamtej sytuacji.
 */

import { describe, expect, it } from 'vitest';

import {
  refuseDeactivate,
  refusePasswordReset,
  refuseRoleChange,
} from '../src/domain/accountGuards.ts';

describe('odebranie roli', () => {
  it('administrator nie odbiera roli SOBIE — nawet gdy są inni administratorzy', () => {
    expect(
      refuseRoleChange({
        actorPilotId: 'TMK',
        targetPilotId: 'TMK',
        currentRole: 'admin',
        nextRole: 'pilot',
        targetActive: true,
        activeAdmins: 3,
      }),
    ).toBe('self_demote');
  });

  it('OSTATNI aktywny administrator nie traci roli', () => {
    expect(
      refuseRoleChange({
        actorPilotId: 'TMK',
        targetPilotId: 'AKO',
        currentRole: 'admin',
        nextRole: 'training_lead',
        targetActive: true,
        activeAdmins: 1,
      }),
    ).toBe('last_admin');
  });

  it('przedostatni administrator rolę traci — blokada dotyczy ostatniego, nie każdego', () => {
    expect(
      refuseRoleChange({
        actorPilotId: 'TMK',
        targetPilotId: 'AKO',
        currentRole: 'admin',
        nextRole: 'pilot',
        targetActive: true,
        activeAdmins: 2,
      }),
    ).toBeNull();
  });

  it('administrator NIEAKTYWNY nie liczy się do puli — jego degradacja nikogo nie odcina', () => {
    expect(
      refuseRoleChange({
        actorPilotId: 'TMK',
        targetPilotId: 'MDB',
        currentRole: 'admin',
        nextRole: 'pilot',
        targetActive: false,
        activeAdmins: 1,
      }),
    ).toBeNull();
  });

  it('NADANIE roli nigdy nie jest blokowane — nie zmniejsza liczby naprawiających', () => {
    expect(
      refuseRoleChange({
        actorPilotId: 'TMK',
        targetPilotId: 'PWI',
        currentRole: 'pilot',
        nextRole: 'admin',
        targetActive: true,
        activeAdmins: 1,
      }),
    ).toBeNull();
  });

  it('zmiana roli na tę samą to brak zmiany, a nie odmowa', () => {
    expect(
      refuseRoleChange({
        actorPilotId: 'TMK',
        targetPilotId: 'TMK',
        currentRole: 'admin',
        nextRole: 'admin',
        targetActive: true,
        activeAdmins: 1,
      }),
    ).toBeNull();
  });

  it('szef wyszkolenia traci rolę bez ceremonii — nie ma zdolności accounts.manage', () => {
    expect(
      refuseRoleChange({
        actorPilotId: 'TMK',
        targetPilotId: 'AKO',
        currentRole: 'training_lead',
        nextRole: 'pilot',
        targetActive: true,
        activeAdmins: 1,
      }),
    ).toBeNull();
  });
});

describe('deaktywacja', () => {
  it('administrator nie deaktywuje SIEBIE', () => {
    expect(
      refuseDeactivate({
        actorPilotId: 'TMK',
        targetPilotId: 'TMK',
        currentRole: 'admin',
        activeAdmins: 5,
      }),
    ).toBe('self_deactivate');
  });

  it('ostatni aktywny administrator nie traci dostępu', () => {
    expect(
      refuseDeactivate({
        actorPilotId: 'AKO',
        targetPilotId: 'TMK',
        currentRole: 'admin',
        activeAdmins: 1,
      }),
    ).toBe('last_admin');
  });

  it('zwykły pilot deaktywuje się bez przeszkód — to codzienna operacja klubu', () => {
    expect(
      refuseDeactivate({
        actorPilotId: 'TMK',
        targetPilotId: 'PWI',
        currentRole: 'pilot',
        activeAdmins: 1,
      }),
    ).toBeNull();
  });
});

describe('reset hasła', () => {
  it('konta NIEAKTYWNEGO nie resetujemy — hasło i tak nie zaloguje', () => {
    expect(refusePasswordReset(false)).toBe('inactive_account');
  });

  it('konto aktywne — bez przeszkód', () => {
    expect(refusePasswordReset(true)).toBeNull();
  });
});
