/**
 * Ninerdeck - cykl życia poświadczeń (§3.0).
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
 *
 * ══ KLUB (wielofirmowość 2.0.0, §4-§7; issue #102) ══
 * Konto Google potwierdzone nie znaczy jeszcze „wpuszczony": bramką jest brak
 * CZŁONKOSTWA w klubie. Serwis trzyma ten stan osobno od poświadczeń (`StoredPerson`),
 * bo to nie jest tożsamość - token osoby otwiera dwie trasy bez klubu i niczego nie
 * podpisuje w rejestrze.
 *
 * Para tokenów jest parą DLA KLUBU, więc każda jej zmiana (logowanie, zatwierdzenie
 * w międzyczasie, przełączenie, rotacja) melduje klub przez `onActiveClub` - to nim
 * magazyn stempluje nowe operacje i po nim zawęża flotę. Funkcja, nie repozytorium:
 * serwis poświadczeń nie ma prawa wiedzieć, że istnieje SQLite.
 *
 * DWIE czynności WYMAGAJĄ SIECI ponad logowanie: dołączenie do klubu i przełączenie
 * klubu (§6). Offline-first dotyczy PRACY w klubie, nie zmiany klubu - bez zasięgu
 * pilot pracuje dalej tam, gdzie już jest.
 */

import type {
  CredentialsPort,
  StoredCredentials,
  StoredPerson,
} from '../ports/credentialsPort';
import type { DeviceClubsPort, DeviceClubsRecord } from '../ports/deviceClubsPort';
import type { PinCryptoPort } from '../ports/pinCryptoPort';
import {
  ServerRejectedError,
  ServerUnreachableError,
  type AccountMethods,
  type AuthTokens,
  type ClubsView,
  type JoinClubResult,
  type LoginMethods,
  type OrgRef,
  type PasswordLoginResult,
  type ServerPort,
  type SetPasswordResult,
} from '../ports/serverPort';

export type LogoutBlock = 'outbox_not_empty' | null;

/**
 * Meldunek o KLUBIE AKTYWNYM - woła się przy każdym wydaniu pary tokenów. Funkcja,
 * a nie port: jedynym odbiorcą jest magazyn (`EventsRepo.setActiveOrg`), a kierunek
 * zależności ma zostać taki, jaki jest.
 */
export type ActiveClubSink = (org: OrgRef) => Promise<void>;

/** Wynik logowania Google - tylko `signed_in` jest tożsamością. */
export type GoogleLoginOutcome =
  | { kind: 'signed_in'; stored: StoredCredentials }
  | { kind: 'no_club'; clubs: ClubsView };

/**
 * Wynik sprawdzenia stanu wobec klubów (ekran `00c`).
 *  • `signed_in`   - zatwierdzono w międzyczasie; profil już zapisany, PIN do ustawienia;
 *  • `clubs`       - nadal bez aktywnego klubu (czeka albo odrzucono - treść w `clubs`);
 *  • `gone`        - serwer za tym tokenem nikogo nie widzi (osoba wyłączona, token
 *                    już zrealizowany) - magazyn wyczyszczony, droga wraca na logowanie;
 *  • `unreachable` - brak sieci; zapisany stan zostaje nietknięty.
 */
export type MembershipCheck =
  | { kind: 'signed_in'; stored: StoredCredentials }
  | { kind: 'clubs'; clubs: ClubsView }
  | { kind: 'gone' }
  | { kind: 'unreachable' };

/**
 * Wynik dołączenia kodem (00E, 13A). `unreachable` wychodzi tu jako WYNIK, nie wyjątek,
 * bo brak sieci ma na tym ekranie własne zdanie: dołączenie wymaga internetu (§6).
 */
export type JoinOutcome = JoinClubResult | { kind: 'unreachable' };

/**
 * Wynik przełączenia klubu (13A).
 *  • `switched`    - nowa para tokenów zapisana, klub aktywny przestawiony;
 *  • `not_found`   - klubu nie ma albo pilot już w nim nie lata (członkostwo wyłączone);
 *  • `unreachable` - brak sieci; nic się nie zmieniło, pilot pracuje dalej w swoim klubie.
 */
