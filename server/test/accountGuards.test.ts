/**
 * Ninerdeck (serwer) - zakazy przy zmianach na kontach (`domain/accountGuards.ts`).
 *
 * Testy bez bazy i bez HTTP, bo reguła jest czysta: wejściem jest „kto, komu, z jakiej
 * roli na jaką i ilu jest jeszcze administratorów". Wersja przez `app.inject` żyje
 * w `adminAccounts.test.ts` i sprawdza co innego - że brama naprawdę tych funkcji
 * używa i że odmowa dojeżdża do klienta z powodem.
 *
 * Scenariusz, dla którego to w ogóle istnieje, wydarzył się 2026-08-01: administrator
 * bez dostępu, zero ścieżek naprawy w produkcie. Konto odcięte jednym kliknięciem
 * wraca dokładnie do tamtej sytuacji.
 */

import { describe, expect, it } from 'vitest';

import { refuseDeactivate, refuseScopeChange } from '../src/domain/accountGuards.ts';
import { CLUB_CAPABILITIES, type Capability } from '../src/domain/roles.ts';

/** Zakres bez `accounts.manage` - wszystko inne zostaje. */
const WITHOUT_MANAGE = CLUB_CAPABILITIES.filter((c) => c !== 'accounts.manage');
const MANAGER: readonly Capability[] = ['panel.access', 'accounts.manage'];
const TECHNIK: readonly Capability[] = ['panel.access', 'fleet.manage'];

describe('odebranie zdolności `accounts.manage`', () => {
  it('administrator nie odbiera jej SOBIE - nawet gdy są inni nosiciele', () => {
    expect(
      refuseScopeChange({
        actorPilotId: 'AKO',
        targetPilotId: 'AKO',
        currentCapabilities: MANAGER,
        nextCapabilities: WITHOUT_MANAGE,
        targetActive: true,
        activeManagers: 3,
      }),
    ).toBe('self_demote');
  });

  it('OSTATNI aktywny nosiciel jej nie traci', () => {
    expect(
      refuseScopeChange({
        actorPilotId: 'AKO',
        targetPilotId: 'BNO',
        currentCapabilities: MANAGER,
        nextCapabilities: TECHNIK,
        targetActive: true,
        activeManagers: 1,
      }),
    ).toBe('last_admin');
  });

  it('przedostatni traci - blokada dotyczy ostatniego, nie każdego', () => {
    expect(
      refuseScopeChange({
        actorPilotId: 'AKO',
        targetPilotId: 'BNO',
        currentCapabilities: MANAGER,
        nextCapabilities: TECHNIK,
        targetActive: true,
        activeManagers: 2,
      }),
    ).toBeNull();
  });

  it('członkostwo NIEAKTYWNE nie liczy się do puli - odebranie nikogo nie odcina', () => {
    expect(
      refuseScopeChange({
        actorPilotId: 'AKO',
        targetPilotId: 'MDB',
        currentCapabilities: MANAGER,
        nextCapabilities: [],
        targetActive: false,
        activeManagers: 1,
      }),
    ).toBeNull();
  });

  // ══ SEDNO ZMIANY OSI (epik #197) ══
  // Do 3.1.0 zapora pytała o rolę, więc pilnowała KAŻDEJ zmiany administratora.
  // Odkąd zdolności nadaje się pojedynczo, blokujemy wyłącznie tę jedną: pozostałe
  // odbiera się do zera i klub żyje dalej, bo zostaje ktoś, kto potrafi je przywrócić.
  it('odebranie WSZYSTKIEGO POZA `accounts.manage` przechodzi - nawet ostatniemu', () => {
    expect(
      refuseScopeChange({
        actorPilotId: 'AKO',
        targetPilotId: 'BNO',
        currentCapabilities: CLUB_CAPABILITIES,
        nextCapabilities: ['accounts.manage'],
        targetActive: true,
        activeManagers: 1,
      }),
    ).toBeNull();
  });

  it('NADANIE zdolności nigdy nie jest blokowane - nie zmniejsza liczby naprawiających', () => {
    expect(
      refuseScopeChange({
        actorPilotId: 'AKO',
        targetPilotId: 'PWI',
        currentCapabilities: [],
        nextCapabilities: CLUB_CAPABILITIES,
        targetActive: true,
        activeManagers: 1,
      }),
    ).toBeNull();
  });

  it('zapis bez zmiany tej jednej zdolności to brak zmiany, a nie odmowa', () => {
    expect(
      refuseScopeChange({
        actorPilotId: 'AKO',
        targetPilotId: 'AKO',
        currentCapabilities: MANAGER,
        nextCapabilities: [...MANAGER, 'audit.read'],
        targetActive: true,
        activeManagers: 1,
      }),
    ).toBeNull();
  });
});

describe('deaktywacja', () => {
  it('administrator nie deaktywuje SIEBIE', () => {
    expect(
      refuseDeactivate({
        actorPilotId: 'AKO',
        targetPilotId: 'AKO',
        targetManagesAccounts: true,
        activeManagers: 5,
      }),
    ).toBe('self_deactivate');
  });

  it('ostatni aktywny nosiciel `accounts.manage` nie traci dostępu', () => {
    expect(
      refuseDeactivate({
        actorPilotId: 'BNO',
        targetPilotId: 'AKO',
        targetManagesAccounts: true,
        activeManagers: 1,
      }),
    ).toBe('last_admin');
  });

  it('zwykły pilot deaktywuje się bez przeszkód - to codzienna operacja klubu', () => {
    expect(
      refuseDeactivate({
        actorPilotId: 'AKO',
        targetPilotId: 'PWI',
        targetManagesAccounts: false,
        activeManagers: 1,
      }),
    ).toBeNull();
  });

  // Technik z wejściem do panelu, ale bez władzy nad kontami: jego wyłączenie nie
  // zamyka klubu, bo drogi powrotu pilnuje wyłącznie `accounts.manage`.
  it('członek z panelem, ale bez władzy nad kontami, wyłącza się swobodnie', () => {
    expect(
      refuseDeactivate({
        actorPilotId: 'AKO',
        targetPilotId: 'BNO',
        targetManagesAccounts: false,
        activeManagers: 1,
      }),
    ).toBeNull();
  });
});
