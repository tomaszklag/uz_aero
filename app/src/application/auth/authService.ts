/**
 * UZ Aero - cykl życia poświadczeń (§3.0).
 *
 * Trzy twarde zasady z dokumentacji, które ten serwis egzekwuje:
 *
 *  • **Logowanie = jednorazowe provisioning i WYMAGA sieci** - jedyny świadomy wyjątek
 *    od offline-first. Po nim tożsamość i tokeny mieszkają w bezpiecznym magazynie.
 *  • **Wygasły token ≠ wylogowanie.** JWT służy wyłącznie do rozmowy z serwerem;
 *    `freshToken()` odświeża go po cichu przy najbliższej okazji, a gdy sieci nie ma -
 *    praca lokalna trwa dalej. Aplikacja NIGDY sama nie wyrzuca pilota do logowania.
 *  • **Wylogowanie jest chronione**: zablokowane przy niepustym outboxie - inaczej
 *    niewysłane zdarzenia dnia zginęłyby razem z tożsamością.
 *
 * ══ LOGOWANIE GOOGLE (2026-09-04, `docs/logowanie-google.md` §9) ══
 * Google podmienia WYŁĄCZNIE sposób weryfikacji tożsamości w kroku provisioningu.
 * Dochodzi za to stan, którego dotąd nie było: konto Google potwierdzone, ale konta
 * pilota jeszcze nie ma - ZGŁOSZENIE czeka na administratora. Serwis trzyma je osobno
 * od poświadczeń (`StoredRegistration`), bo to nie jest tożsamość: token rejestracyjny
 * otwiera jedną trasę i niczego nie podpisuje w rejestrze.
 */

import type {
  CredentialsPort,
  StoredCredentials,
  StoredRegistration,
} from '../ports/credentialsPort';
import type { PinCryptoPort } from '../ports/pinCryptoPort';
import {
  ServerRejectedError,
  type AuthTokens,
  type RemoteRegistration,
  type ServerPort,
} from '../ports/serverPort';

export type LogoutBlock = 'outbox_not_empty' | null;

/** Wynik logowania Google - tylko `signed_in` jest tożsamością. */
export type GoogleLoginOutcome =
  | { kind: 'signed_in'; stored: StoredCredentials }
  | { kind: 'pending' | 'rejected'; registration: RemoteRegistration };

/**
 * Wynik sprawdzenia zgłoszenia (ekran `00c`).
 *  • `signed_in` - zatwierdzono w międzyczasie; profil już zapisany, PIN do ustawienia;
 *  • `pending` / `rejected` - stan zgłoszenia (odrzucenie niesie powód);
 *  • `gone` - serwer zgłoszenia nie zna (wygasło, konto skasowane) - magazyn wyczyszczony,
 *    droga wraca na ekran logowania;
 *  • `unreachable` - brak sieci; zapisane zgłoszenie zostaje nietknięte.
 */
export type RegistrationCheck =
  | { kind: 'signed_in'; stored: StoredCredentials }
  | { kind: 'pending' | 'rejected'; registration: RemoteRegistration }
  | { kind: 'gone' }
  | { kind: 'unreachable' };

export class AuthService {
  constructor(
    private readonly server: ServerPort,
    private readonly credentials: CredentialsPort,
    private readonly pinCrypto: PinCryptoPort,
  ) {}

  /** Profil z magazynu - `null` = urządzenie bez provisioning (droga do 00-login). */
  profile(): Promise<StoredCredentials | null> {
    return this.credentials.load();
  }

  /** Zgłoszenie z magazynu - `null` = nikt na tym telefonie nie czeka na decyzję. */
  registration(): Promise<StoredRegistration | null> {
    return this.credentials.loadRegistration();
  }

  /**
   * Logowanie Google (online). Trzy wyjścia i żadne nie jest cichym błędem:
   * konto zatwierdzone → provisioning jak dotąd; zgłoszenie → zapis do magazynu,
   * żeby restart wrócił na ekran oczekiwania; odrzucenie → zapis BEZ tokenu (serwer go
   * nie wydaje), bo `00d` ma pokazać powód także po restarcie.
   */
  async loginWithGoogle(idToken: string): Promise<GoogleLoginOutcome> {
    const result = await this.server.loginWithGoogle(idToken);
    if (result.kind === 'signed_in') {
      return { kind: 'signed_in', stored: await this.provision(result.tokens) };
    }
    await this.credentials.saveRegistration({
      registrationToken: result.kind === 'pending' ? result.registrationToken : null,
      registration: result.registration,
    });
    return { kind: result.kind, registration: result.registration };
  }