export type SwitchOutcome =
  | { kind: 'switched'; stored: StoredCredentials }
  | { kind: 'not_found' }
  | { kind: 'unreachable' };

/**
 * Wynik logowania HASŁEM (00F) - dwa pierwsze stany są DOKŁADNIE tymi samymi, co po
 * Google, bo od chwili ustalenia osoby jedzie wspólny rdzeń serwera. Odmowy są WYNIKAMI,
 * nie wyjątkami: każda ma na 00F inną drogę wyjścia (zdanie przy polu, czas w przycisku).
 *
 * `unreachable` też jest wynikiem - brak sieci ma na tym ekranie własne zdanie („Wymaga
 * internetu"), a nie ekran awarii. Ta sama zasada, co przy `JoinOutcome`.
 */
export type PasswordLoginOutcome =
  | { kind: 'signed_in'; stored: StoredCredentials }
  | { kind: 'no_club'; clubs: ClubsView }
  | { kind: 'invalid_credentials' }
  | { kind: 'account_disabled' }
  | { kind: 'rate_limited'; retryAfterSec: number }
  | { kind: 'unreachable' };

/**
 * Wynik prośby o list - „Nie pamiętam hasła" (00G) i „Załóż konto" (00H).
 *
 * DWA stany i ani jednego więcej: serwer odpowiada `202` na adres znany, nieznany
 * i po wyczerpaniu limitu, więc telefon nie ma czego rozróżniać i nie ma prawa próbować.
 * Zostaje pytanie, na które odpowiedź naprawdę istnieje: czy list w ogóle wyszedł.
 */
export type LinkOutcome = { kind: 'sent' } | { kind: 'unreachable' };

/** Wynik ustawienia/zmiany hasła (13B) - tabela serwera plus brak sieci. */
export type SetPasswordOutcome = SetPasswordResult | { kind: 'unreachable' };

export class AuthService {
  constructor(
    private readonly server: ServerPort,
    private readonly credentials: CredentialsPort,
    private readonly pinCrypto: PinCryptoPort,
    /** Domyślnie nic - testy warstwy poświadczeń nie mają magazynu i nie muszą mieć. */
    private readonly onActiveClub: ActiveClubSink = async () => {},
    /**
     * Kluby znane URZĄDZENIU (2.1.0, D10). Domyślnie wersja w pamięci - przekroje synca
     * i śladu nie dotykają logowania, a pusta atrapa kłamałaby przy odczycie. Produkcyjnie
     * `DeviceClubsStore` na AsyncStorage, żeby lista PRZEŻYŁA wylogowanie.
     */
    private readonly clubs: DeviceClubsPort = memoryDeviceClubs(),
  ) {}

  /** Profil z magazynu - `null` = urządzenie bez provisioning (droga do 00-login). */
  profile(): Promise<StoredCredentials | null> {
    return this.credentials.load();
  }

  /** Osoba bez klubu z magazynu - `null` = nikt na tym telefonie nie czeka na decyzję. */
  person(): Promise<StoredPerson | null> {
    return this.credentials.loadPerson();
  }

  /**
   * Logowanie Google (online). Dwa wyjścia i żadne nie jest cichym błędem: aktywne
   * członkostwo → provisioning jak dotąd; brak klubu → zapis stanu do magazynu, żeby
   * restart wrócił na ekran oczekiwania (00C) albo na pole kodu klubu (00E), a nie
   * kazał przechodzić przez Google od nowa.
   */
  async loginWithGoogle(idToken: string): Promise<GoogleLoginOutcome> {
    const result = await this.server.loginWithGoogle(idToken);
    if (result.kind === 'signed_in') {
      return { kind: 'signed_in', stored: await this.provision(result.tokens) };
    }
    await this.credentials.savePerson({
      personToken: result.personToken,
      clubs: result.clubs,
    });
    return { kind: 'no_club', clubs: result.clubs };
  }

