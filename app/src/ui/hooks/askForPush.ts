/**
 * Ninerdeck - MIĘKKA PROŚBA O ZGODĘ NA POWIADOMIENIA + zgłoszenie tokenu (epik R-J, J3).
 *
 * Kiedy pytać, rozstrzyga czysta logika (`screens/logic/pushOptIn.ts`); tu jest sam
 * SKUTEK: dialog systemu (Android 13+; niżej zgoda jest z pudełka) i od razu próba
 * rejestracji tokenu, żeby budzik zadzwonił jeszcze przed najbliższym pulsem pętli.
 * Odmowa niczego nie blokuje (§4.1) i o niczym nie mówi - skrzynka działa dalej.
 *
 * Nie hook: woła się to z obsługi zdarzenia (zapis rezerwacji) i z efektu (Pulpit),
 * a bramka „raz na uruchomienie" mieszka w stanie modułu, nie w komponencie.
 */

import { requestNotificationPermission } from '../../infrastructure/permissions/notificationPermission';
import { PushOptInGate, type PushOptInReason } from '../screens/logic/pushOptIn';
import { useSessionStore } from '../store';

const gate = new PushOptInGate();

export async function askForPush(reason: PushOptInReason | null): Promise<void> {
  if (!gate.take(reason)) return;
  try {
    await requestNotificationPermission();
  } catch {
    // Miękka prośba - cisza jest tu decyzją, nie przeoczeniem.
  }
  await useSessionStore.getState().registerPushToken();
}
