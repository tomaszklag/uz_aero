/**
 * UZ Aero - PORT bezpiecznego magazynu poświadczeń (§3.0, §5.2).
 *
 * Trzyma to, czego NIE wolno położyć w zwykłym storage: parę tokenów i profil pilota
 * z provisioning. Sekrety mieszkają w `expo-secure-store` (Keystore Androida), nie
 * w SQLite ani AsyncStorage - wyciągnięcie bazy z urządzenia nie może dać sesji.
 *
 * Port zamiast bezpośredniego importu, bo (a) pętla synca i logowanie testują się
 * w Node bez natywnego modułu, (b) wygasły token ≠ wylogowanie (§3.0) - decyzje
 * o cyklu życia poświadczeń podejmuje warstwa aplikacji, magazyn tylko przechowuje.
 */

import type { RemoteRegistration } from './serverPort';

/** Solony skrót PIN-u (§3.0) - nigdy sam PIN; weryfikację robi `PinCryptoPort`. */
export interface PinRecord {
  salt: string;
  hash: string;
}

/** Komplet poświadczeń zapisany przy logowaniu (provisioning urządzenia). */
export interface StoredCredentials {
  token: string;
  refreshToken: string;
  pilot: { id: string; code: string; name: string };
  /**
   * PIN codziennego odblokowania - ustawiany PO logowaniu (krok „Ustaw PIN").
   * Brak pola = profil sprzed ustawienia PIN-u → bramka kieruje do konfiguracji.
   */
  pin?: PinRecord | null;
}

/**
 * Zgłoszenie rejestracyjne czekające na decyzję administratora (logowanie Google,
 * `docs/logowanie-google.md` §9) - OSOBNO od poświadczeń i pod osobnym kluczem.
 *
 * To NIE jest tożsamość: token rejestracyjny otwiera jedną trasę (stan zgłoszenia)
 * i nie da się nim zapisać ani odczytać niczego z rejestru. Wpisany do
 * `StoredCredentials` udawałby profil, a bramka startu kierowałaby do PIN-u. Trzymamy
 * je mimo to w bezpiecznym magazynie: po restarcie aplikacja ma wrócić na ekran
 * oczekiwania, a nie kazać przechodzić przez Google od nowa.
 *
 * `registrationToken: null` = odrzucenie: serwer nie wydaje wtedy tokenu, a ekran `00d`
 * i tak nie ma o co pytać - jedyne wyjście to inne konto.
 */
export interface StoredRegistration {
  registrationToken: string | null;
  registration: RemoteRegistration;
}

export interface CredentialsPort {
  load(): Promise<StoredCredentials | null>;
  save(credentials: StoredCredentials): Promise<void>;
  /** Czyszczenie przy wylogowaniu - wołający MUSI wcześniej sprawdzić pusty outbox. */
  clear(): Promise<void>;

  loadRegistration(): Promise<StoredRegistration | null>;
  saveRegistration(registration: StoredRegistration): Promise<void>;
  clearRegistration(): Promise<void>;
}
