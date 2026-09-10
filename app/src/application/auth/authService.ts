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
import type { PinCryptoPort } from '../ports/pinCryptoPort';
import {
  ServerRejectedError,
  type AuthTokens,
  type ClubsView,
  type JoinClubResult,
  type OrgRef,
  type ServerPort,
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

export class AuthService {
  constructor(
    private readonly server: ServerPort,
    private readonly credentials: CredentialsPort,
    private readonly pinCrypto: PinCryptoPort,
    /** Domyślnie nic - testy warstwy poświadczeń nie mają magazynu i nie muszą mieć. */
    private readonly onActiveClub: ActiveClubSink = async () => {},
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
    };
    await this.credentials.save(stored);
    // Klub PO zapisie poświadczeń: gdyby magazyn zdążył ostemplować zdarzenie klubem,
    // dla którego nie ma jeszcze tokenu, zapis nie miałby czym wyjechać.
    if (tokens.org != null) await this.onActiveClub(tokens.org);
    return stored;
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
