/**
 * UZ Aero — miękka prośba o uprawnienie powiadomień (Android 13+).
 *
 * Powiadomienie usługi GPS w tle to przyrząd stanu („rejestracja lotu trwa"), ale
 * jego widoczność NIE warunkuje działania: bez zgody system chowa pasek, a usługa
 * i zapis śladu chodzą dalej. Dlatego prośba jest miękka — odmowa niczego nie
 * blokuje (offline-first §4.1: nic nie blokuje dnia pilota).
 *
 * Import `react-native` jest tu legalny (warstwa infrastruktury); do barrela NIE
 * trafia (test architektury), bo barrel musi ładować się w Node.
 */

import { PermissionsAndroid, Platform } from 'react-native';

export type NotificationPermission = 'granted' | 'denied' | 'unavailable';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  // Przed Androidem 13 (API 33) uprawnienia nie ma — powiadomienia działają z pudełka.
  if (Platform.OS !== 'android' || typeof Platform.Version !== 'number' || Platform.Version < 33) {
    return 'unavailable';
  }
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
