/**
 * UZ Aero — PORT bezpiecznego magazynu poświadczeń (§3.0, §5.2).
 *
 * Trzyma to, czego NIE wolno położyć w zwykłym storage: parę tokenów i profil pilota
 * z provisioning. Sekrety mieszkają w `expo-secure-store` (Keystore Androida), nie
 * w SQLite ani AsyncStorage — wyciągnięcie bazy z urządzenia nie może dać sesji.
 *
 * Port zamiast bezpośredniego importu, bo (a) pętla synca i logowanie testują się
 * w Node bez natywnego modułu, (b) wygasły token ≠ wylogowanie (§3.0) — decyzje
 * o cyklu życia poświadczeń podejmuje warstwa aplikacji, magazyn tylko przechowuje.
 */

/** Komplet poświadczeń zapisany przy logowaniu (provisioning urządzenia). */
export interface StoredCredentials {
  token: string;
  refreshToken: string;
  pilot: { id: string; code: string; name: string };
}

export interface CredentialsPort {
  load(): Promise<StoredCredentials | null>;
  save(credentials: StoredCredentials): Promise<void>;
  /** Czyszczenie przy wylogowaniu — wołający MUSI wcześniej sprawdzić pusty outbox. */
  clear(): Promise<void>;
}
