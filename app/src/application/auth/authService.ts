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
 */

import type { CredentialsPort, StoredCredentials } from '../ports/credentialsPort';
import type { PinCryptoPort } from '../ports/pinCryptoPort';
import { ServerRejectedError, type ServerPort } from '../ports/serverPort';

export type LogoutBlock = 'outbox_not_empty' | null;

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

  /**
   * Pierwsze logowanie (online). Zapisuje komplet poświadczeń i zwraca tożsamość.
   * PIN jest jawnie ZEROWANY - świeży provisioning (także po „Nie pamiętam PIN")
   * przechodzi przez krok „Ustaw PIN", stary skrót nie ma prawa przeżyć.
   */
  async login(login: string, password: string): Promise<StoredCredentials> {
    const tokens = await this.server.login(login, password);
    const stored: StoredCredentials = {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      pilot: tokens.pilot,
      pin: null,
    };
    await this.credentials.save(stored);
    return stored;
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
   * Drugi przypadek NIE czyści poświadczeń - pilot pracuje dalej offline, a ekran 11
   * pokaże, że sync czeka na ponowne zalogowanie. Decyzję podejmuje człowiek, nie timer.
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
   * co dzień. Skrót PIN-u zeruje WYŁĄCZNIE świadome `login()` (§3.0).
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
}
