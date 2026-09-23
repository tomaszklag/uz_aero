/**
 * Ninerdeck - TAPNIĘCIE W POWIADOMIENIE OTWIERA WŁAŚCIWY EKRAN (epik R-J, J4).
 *
 * Dwie drogi, jeden skutek: tapnięcie przy żyjącej aplikacji przychodzi słuchaczem,
 * tapnięcie z zimnego startu (albo sprzed odblokowania PIN-em - nawigator stoi dopiero
 * ZA bramką tożsamości) czeka jako „ostatnia odpowiedź" i czyta się je, gdy nawigator
 * jest gotowy. Odpowiedź żyje do końca procesu, więc identyfikator obsłużonego tapnięcia
 * trzyma STAN MODUŁU - inaczej każde ponowne zamontowanie nawigatora (wylogowanie
 * i logowanie) otwierałoby tę samą rezerwację jeszcze raz.
 *
 * Dokąd - liczy `logic/pushTarget.ts`; tu jest wyłącznie wołanie nawigatora.
 */

import { useEffect } from 'react';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import {
  lastNotificationTap,
  onNotificationTap,
  type NotificationTap,
} from '../../infrastructure/push/expoNotifications';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { pushTarget } from '../screens/logic/pushTarget';

let consumed: string | null = null;

export function usePushNavigation(
  ref: NavigationContainerRefWithCurrent<RootStackParamList>,
  ready: boolean,
): void {
  useEffect(() => {
    if (!ready) return;

    const open = (tap: NotificationTap): void => {
      if (consumed === tap.id || !ref.isReady()) return;
      consumed = tap.id;
      const target = pushTarget(tap.data);
      if (target.screen === 'Decision') ref.navigate('Decision', target.params);
      else if (target.screen === 'BookingDetails') ref.navigate('BookingDetails', target.params);
      else ref.navigate('Notifications');
    };

    void lastNotificationTap().then((tap) => {
      if (tap != null) open(tap);
    });
    return onNotificationTap(open);
  }, [ref, ready]);
}
