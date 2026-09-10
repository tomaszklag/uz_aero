/**
 * Ninerdeck - PORT bezpiecznego magazynu poświadczeń (§3.0, §5.2).
 *
 * Trzyma to, czego NIE wolno położyć w zwykłym storage: parę tokenów i profil pilota
 * z provisioning. Sekrety mieszkają w `expo-secure-store` (Keystore Androida), nie
 * w SQLite ani AsyncStorage - wyciągnięcie bazy z urządzenia nie może dać sesji.
 *
 * Port zamiast bezpośredniego importu, bo (a) pętla synca i logowanie testują się
 * w Node bez natywnego modułu, (b) wygasły token ≠ wylogowanie (§3.0) - decyzje
 * o cyklu życia poświadczeń podejmuje warstwa aplikacji, magazyn tylko przechowuje.
 */

import type { ClubMembership, ClubsView, OrgRef } from './serverPort';

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
  /**
   * KLUB, DLA KTÓREGO wydano tę parę tokenów (wielofirmowość §6) - kontekst floty,
   * przejęcia i wysyłki. Brak pola = profil sprzed 2.0.0: aplikacja pracuje wtedy jak
   * dotąd, dopóki pierwsze odświeżenie tokenów nie przyniesie klubu (§11).
   */
  org?: OrgRef;
  /**
   * Komplet klubów pilota - z niego bierze się przełącznik na 13A i plakietka klubu na
   * kafelku operacji (01E). Jedno i drugie istnieje WYŁĄCZNIE przy więcej niż jednym
   * członkostwie: przy jednym plakietka świeciłaby przy każdym kafelku i niczego nie
   * odróżniała (reguła SyncChipa z issue #12).
   */
  memberships?: ClubMembership[];
}

/**
 * OSOBA BEZ AKTYWNEGO KLUBU (wielofirmowość §4) - stan między zweryfikowanym kontem
 * Google a wejściem do klubu. OSOBNO od poświadczeń i pod osobnym kluczem.
 *
 * To NIE jest tożsamość: token osoby otwiera dokładnie dwie trasy bez klubu (stan
 * członkostw, kod klubu) i nie da się nim zapisać ani odczytać niczego z rejestru.
 * Wpisany do `StoredCredentials` udawałby profil, a bramka startu kierowałaby do PIN-u.
 * Trzymamy go mimo to w bezpiecznym magazynie: po restarcie aplikacja ma wrócić na ekran
 * oczekiwania (00C) albo na pole kodu klubu (00E), a nie kazać przechodzić przez Google
 * od nowa.
 *
 * `clubs` niesie komplet członkostw, bo to on rozstrzyga ekran: `pending` → 00C
 * (z nazwą klubu, który ma zdecydować), `rejected` → 00D (z powodem), `none` → 00E.
 */
export interface StoredPerson {
  personToken: string;
  clubs: ClubsView;
}

export interface CredentialsPort {
  load(): Promise<StoredCredentials | null>;
  save(credentials: StoredCredentials): Promise<void>;
  /** Czyszczenie przy wylogowaniu - wołający MUSI wcześniej sprawdzić pusty outbox. */
  clear(): Promise<void>;

  loadPerson(): Promise<StoredPerson | null>;
  savePerson(person: StoredPerson): Promise<void>;
  clearPerson(): Promise<void>;
}