  /**
   * Logowanie HASŁEM (00F) - DRUGA droga tej samej osoby, dla wspólnego tabletu (§5.1).
   *
   * Kończy się dokładnie tam, gdzie Google: `signed_in` → provisioning, `no_club` → zapis
   * stanu osoby, żeby restart wrócił na 00C/00D/00E. Jedyna różnica jest w DOWODZIE,
   * i to jest cała treść decyzji z 2026-09-16 - nie ma tu drugiego wyboru klubu ani
   * drugiej bramki członkostwa.
   *
   * KLUB URZĄDZENIA dokładamy tutaj, a nie w ekranie: kod pilota rozwiązuje się w klubie,
   * który zna TO urządzenie, więc jego znajomość jest własnością warstwy poświadczeń.
   * Adres e-mail go nie potrzebuje, ale i nie przeszkadza mu - serwer bierze pod uwagę
   * `orgId` wyłącznie przy loginie, który nie jest adresem.
   */
  async loginWithPassword(input: { login: string; password: string }): Promise<PasswordLoginOutcome> {
    const device = await this.clubs.read();

    let result: PasswordLoginResult;
    try {
      result = await this.server.loginWithPassword({
        login: input.login,
        password: input.password,
        orgId: device.activeId,
      });
    } catch (error) {
      if (error instanceof ServerUnreachableError) return { kind: 'unreachable' };
      throw error;
    }

    if (result.kind === 'signed_in') {
      return { kind: 'signed_in', stored: await this.provision(result.tokens) };
    }
    if (result.kind === 'no_club') {
      await this.credentials.savePerson({
        personToken: result.personToken,
        clubs: result.clubs,
      });
      return { kind: 'no_club', clubs: result.clubs };
    }
    return result;
  }

  /**
   * „Nie pamiętam hasła" (00G) - prośba o list z linkiem.
   *
   * Tą samą drogą idzie pilot, który hasła jeszcze NIE MA (wchodzi Googlem): list nie
   * „przypomina", tylko USTAWIA. Ekran tego nie dopowiada - link na 00F nazywa się po
   * prostu „Nie pamiętam hasła", bo to zdanie, które przychodzi człowiekowi do głowy.
   */
  async forgotPassword(email: string): Promise<LinkOutcome> {
    return this.requestLink(() => this.server.forgotPassword(email));
  }

  /**
   * „Załóż konto" (00H, §5.4a) - rejestracja e-mailem TYM SAMYM listem.
   *
   * Osoba powstaje dopiero przy realizacji linku, więc adres jest potwierdzony
   * kliknięciem, a nie wpisaniem. Członkostwa to nie daje: po ustawieniu hasła osoba
   * loguje się na 00F i trafia na 00E (kod klubu) - ten sam tor, co Google bez klubu.
   */
  async signUp(input: { name: string; email: string }): Promise<LinkOutcome> {
    return this.requestLink(() => this.server.signUp(input));
  }

  /**
   * Ustawienie albo zmiana WŁASNEGO hasła (13B, §5.3).
   *
   * `current` pomija się wyłącznie wtedy, gdy osoba hasła jeszcze nie ma - o tym wie
   * ekran, nie ten serwis. Odmowa 401 tokenu (wygasł w trakcie) idzie przez JEDNĄ
   * rotację i ponowienie, jak w syncu; `invalid_credentials` z adaptera dotyczy już
   * wyłącznie OBECNEGO HASŁA, bo tamten rozdzielił oba powody po kodzie błędu.
   */
  async setPassword(input: { current?: string; next: string }): Promise<SetPasswordOutcome> {
    const stored = await this.credentials.load();
    if (stored == null) return { kind: 'invalid_credentials' };

    try {
      return await this.server.setPassword(stored.token, input);
    } catch (error) {
      if (error instanceof ServerRejectedError && error.status === 401) {
        const rotated = await this.rotate();
        if (rotated == null) return { kind: 'invalid_credentials' };
        try {
          return await this.server.setPassword(rotated, input);
        } catch (retry) {
          if (retry instanceof ServerUnreachableError) return { kind: 'unreachable' };
          throw retry;
        }
      }
      if (error instanceof ServerUnreachableError) return { kind: 'unreachable' };
      throw error;
    }
  }

