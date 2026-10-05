/**
 * Ninerdeck - OTWARCIE EKRANU, DO KTÓREGO PROWADZI POWIADOMIENIE (epik R-J; kanał klubu
 * 4.0.0, K5).
 *
 * Dwie drogi, jeden skutek: tapnięcie w push i tapnięcie w baner w aplikacji otwierają
 * ten sam ekran, bo cel liczy jedna funkcja (`logic/pushTarget.ts`), a tu stoi jedno
 * jego wykonanie na uchwycie nawigatora. Drugie wykonanie przy banerze rozjechałoby się
 * z pierwszym przy pierwszym nowym ekranie celu.
 */

import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import type { PushTarget } from '../screens/logic/pushTarget';
import type { RootStackParamList } from './RootNavigator';

export function openTarget(ref: NavigationContainerRefWithCurrent<RootStackParamList>, target: PushTarget): void {
  if (!ref.isReady()) return;
  if (target.screen === 'Decision') ref.navigate('Decision', target.params);
  else if (target.screen === 'BookingDetails') ref.navigate('BookingDetails', target.params);
  else if (target.screen === 'Aircraft') ref.navigate('Aircraft', target.params);
  else ref.navigate('Notifications', target.params);
}
