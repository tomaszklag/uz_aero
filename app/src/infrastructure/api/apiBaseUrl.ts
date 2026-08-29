/**
 * UZ Aero - adres serwera synchronizacji.
 *
 * Kolejność źródeł:
 *  1. `EXPO_PUBLIC_API_URL` - jawna konfiguracja (staging/produkcja);
 *  2. host Metro z portem serwera - w dev telefon i tak rozmawia z komputerem,
 *     na którym stoi Metro, więc backend jest pod TYM SAMYM adresem IP, tylko na :3000.
 *     Oszczędza to wpisywanie adresu LAN przy każdej zmianie sieci;
 *  3. localhost - ostatnia deska (emulator na tym samym hoście).
 */

import Constants from 'expo-constants';

const SERVER_PORT = 3000;

export function apiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit != null && explicit.length > 0) return explicit.replace(/\/$/, '');

  // `hostUri` ma postać „192.168.0.12:8081" - bierzemy sam host.
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host != null && host.length > 0) return `http://${host}:${SERVER_PORT}`;

  return `http://localhost:${SERVER_PORT}`;
}
