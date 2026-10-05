/**
 * Ninerdeck - POWIADOMIENIA PUSH przez `expo-notifications` (3.1.0, epik R-J;
 * `docs/rezerwacje.md` §12.5).
 *
 * JEDYNE miejsce, które importuje `expo-notifications` (exact-list w `architecture.test.ts`)
 * - ta sama reguła, co przy `expo-updates` i `expo-application`: moduł natywny ma jeden
 * adres w kodzie, więc podmiana dostawcy albo usunięcie modułu to zmiana w jednym pliku.
 * Do barrela infrastruktury NIE trafia (testy w Node).
 *
 * ══ PUSH JEST BUDZIKIEM (§12.1) ══
 * Treść stoi w skrzynce; stąd wychodzą DOKŁADNIE cztery rzeczy: adres urządzenia dla
 * serwera (`ExpoPushDevice`), sposób pokazania budzika przy otwartej aplikacji i na
 * kanale Androida (`configureNotifications`), budzik ODEBRANY przy otwartej aplikacji
 * (`onNotificationReceived` - zasila baner w aplikacji, kanał klubu 4.0.0) oraz TAPNIĘCIE
 * w budzik (`onNotificationTap`, `lastNotificationTap`), z którego nawigacja wyprowadza
 * ekran (`logic/pushTarget.ts`).
 *
 * ══ KAŻDA AWARIA JEST CISZĄ, NIE WYWROTKĄ ══
 * Build bez pliku Firebase, Expo Go, telefon bez usług Google - `getExpoPushTokenAsync`
 * rzuca, a aplikacja ma dalej latać. Dlatego token jest `null`, a nie wyjątkiem, i nikt
 * wyżej nie ma czego łapać.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import appConfig from '../../../app.json';
import type { PushDevicePort } from '../../application/ports/pushDevicePort';

/**
 * Kanał Androida, na który serwer adresuje budzik (`channelId` w `ExpoPush`). Nazwa
 * jest umową między serwerem a telefonem; ważność WYSOKA, bo prośba o zgodę na cudzy
 * lot bywa pilna (termin jest jutro), a kanał domyślny systemu ma ważność, której nie
 * kontrolujemy.
 */
export const PUSH_CHANNEL_ID = 'default';

/** Tapnięcie w powiadomienie: identyfikator (do odróżnienia powtórek) i dane z serwera. */
export interface NotificationTap {
  id: string;
  data: Record<string, unknown>;
}

/** Budzik odebrany przy otwartej aplikacji: tytuł i treść od serwera oraz identyfikatory. */
export interface ReceivedNotification {
  id: string;
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
}

/**
 * Ustawienia obowiązujące przez całe życie procesu - wołane raz przy starcie aplikacji.
 *
 * PRZY OTWARTEJ APLIKACJI SYSTEM MILCZY (kanał klubu 4.0.0, K5): ani systemowego banera,
 * ani dźwięku - budzik zostaje po cichu na liście systemowej, a zapowiada go WŁASNY baner
 * aplikacji (`onNotificationReceived` → baner nad nawigacją). Ten sam rachunek obejmuje
 * kokpit, w którym banera aplikacji nie ma wcale (pkt 44 zleceń), i ekran PIN-u, nad
 * którym baner pokazałby treść komuś, kto telefonu nie odblokował. Zwykle push na
 * wierzchu nie przychodzi wcale - przy działającym łączu serwer wysyła ramkę (K4) - więc
 * dotyczy to wiadomości z INNEGO klubu i chwil bez łącza. Aplikacja w tle dzwoni jak
 * dotąd: o tym decyduje kanał Androida, nie ten handler.
 */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: 'Rezerwacje i zgody',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    }).catch(() => {
      // Kanał zakłada się przy pierwszym udanym starcie; bez niego system użyje
      // własnego domyślnego - budzik dalej dzwoni, tylko ciszej.
    });
  }
}

/** Adres tej instalacji u dostawcy push (`PushDevicePort`). */
export class ExpoPushDevice implements PushDevicePort {
  async token(): Promise<string | null> {
    try {
      const { data } = await Notifications.getExpoPushTokenAsync({
        projectId: appConfig.expo.extra.eas.projectId,
      });
      return data === '' ? null : data;
    } catch {
      return null;
    }
  }
}

/** Budzik odebrany przy OTWARTEJ aplikacji - źródło banera w aplikacji. Zwraca wypis. */
export function onNotificationReceived(listener: (received: ReceivedNotification) => void): () => void {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    const content = notification.request.content;
    listener({
      id: notification.request.identifier,
      title: content.title ?? null,
      body: content.body ?? null,
      data: (content.data ?? {}) as Record<string, unknown>,
    });
  });
  return () => subscription.remove();
}

/** Tapnięcie w budzik przy ŻYJĄCEJ aplikacji (na wierzchu albo w tle). Zwraca wypis. */
export function onNotificationTap(listener: (tap: NotificationTap) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
    listener(tapOf(response)),
  );
  return () => subscription.remove();
}

/**
 * Tapnięcie, które URUCHOMIŁO aplikację (zimny start) albo padło, zanim nawigator
 * stanął (ekran PIN). Odpowiedź żyje do końca procesu, więc wołający odróżnia
 * powtórki po `id`.
 */
export async function lastNotificationTap(): Promise<NotificationTap | null> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return response == null ? null : tapOf(response);
  } catch {
    return null;
  }
}

function tapOf(response: Notifications.NotificationResponse): NotificationTap {
  const content = response.notification.request.content;
  return {
    id: response.notification.request.identifier,
    data: (content.data ?? {}) as Record<string, unknown>,
  };
}