  /**
   * Sprawdzenie zgłoszenia u serwera - „SPRAWDŹ PONOWNIE" i pętla ekranu `00c`.
   *
   * Brak sieci NIE rusza magazynu (§4.1: sieć to okazja, nie warunek), a odmowa
   * 401/404 czyści go - zgłoszenia już nie ma i udawanie, że czeka, byłoby kłamstwem
   * na ekranie, którego cała treść to „na co czekasz".
   */
  async checkRegistration(): Promise<RegistrationCheck> {
    const stored = await this.credentials.loadRegistration();
    if (stored == null) return { kind: 'gone' };
    if (stored.registrationToken == null) {
      // Odrzucone przy logowaniu: nie ma tokenu, nie ma o co pytać - stan jest znany.
      return { kind: 'rejected', registration: stored.registration };
    }

    let result;
    try {
      result = await this.server.registrationStatus(stored.registrationToken);
    } catch (error) {
      if (error instanceof ServerRejectedError && (error.status === 401 || error.status === 404)) {
        await this.credentials.clearRegistration();
        return { kind: 'gone' };
      }
      if (error instanceof ServerRejectedError) throw error;
      return { kind: 'unreachable' };
    }

    if (result.kind === 'approved') {
      return { kind: 'signed_in', stored: await this.provision(result.tokens) };
    }
    await this.credentials.saveRegistration({
      registrationToken: stored.registrationToken,
      registration: result.registration,
    });
    return { kind: result.kind, registration: result.registration };
  }

  /** „Zaloguj innym kontem" - porzucenie zgłoszenia na TYM telefonie; serwer nic o tym nie wie. */
  async abandonRegistration(): Promise<void> {
    await this.credentials.clearRegistration();
  }

  // ── PIN (§3.0: codzienne wejście = odblokowanie offline) ─────────────────────

  /** Ustawia PIN profilu (krok po logowaniu). Wymaga istniejącego profilu. */
  async setPin(pin: string): Promise<void> {
    const stored = await this.credentials.load();
    if (stored == null) throw new Error('AuthService: brak profilu - najpierw logowanie.');
    await this.credentials.save({ ...stored, pin: await this.pinCrypto.create(pin) });
  }

  /**
   * Weryfikacja PIN-u przy wejściu. Działa w 100% offline - porównanie skrótów
   * z magazynu, zero rozmowy z serwerem. Brak profilu albo brak PIN-u = `false`
   * (bramka i tak nie pokaże tego ekranu bez profilu - to pas bezpieczeństwa).
   */
  async verifyPin(pin: string): Promise<boolean> {
    const stored = await this.credentials.load();
    if (stored?.pin == null) return false;
    return this.pinCrypto.verify(pin, stored.pin);
  }

  /**
   * Token zdatny do rozmowy z serwerem - bieżący, a po odmowie 401 świeży z rotacji.
   *
   * `null` znaczy: nie mamy jak rozmawiać (brak profilu ALBO refresh też odrzucony).
   * Drugi przypadek NIE czyści poświadczeń - pilot pracuje dalej offline, a ustawienia
   * pokażą, że sync czeka na ponowne zalogowanie. Decyzję podejmuje człowiek, nie timer.
   */
  async freshToken(): Promise<string | null> {
    const stored = await this.credentials.load();
    if (stored == null) return null;
    return stored.token;
  }

  /**
   * Rotacja po 401: zużywa refresh, zapisuje nową parę. `null` = refresh odrzucony.
   *
   * PIN PRZEŻYWA rotację - zapis idzie na kopii poświadczeń, nie na świeżym obiekcie.
   * Magazyn trzyma komplet pod jednym kluczem, więc pominięcie `pin` skasowałoby go
   * przy pierwszym wygaśnięciu tokenu (ACCESS_TTL = 1 h) i bramka wołałaby „Ustaw PIN"
   * co dzień. Skrót PIN-u zeruje WYŁĄCZNIE świadomy provisioning (§3.0).
   */
  async rotate(): Promise<string | null> {
    const stored = await this.credentials.load();
    if (stored == null) return null;

    try {
      const tokens = await this.server.refresh(stored.refreshToken);
      const next: StoredCredentials = {
        ...stored,
        token: tokens.token,
        refreshToken: tokens.refreshToken,
        pilot: tokens.pilot,
      };
      await this.credentials.save(next);
      return next.token;
    } catch (error) {
      if (error instanceof ServerRejectedError) return null; // refresh martwy - bez paniki
      throw error; // brak sieci propagujemy - to „spróbuj później", nie „odmowa"
    }
  }

  /**
   * Wylogowanie - dozwolone WYŁĄCZNIE przy pustym outboxie (§3.0).
   * `outboxCount` podaje wołający, bo licznik żyje w warstwie danych sesji.
   */
  async logout(outboxCount: number): Promise<LogoutBlock> {
    if (outboxCount > 0) return 'outbox_not_empty';
    await this.credentials.clear();
    return null;
  }

  /**
   * Provisioning urządzenia: komplet poświadczeń do magazynu, zgłoszenie (jeśli było)
   * wyczyszczone. PIN jest jawnie ZEROWANY - świeży provisioning (także po „Nie pamiętam
   * PIN") przechodzi przez krok „Ustaw PIN", stary skrót nie ma prawa przeżyć.
   */
  private async provision(tokens: AuthTokens): Promise<StoredCredentials> {
    const stored: StoredCredentials = {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      pilot: tokens.pilot,
      pin: null,
    };
    await this.credentials.save(stored);
    await this.credentials.clearRegistration();
    return stored;
  }
}
