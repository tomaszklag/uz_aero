/**
 * UZ Aero - PORT kryptografii PIN-u (§3.0: „hash PIN-u w expo-secure-store").
 *
 * Warstwa aplikacji decyduje KIEDY PIN powstaje i kiedy jest sprawdzany; JAK się go
 * soli i skraca - to szczegół infrastruktury (adapter na czystym TS, bez modułów
 * natywnych - musi działać też w Node/Jest).
 *
 * Skala zagrożenia jest jawnie skromna: PIN ma 4 cyfry, więc żaden KDF nie obroni go
 * przed atakiem na wyciągnięty magazyn - ale magazyn to Keystore, a jego wyciek oddaje
 * i tak refresh token, czyli całą sesję. Hash z solą chroni przed odczytem PIN-u
 * „przy okazji" (zrzut ekranu debuggera, log) - i po to tu jest.
 */

import type { PinRecord } from './credentialsPort';

export interface PinCryptoPort {
  /** Nowy rekord PIN-u ze świeżą solą. */
  create(pin: string): Promise<PinRecord>;
  /** Czy podany PIN odpowiada rekordowi. */
  verify(pin: string, record: PinRecord): Promise<boolean>;
}