  // ── KLUBY URZĄDZENIA (§5.1, D10) ─────────────────────────────────────────────

  /**
   * Kluby znane temu urządzeniu - 00F rozstrzyga z tego, czy pokazać pigułkę klubu
   * i wejście „Zmień klub", a 00I rysuje listę kart. Czyta się offline, bo lista jest
   * lokalna: wybór klubu przed zalogowaniem nie ma prawa wymagać sieci.
   */
  deviceClubs(): Promise<DeviceClubsRecord> {
    return this.clubs.read();
  }

  /** Wybór klubu na 00I - kontekst, w którym rozwiąże się wpisany kod pilota. */
  useDeviceClub(orgId: string): Promise<void> {
    return this.clubs.setActive(orgId);
  }

  /**
   * Co umie TO WDROŻENIE (00A, 00F) - publiczne, bo pyta o to ekran bez sesji.
   * Przechodzi wprost do portu: nie ma tu żadnej decyzji do podjęcia, a ekran nie ma
   * prawa rozmawiać z serwerem z pominięciem tego serwisu.
   */
  methods(): Promise<LoginMethods> {
    return this.server.methods();
  }

  /**
   * Czym może się zalogować TA osoba (ustawienia, sekcja „Hasło"). `null` = nie wiemy:
   * brak profilu, brak sieci albo odmowa serwera.
   *
   * `null` jest tu WYNIKIEM, nie awarią - ekran pokazuje wtedy wiersz w stanie
   * neutralnym („Ustaw hasło"), bo to jedyna odpowiedź, która nie kłamie o żadnym
   * z dwóch przypadków: nie obiecuje pola „Obecne" i nie zapowiada nadpisania.
   */
  async account(): Promise<AccountMethods | null> {
    const stored = await this.credentials.load();
    if (stored == null) return null;

    try {
      return await this.server.account(stored.token);
    } catch (error) {
      if (error instanceof ServerRejectedError && error.status === 401) {
        // Token wygasł w trakcie - jedna rotacja i ponowienie, jak w syncu.
        const rotated = await this.rotate();
        if (rotated == null) return null;
        try {
          return await this.server.account(rotated);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /** Czy serwer zerwał tę sesję zdalnie (D7). Czyta MAGAZYN, więc przeżywa restart. */
  async revoked(): Promise<boolean> {
    const stored = await this.credentials.load();
    return stored?.revoked === true;
  }

  /**
   * Stan wobec klubów u serwera - „SPRAWDŹ PONOWNIE" i pętla ekranu `00c`.
   *
   * Brak sieci NIE rusza magazynu (§4.1: sieć to okazja, nie warunek), a odmowa
   * 401/404 czyści go - za tym tokenem nikt już nie stoi i udawanie, że ktoś czeka,
   * byłoby kłamstwem na ekranie, którego cała treść to „na co czekasz".
   */
  async checkMemberships(): Promise<MembershipCheck> {
    // Token OSOBY (00C) albo token KLUBU: listę klubów czyta też pilot, który już
    // gdzieś lata - na 13A widzi z niej własne zgłoszenie do drugiego klubu. Tokenów
    // klubu ta trasa mu nie wyda i nie ma po co: on już wszedł.
    const token = await this.tokenForClubless();
    if (token == null) return { kind: 'gone' };

    let result;
    try {
      result = await this.server.membershipStatus(token.value);
    } catch (error) {
      if (error instanceof ServerRejectedError && (error.status === 401 || error.status === 404)) {
        await this.credentials.clearPerson();
        return { kind: 'gone' };
      }
      if (error instanceof ServerRejectedError) throw error;
      return { kind: 'unreachable' };
    }

    if (result.kind === 'approved') {
      return { kind: 'signed_in', stored: await this.provision(result.tokens) };
    }
    // Magazyn OSOBY zapisuje wyłącznie droga osoby: u pilota z profilem znaczyłby
    // „nie należysz do żadnego klubu" i bramka startu wyrzuciłaby go na 00C.
    if (token.person != null) {
      await this.credentials.savePerson({ personToken: token.value, clubs: result.clubs });
    }
    return { kind: 'clubs', clubs: result.clubs };
  }

  /**
   * Dołączenie do klubu kodem (00E i arkusz na 13A) - JEDYNA droga do klubu.
   *
   * Jedzie tokenem OSOBY, a gdy pilot już w jakimś klubie lata - jego tokenem klubu
   * (13A: „Dołącz do innego klubu"). Zgłoszenie `pending` zapisuje się w magazynie osoby,
   * żeby ekran 00C przeżył restart; pilot z własnym profilem magazynu osoby nie dostaje -
   * on pracuje dalej w swoim klubie, a zgłoszenie widzi jako wiersz na liście klubów.
   */
  async joinClub(code: string): Promise<JoinOutcome> {
    const token = await this.tokenForClubless();
    if (token == null) return { kind: 'unreachable' };

    let result: JoinClubResult;
    try {
      result = await this.server.joinClub(token.value, code);
    } catch (error) {
      if (error instanceof ServerRejectedError) throw error;
      return { kind: 'unreachable' };
    }

    if (token.person != null && (result.kind === 'pending' || result.kind === 'rejected')) {
      const clubs =
        result.kind === 'pending'
          ? result.clubs
          : // Odmowa nie niesie kompletu klubów, ale ekran 00D ma po restarcie pokazać
            // ten sam powód - składamy więc widok z jednego, właśnie rozstrzygniętego.
            rejectedClubs(result, token.person.clubs.person);
      await this.credentials.savePerson({ personToken: token.value, clubs });
    }
    return result;
  }

  /**
   * Przełączenie klubu (13A) - nowa para tokenów DLA KLUBU DOCELOWEGO.
   *
   * Warunek pustej kolejki sprawdza WOŁAJĄCY (store sesji zna licznik), bo to decyzja
   * ekranu, a nie poświadczeń: blokada ma podać powód przy karcie klubu, a nie wywalić
   * się wyjątkiem. Tutaj zostaje reguła twarda: bez sieci nie ma przełączenia.
   */
  async switchClub(orgId: string): Promise<SwitchOutcome> {
    const stored = await this.credentials.load();
    if (stored == null) return { kind: 'not_found' };

    let tokens: AuthTokens | null;
    try {
      tokens = await this.server.switchClub(stored.token, orgId);
    } catch (error) {
      if (error instanceof ServerRejectedError && error.status === 401) {
        // Token dostępu wygasł w trakcie - jedna rotacja i ponowienie, jak w syncu.
        const rotated = await this.rotate();
        if (rotated == null) return { kind: 'not_found' };
        tokens = await this.server.switchClub(rotated, orgId);
      } else if (error instanceof ServerRejectedError) {
        throw error;
      } else {
        return { kind: 'unreachable' };
      }
    }
    if (tokens == null) return { kind: 'not_found' };

    // PIN PRZEŻYWA przełączenie: klub zmienia kontekst pracy, nie tożsamość urządzenia.
    // Świeży provisioning zerowałby go i kazał ustawiać PIN po każdej zmianie klubu.
    return { kind: 'switched', stored: await this.store({ ...tokens }, stored.pin ?? null) };
  }

  /** „Zaloguj innym kontem" - porzucenie stanu na TYM telefonie; serwer nic o tym nie wie. */
  async abandonPerson(): Promise<void> {
    await this.credentials.clearPerson();
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
   *
   * TU TEŻ MELDUJE SIĘ KLUB i to jest droga telefonu aktualizowanego z 1.x (§11): stary
   * profil klubu nie zna, a pierwsze odświeżenie tokenów przynosi go razem z parą.
   */
  async rotate(): Promise<string | null> {
    const stored = await this.credentials.load();
    if (stored == null) return null;

    try {
      const tokens = await this.server.refresh(stored.refreshToken);
      const next = await this.store({ ...tokens }, stored.pin ?? null);
      return next.token;
    } catch (error) {
      if (error instanceof ServerRejectedError) {
        // DWA RÓŻNE „NIE" I TYLKO JEDNO MA IMIĘ (2.1.0, D7). `invalid_refresh` znaczy
        // „poświadczenie się zestarzało" - pilot zaloguje się przy okazji i nic się nie
        // stało. `session_revoked` znaczy „administrator wylogował to urządzenie" i to
        // jest DECYZJA CZŁOWIEKA, więc aplikacja ma ją nazwać: baner na 00, powód przy
        // chipie syncu. Znacznik idzie do magazynu, bo musi przeżyć restart.
        //
        // Poświadczeń ani PIN-u NIE RUSZAMY (§3.0): zdalne wylogowanie zatrzymuje
        // wysyłkę, a nie kasuje dnia, którego serwer jeszcze nie ma.
        if (error.code === 'session_revoked' && stored.revoked !== true) {
          await this.credentials.save({ ...stored, revoked: true });
        }
        return null;
      }
      throw error; // brak sieci propagujemy - to „spróbuj później", nie „odmowa"
    }
  }

  /**
   * Wylogowanie - dozwolone WYŁĄCZNIE przy pustym outboxie (§3.0).
   * `outboxCount` podaje wołający, bo licznik żyje w warstwie danych sesji.
   */
  async logout(outboxCount: number): Promise<LogoutBlock> {
    if (outboxCount > 0) return 'outbox_not_empty';

    // SERWER DOWIADUJE SIĘ PIERWSZY (2.1.0, §5.5). Do 2.1.0 telefon przy wylogowaniu
    // nie wołał serwera wcale, więc refresh żył po nim jeszcze 90 dni - a na wspólnym
    // tablecie „wyloguj" ma znaczyć koniec sesji, nie jej ukrycie.
    const stored = await this.credentials.load();
    if (stored != null) {
      try {
        await this.server.logout(stored.refreshToken);
      } catch {
        // BEZ SIECI WYLOGOWUJEMY I TYLE (§9). Pilot stoi przy tablecie i oddaje go
        // następnemu; zatrzymanie go tu z „spróbuj z zasięgiem" byłoby blokadą pracy
        // z powodu, który jego nie dotyczy. Refresh dożyje swoich dni albo zgaśnie
        // przy pierwszej decyzji administratora.
      }
    }

    // KLUB ODCHODZĄCEGO ZOSTAJE KONTEKSTEM URZĄDZENIA - i to nie wymaga tu ani jednej
    // linijki, bo `store()` ustawia go przy każdym wydaniu tokenów. Następny pilot
    // wpisuje swoje trzy litery i rozwiązują się w tym samym klubie.
    await this.credentials.clear();
    await this.credentials.clearPerson();
    return null;
  }

  /**
   * Provisioning urządzenia: komplet poświadczeń do magazynu, stan osoby (jeśli był)
   * wyczyszczony. PIN jest jawnie ZEROWANY - świeży provisioning (także po „Nie pamiętam
   * PIN") przechodzi przez krok „Ustaw PIN", stary skrót nie ma prawa przeżyć.
   */
  private async provision(tokens: AuthTokens): Promise<StoredCredentials> {
    const stored = await this.store(tokens, null);
    await this.credentials.clearPerson();
    return stored;
  }

  /** Zapis pary tokenów + meldunek klubu. Jedno miejsce, bo dróg wydania jest cztery. */
  private async store(
    tokens: AuthTokens,
    pin: StoredCredentials['pin'],
  ): Promise<StoredCredentials> {
    const stored: StoredCredentials = {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      pilot: tokens.pilot,
      pin,
      ...(tokens.org != null ? { org: tokens.org } : {}),
      ...(tokens.memberships != null ? { memberships: tokens.memberships } : {}),
      // Znacznika unieważnienia NIE PRZEPISUJEMY ze starego zapisu i to jest cała jego
      // kasacja: świeża para tokenów znaczy żywą sesję, więc baner na 00 gaśnie sam.
    };
    await this.credentials.save(stored);
    if (tokens.org != null) {
      // KLUB URZĄDZENIA (§5.1, D10) - dopisujemy przy KAŻDYM wydaniu tokenów klubu
      // (logowanie, zatwierdzenie w międzyczasie, przełączenie, rotacja), bo każde z nich
      // dowodzi, że ten tablet obsługuje ten klub. To z tej listy 00F bierze kontekst
      // dla kodu pilota, a 00I - karty wyboru.
      await this.clubs.remember(tokens.org, new Date().toISOString());
      // Klub aktywny PO zapisie poświadczeń: gdyby magazyn zdążył ostemplować zdarzenie
      // klubem, dla którego nie ma jeszcze tokenu, zapis nie miałby czym wyjechać.
      await this.onActiveClub(tokens.org);
    }
    return stored;
  }

  /**
   * Wspólny ogon obu próśb o list (00G i 00H). Jedna funkcja, bo obie mają odpowiadać
   * tak samo: serwer nie rozróżnia adresu znanego od obcego, więc telefon też nie może.
   */
  private async requestLink(send: () => Promise<void>): Promise<LinkOutcome> {
    try {
      await send();
      return { kind: 'sent' };
    } catch (error) {
      if (error instanceof ServerUnreachableError) return { kind: 'unreachable' };
      throw error;
    }
  }

  /**
   * Token do trasy BEZ KLUBU: osoby (00E) albo dowolnego klubu (13A). `null` = telefon
   * nie ma czym się przedstawić, czyli nie ma też jak dołączyć.
   *
   * Zapis osoby wraca razem z tokenem, bo wołający potrzebuje z niego plakietki konta -
   * drugi odczyt magazynu odpowiadałby na to samo pytanie.
   */
  private async tokenForClubless(): Promise<{
    value: string;
    /** Niepuste = to jest droga OSOBY (00E); `null` = pilot z własnym profilem (13A). */
    person: StoredPerson | null;
  } | null> {
    const person = await this.credentials.loadPerson();
    if (person != null) return { value: person.personToken, person };
    const stored = await this.credentials.load();
    return stored == null ? null : { value: stored.token, person: null };
  }
}

/**
 * Domyślne kluby urządzenia - W PAMIĘCI, nie atrapa milcząca.
 *
 * Konstruktor przyjmuje port opcjonalnie, bo blisko trzydzieści przekrojów (sync, ślad,
 * zgłoszenia, motyw) buduje ten serwis wyłącznie po to, żeby mieć skąd wziąć token -
 * i logowania nie dotyka. Wersja pusta, która ZAPOMINA to, co przed chwilą zapisano,
 * byłaby jednak kłamstwem w każdym teście, który jej dotknie: lepiej, żeby domyślna
 * implementacja zachowywała się poprawnie i po prostu nie przeżywała restartu.
 */
function memoryDeviceClubs(): DeviceClubsPort {
  let record: DeviceClubsRecord = { clubs: [], activeId: null };
  return {
    read: async () => record,
    remember: async (club, at) => {
      record = {
        clubs: [{ id: club.id, name: club.name, lastLoginAt: at }, ...record.clubs.filter((c) => c.id !== club.id)],
        activeId: club.id,
      };
    },
    setActive: async (orgId) => {
      if (record.clubs.some((c) => c.id === orgId)) record = { ...record, activeId: orgId };
    },
  };
}

/** Widok jednego, właśnie odrzuconego członkostwa - żeby 00D przeżyło restart. */
const rejectedClubs = (
  rejected: { org: OrgRef; rejectReason: string | null; decidedAt: string | null },
  person: ClubsView['person'],
): ClubsView => ({
  person,
  status: 'rejected',
  memberships: [
    {
      org: rejected.org,
      clubActive: true,
      status: 'rejected',
      code: null,
      role: 'pilot',
      rejectReason: rejected.rejectReason,
      createdAt: new Date().toISOString(),
      decidedAt: rejected.decidedAt,
    },
  ],
});
