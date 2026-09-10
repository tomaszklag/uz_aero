/**
 * UZ Aero (serwer) - PORTY warstwy aplikacji.
 *
 * Ta sama zasada co w aplikacji mobilnej: komendy i zapytania znają WYŁĄCZNIE te
 * interfejsy; implementacje (Postgres, zegar systemowy, krypto) wstrzykuje composition
 * root. Dzięki temu testy jadą na PGlite i sterowanym zegarze bez jednej atrapy
 * „udającej" logikę.
 *
 * Uproszczony CQRS: komendy piszą i zwracają wynik, zapytania czytają projekcje.
 * Bez szyny zdarzeń i bez osobnej bazy odczytu - projekcje odświeżamy synchronicznie
 * w tej samej transakcji, w której przyjmujemy zdarzenia. Przy skali klubu (jeden
 * serwer, kilkunastu pilotów) każdy dodatkowy ruchomy element to koszt bez zysku.
 */

import type {
  ConsumptionNorm,
  Event,
  FlagStatus,
  FlagType,
  OperationType,
  PhaseSegment,
  ReferenceAircraft,
  ReferencePilot,
} from '@uzaero/domain';

import type { BugSeverity, BugStatus } from '../../domain/bugReports.ts';
import type { MembershipStatus } from '../../domain/memberships.ts';
import type { PilotRole, PlatformRole } from '../../domain/roles.ts';

// ── magazyn ─────────────────────────────────────────────────────────────────────

/**
 * Minimalny interfejs bazy - spełniają go strukturalnie i `pg.Pool`, i PGlite.
 * To jest nasz „port bazodanowy": adaptery przyjmują `Queryable`, więc test może
 * podać bazę w procesie, a produkcja pulę połączeń, bez żadnej warstwy tłumaczącej.
 */
export interface Queryable {
  query<R = unknown>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

/**
 * Baza z transakcjami. Przyjęcie paczki zdarzeń jest atomowe: wstawienie + odświeżenie
 * projekcji + flagi w JEDNEJ transakcji - telefon, który dostał odpowiedź, może uznać
 * zdarzenia za dostarczone, a stan `sessions` nigdy nie wyprzedza ani nie goni `events`.
 */
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

// ── piloci i uwierzytelnienie ───────────────────────────────────────────────────

/**
 * OSOBA po stronie serwera - jedna na cały serwer, wspólna dla klubów, w których lata
 * (wielofirmowość, issue #98). Powstaje przy PIERWSZYM logowaniu Googlem - bez żadnego
 * członkostwa (epik D, `docs/wielofirmowosc.md` §4) - albo wprost z panelu (administrator
 * wpisuje wtedy e-mail, a konto Google podpina się przy pierwszym logowaniu -
 * `docs/logowanie-google.md` §6). Hasha nie ma i mieć nie będzie: hasła znikły
 * z produktu 2026-09-04.
 *
 * ══ CZEGO TU NIE MA OD WIELOFIRMOWOŚCI: KODU I ROLI ══
 * Kod pilota i rola panelu są własnością CZŁONKOSTWA w klubie (`Membership`), nie osoby:
 * ten sam człowiek bywa `TMK` w jednym klubie i `TOM` w drugim, administratorem tu
 * i zwykłym pilotem tam. `active` znaczy odtąd blokadę PLATFORMOWĄ (nakłada ją wyłącznie
 * superadministrator); codzienne „wyłącz konto" w panelu klubu jest stanem członkostwa.
 */
export interface PilotAccount {
  id: string;
  name: string;
  /**
   * Adres konta Google, którym ten pilot się loguje - JEDYNE pole, przez które e-mail
   * cokolwiek uwierzytelnia, i wyłącznie przy PIERWSZYM podpięciu. Wpisuje je
   * administrator albo seed, nigdy użytkownik.
   */
  email: string | null;
  active: boolean;
  /** Rola PLATFORMOWA (`src/domain/roles.ts`); `null` = zwykła osoba. */
  platformRole: PlatformRole | null;
  /**
   * Unieważnienie poświadczeń OSOBY (`pilots.credentials_valid_from`, §3.4) - dla tokenu
   * OSOBY (bez klubu) to jedyna data, jaką ma sprawdzać: członkostwa on nie wskazuje.
   */
  credentialsValidFrom: Date | null;
}

/**
 * CZŁONKOSTWO osoby w klubie - kim ten człowiek jest W TYM klubie
 * (`docs/wielofirmowosc.md` §3.2).
 *
 * Niesie klub w komplecie (`orgName`, `orgSlug`, `orgActive`), bo każdy czytelnik
 * członkostwa potrzebuje go zaraz potem: logowanie wybiera klub i wpisuje go do tokenu,
 * odpowiedź logowania nazywa klub pilotowi, brama pyta, czy klub działa. Drugie zapytanie
 * po klub przy każdym z tych miejsc byłoby N+1 na ścieżce, która ma być tania.
 */
export interface Membership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgActive: boolean;
  /** Kod pilota W TYM klubie; `null` wyłącznie przy `pending` (CHECK w bazie). */
  code: string | null;
  role: PilotRole;
  status: MembershipStatus;
  /** Unieważnienie poświadczeń PER KLUB - druga z dwóch dat, które sprawdza brama. */
  credentialsValidFrom: Date | null;
  /**
   * Powód odrzucenia zgłoszenia (`rejected`) - pilot czyta go na 00D, więc jedzie w każdej
   * liście klubów osoby; `null` w pozostałych stanach.
   */
  rejectReason: string | null;
  /** Chwila zgłoszenia (kod klubu) albo dopisania; 00C pokazuje „czeka od". */
  createdAt: Date;
  /** Chwila decyzji administratora klubu; `null`, dopóki zgłoszenie czeka. */
  decidedAt: Date | null;
}

/**
 * Członkostwo tak, jak widzi je BRAMA UPRAWNIEŃ panelu (`http/authorize.ts`): osoba
 * + klub + rola, spłaszczone do jednego wiersza czytanego przy KAŻDYM żądaniu.
 *
 * Osobny typ od `Membership`, bo brama pyta o inny przekrój: nazwisko (do `Actor`
 * i stopki panelu), DWIE daty unieważnienia (osoby i członkostwa) i aktywność jako
 * KONIUNKCJĘ trzech rzeczy - osoba nie jest zablokowana platformowo, klub działa,
 * członkostwo jest `active`. Każda z nich osobno odbiera dostęp i brama nie ma powodu
 * rozróżniać, która (dla panelu wszystkie znaczą „zaloguj się").
 */
export interface MembershipAuthSnapshot {
  pilotId: string;
  orgId: string;
  code: string;
  name: string;
  /** Osoba aktywna platformowo I klub działa I członkostwo `active`. */
  active: boolean;
  role: PilotRole;
  /**
   * Od kiedy poświadczenia OSOBY są ważne (`pilots.credentials_valid_from`). `null` =
   * nigdy ich nie unieważniano. Token wydany WCZEŚNIEJ nie przechodzi bramy - to jedyny
   * sposób, w jaki deaktywacja zrywa sesję PANELU, która nie ma wiersza w bazie.
   */
  credentialsValidFrom: Date | null;
  /** To samo dla CZŁONKOSTWA (`memberships.credentials_valid_from`, §3.4). */
  membershipCredentialsValidFrom: Date | null;
}

export interface PilotsPort {
  findById(id: string): Promise<PilotAccount | null>;
  /**
   * Wszystkie członkostwa osoby, w porządku nazwy klubu - logowanie wybiera z nich
   * klub aktywny, ekran 13a pokazuje przełącznik przy więcej niż jednym.
   */
  memberships(pilotId: string): Promise<Membership[]>;
  /** Członkostwo w JEDNYM klubie; `null` = osoba nie należy do tego klubu. */
  membership(pilotId: string, orgId: string): Promise<Membership | null>;
  /** Projekcja dla bramy panelu: rola, aktywność i znaczniki unieważnienia w klubie z tokenu. */
  authSnapshot(pilotId: string, orgId: string): Promise<MembershipAuthSnapshot | null>;
}

/**
 * Preferencje pilota (dziś wyłącznie motyw) - wędrują za pilotem między urządzeniami
 * (decyzja 2026-07-29). `themeUpdatedAt` to stempel DECYZJI nadany przez telefon:
 * oś rozstrzygania LWW, celowo różna od `updated_at` konta.
 */
export interface PilotPrefs {
  theme: string | null;
  themeUpdatedAt: Date | null;
}

/**
 * Osobny port od `PilotsPort` nie dla symetrii, tylko dlatego, że tamten jest CZYSTYM
 * odczytem kont (zapis kont mieszka w seedzie/administratorze) - a preferencje są
 * jedynym miejscem, w którym pilot pisze do własnego wiersza.
 */
export interface PilotPrefsPort {
  /** `null` = pilot nie istnieje (token przeżył konto - stan patologiczny). */
  get(pilotId: string): Promise<PilotPrefs | null>;
  /**
   * Zapis LWW: skutek WYŁĄCZNIE, gdy `updatedAt` jest ściśle NOWSZY niż zapisany
   * stempel (brak stempla = każdy wygrywa). Warunek siedzi w SQL-u, nie w odczycie
   * przed zapisem - dwa telefony tego samego pilota nie prześcigną się timingiem.
   */
  setIfNewer(pilotId: string, theme: string, updatedAt: Date): Promise<void>;
}

/** Podpisywanie i weryfikacja JWT sesji (HS256). */
/**
 * Tożsamość odczytana z tokenu - to, na podstawie czego trasy podejmują decyzje.
 *
 * ══ TOKEN NIESIE OSOBĘ I KLUB (decyzja właściciela 2026-09-08, wielofirmowość §6) ══
 * `orgId` jest kontekstem KAŻDEJ trasy klubowej: flota, przejęcie, rejestr, karta arkusza
 * należą do klubu z tokenu. `code` i `role` są kodem i rolą Z CZŁONKOSTWA w tym klubie.
 * Przełączenie klubu to NOWA para tokenów (`POST /auth/switch`, epik F), nie nagłówek -
 * drugie źródło prawdy o klubie obok tokenu było rozważone i odrzucone.
 */
export interface Identity {
  pilotId: string;
  orgId: string;
  code: string;
  role: PilotRole;
}

/**
 * Tożsamość ODCZYTANA z tokenu razem z CHWILĄ JEGO WYDANIA.
 *
 * `issuedAt` nie jest polem wejściowym `sign` - chwilę wydania zna wyłącznie ten, kto
 * podpisuje, i sam ją wpisuje z zegara. Osobny typ zamiast pola opcjonalnego w
 * `Identity`, żeby żaden wołający `sign` nie mógł tej wartości podać ani zapomnieć.
 */
export interface VerifiedIdentity extends Identity {
  /**
   * `iat` w SEKUNDACH epoki (RFC 7519). `0` = token sprzed wprowadzenia claimu
   * (`pilots.credentials_valid_from`) - czyli „wydany przed czasem", więc każde
   * unieważnienie poświadczeń
   * go obejmuje. Domyślna wartość idzie w stronę BEZPIECZNĄ, nigdy w stronę zaufania.
   */
  issuedAt: number;
}

/**
 * OSOBA BEZ KLUBU - adresat tokenu OSOBY (`purpose: 'person'`; wielofirmowość §4,
 * dawny token rejestracyjny z `docs/logowanie-google.md` §5).
 *
 * Od epiku D osoba powstaje przy pierwszym logowaniu Googlem, więc token wskazuje
 * wiersz `pilots` wprost (`sub` = identyfikator osoby), tak jak token platformowy.
 * Otwiera dokładnie dwie trasy: `GET /auth/memberships` (stan zgłoszeń, ekran 00C)
 * i `POST /auth/join` (kod klubu, ekran 00E). Żadnej trasy klubu - osoba bez klubu
 * nie ma czego w klubie zapisać.
 */
export interface PersonIdentity {
  pilotId: string;
}

/**
 * Tożsamość osoby ODCZYTANA z tokenu razem z chwilą wydania (jak `VerifiedIdentity`).
 * `issuedAt` = `iat` w sekundach epoki; `0` = brak claimu, czyli „wydany przed czasem" -
 * domyślna wartość odbiera dostęp, nigdy go nie przyznaje.
 */
export interface VerifiedPersonIdentity extends PersonIdentity {
  issuedAt: number;
}

/**
 * Tożsamość PLATFORMOWA - superadministrator bez klubu (wielofirmowość §3.3).
 *
 * Osobny rodzaj tokenu, nie token klubu z pustym `org`: trasy klubowe MUSZĄ dostać
 * `orgId` zawsze (inaczej każda z nich musiałaby obsłużyć `null`), a superadministrator
 * nie ma klubu z definicji. Rozłączność `verify()` / `verifyPlatform()` jest tą samą
 * własnością bezpieczeństwa, co przy tokenie rejestracyjnym.
 */
export interface PlatformIdentity {
  pilotId: string;
}

export interface VerifiedPlatformIdentity extends PlatformIdentity {
  issuedAt: number;
}

export interface TokenService {
  /** Zwraca podpisany token dostępu dla pilota W KLUBIE. */
  sign(claims: Identity, ttlSec: number): string;
  /** Zwraca claims albo `null` - token zły/wygasły/bez klubu. Nigdy nie rzuca. */
  verify(token: string): VerifiedIdentity | null;

  /** Token sesji panelu SUPERADMINISTRATORA - otwiera wyłącznie trasy `platform.manage`. */
  signPlatform(claims: PlatformIdentity, ttlSec: number): string;
  /** Rozłączny z `verify`: token klubu tu nie przechodzi, platformowy nie przechodzi tam. */
  verifyPlatform(token: string): VerifiedPlatformIdentity | null;

  /**
   * Token OSOBY - jedyne poświadczenie, jakie dostaje ktoś bez aktywnego członkostwa
   * (wielofirmowość §4). Otwiera dokładnie dwie trasy: `GET /auth/memberships`
   * (ekran 00C) i `POST /auth/join` (ekran 00E).
   */
  signPerson(claims: PersonIdentity, ttlSec: number): string;

  /**
   * ══ TE DWIE PARY MUSZĄ BYĆ ROZŁĄCZNE I TO JEST WŁASNOŚĆ BEZPIECZEŃSTWA ══
   * `verify` odrzuca każdy token osoby, a `verifyPerson` każdy token klubu. Bez tego
   * rozdziału token osoby bez klubu byłby ważną TOŻSAMOŚCIĄ bez `org` - a wtedy
   * `POST /events` zapisywałby zdarzenia do klubu, którego w tokenie nie ma. Podpis
   * HMAC tego nie łapie: token jest nasz, tylko wystawiony w innym celu.
   */
  verifyPerson(token: string): VerifiedPersonIdentity | null;
}

/**
 * Refresh tokeny: NIEPRZEZROCZYSTE losowe wartości w bazie (hash), nie JWT.
 * Powód: refresh żyje długo (§3.0 - wygasły JWT nie wylogowuje), więc musi dać się
 * unieważnić po stronie serwera; JWT z natury unieważnić się nie da.
 */
export interface RefreshTokensPort {
  /** Para tokenów jest parą DLA KLUBU (§6) - refresh niesie klub, dla którego ją wydano. */
  issue(pilotId: string, orgId: string, expiresAt: Date): Promise<string>;
  /**
   * ATOMOWA rotacja: unieważnia stary i wydaje nowy w jednej transakcji.
   * Rozdzielone consume+issue (audyt) zostawiały okno, w którym crash/zgubiona
   * odpowiedź kasowały stary token bez wydania nowego - a pełne ponowne logowanie
   * wymaga sieci, więc łamałoby obietnicę §3.0. `null` = token nieznany/wygasły.
   * Nowy refresh zostaje w TYM SAMYM klubie - przełączenie klubu to osobna trasa.
   */
  rotate(
    token: string,
    newExpiresAt: Date,
  ): Promise<{ pilotId: string; orgId: string; token: string } | null>;
  /**
   * Klub OSTATNIO używany przez osobę - z najświeższego refresha; `null` = nigdy nie
   * logowała się na telefonie. Logowanie wybiera z tego klub aktywny przy więcej niż
   * jednym członkostwie (§5), zamiast pytać pilota za każdym razem.
   */
  lastOrgFor(pilotId: string): Promise<string | null>;
}

// ── tożsamości zewnętrzne (logowanie Google) ────────────────────────────────────

/**
 * Konto U DOSTAWCY - ZAWSZE podpięte do osoby (wielofirmowość §4, epik D). Statusów
 * `pending`/`rejected` tu nie ma od 2.0.0: oczekiwanie i odrzucenie dotyczą KLUBU
 * i mieszkają na członkostwie (`Membership.status`), bo ta sama osoba może czekać
 * w jednym klubie i być odrzucona w drugim.
 *
 * `email` i `name` pochodzą Z TOKENU dostawcy - panel pokazuje je w kolejce zgłoszeń
 * obok nazwiska osoby. Nazwisko i adres OSOBY (`pilots`) zaczynają się od nich przy
 * pierwszym logowaniu, ale potem należą do osoby i wolno je zmienić w panelu.
 */
export interface ExternalIdentity {
  provider: string;
  subject: string;
  pilotId: string;
  email: string;
  name: string;
  createdAt: Date;
  /**
   * Ostatnie wejście DO KLUBU tą tożsamością (tokeny klubu z logowania albo
   * z `GET /auth/memberships`). Dla tokenu OSOBY to JEDNORAZOWOŚĆ: wejście późniejsze
   * niż wydanie tokenu znaczy, że ten token już zrobił swoje - skopiowany nie może być
   * fabryką kolejnych par tokenów (audyt 2026-09-05, reguła przeniesiona z tokenu
   * rejestracyjnego).
   */
  lastLoginAt: Date | null;
}

/**
 * Profil odczytany z ZWERYFIKOWANEGO tokenu dostawcy - wyjście `IdentityProviderPort`.
 *
 * `emailVerified` jest polem osobnym i nieusuwalnym, bo od niego zależy jedyne miejsce
 * w systemie, w którym e-mail cokolwiek uwierzytelnia (podpięcie konta, §6).
 */
export interface ProviderProfile {
  provider: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * Weryfikacja tokenu tożsamości od dostawcy zewnętrznego.
 *
 * Port, a nie funkcja, właśnie dlatego, że ma DRUGĄ implementację: produkcja pobiera
 * klucze Google przez sieć, a testy podstawiają weryfikator z kluczem w procesie.
 * Bez tego każdy test logowania wymagałby internetu i cudzej infrastruktury.
 */
/**
 * KTÓRA powierzchnia pyta - rozstrzyga dopuszczalne `aud` tokenu. Telefon loguje się
 * klientem Android, panel klientem Web; token jednej powierzchni NIE otwiera drugiej.
 * Bez tego rozdziału token zdobyty w kontekście przeglądarki (8-godzinna sesja bez
 * refresha, §8.4) dałoby się wymienić na trasie telefonu na 90-dniowy refresh
 * (audyt 2026-09-05).
 */
export type LoginSurface = 'mobile' | 'panel';

export interface IdentityProviderPort {
  /** `null` = token nieważny (podpis, `iss`, `aud` dla tej powierzchni, termin). Nigdy nie rzuca z powodu treści. */
  verifyIdToken(idToken: string, surface: LoginSurface): Promise<ProviderProfile | null>;
}

export interface ExternalIdentitiesPort {
  find(provider: string, subject: string): Promise<ExternalIdentity | null>;
  /** Tożsamość OSOBY - jedna na osobę (`idx_external_identities_pilot`); `null` = nigdy nie logowała się Googlem. */
  findByPilot(pilotId: string): Promise<ExternalIdentity | null>;

  /**
   * NOWA OSOBA z profilu dostawcy + tożsamość podpięta do niej - jedna transakcja
   * (wielofirmowość §4: osoba powstaje przy pierwszym logowaniu, bez członkostwa).
   *
   * Adres z Google trafia na osobę WYŁĄCZNIE gdy dostawca go potwierdził
   * (`emailVerified`) i gdy nikt go jeszcze nie ma: `pilots.email` jest listą, po której
   * panel dopisuje członkostwo do istniejącej osoby, więc adres niepotwierdzony byłby
   * drogą do podszycia się pod kogoś, komu administrator dopiero wpisze ten adres.
   *
   * `null` = przegrany wyścig dwóch pierwszych logowań tej samej tożsamości: wołający
   * czyta wtedy wiersz założony przez zwycięzcę. Osoba z przegranej próby NIE zostaje
   * w bazie - dlatego transakcja, a nie dwa polecenia.
   */
  createPerson(profile: ProviderProfile, personId: string): Promise<ExternalIdentity | null>;

  /**
   * PODPIĘCIE do istniejącego konta po zweryfikowanym e-mailu (§6) - `null`, gdy nie
   * ma do czego podpiąć. Wołający MUSI wcześniej sprawdzić `emailVerified`.
   *
   * Operacja jest JEDNYM poleceniem SQL i to jest wymóg, nie optymalizacja: rozbita na
   * odczyt konta i zapis tożsamości zostawiałaby okno, w którym dwa równoległe
   * logowania podpinają dwie tożsamości do jednego konta.
   */
  claimByVerifiedEmail(profile: ProviderProfile): Promise<ExternalIdentity | null>;

  /** Stempel ostatniego wejścia do klubu - patrz `ExternalIdentity.lastLoginAt`. */
  markLogin(provider: string, subject: string, at: Date): Promise<void>;
}

// ── dane referencyjne ───────────────────────────────────────────────────────────

/**
 * STAN POCZĄTKOWY jednostki (issue #66) - zerowe ogniwo łańcucha odczytów.
 *
 * Co pokazywały przyrządy, gdy maszynę wprowadzono do UZ Aero. Każde pole osobno
 * `null` („administrator nie wpisał"), bo klub potrafi znać licznik i nie znać oleju.
 *
 * ══ TO NIE JEST PRZEKAZANIE I DLATEGO MA WŁASNY TYP ══
 * `Handover` odpowiada na pytanie „co zostawił poprzedni pilot"; ten typ - „od czego
 * ta maszyna zaczyna". Serwer składa z niego przekazanie DOPIERO wtedy, gdy rejestr nie
 * ma czym odpowiedzieć (`aircraftStateView.pickHandover`), i oznacza je `byPilotId: null`.
 */
export interface AircraftSeed {
  mh: number | null;
  fuelL: number | null;
  oilL: number | null;
  /**
   * Kiedy wpis powstał - `aircraft.updated_at`, czyli ostatni zapis wiersza w panelu.
   *
   * Świadomie NIE nazywamy tego chwilą pomiaru: wiersz rusza się przy każdej zmianie
   * konfiguracji. Nazwa pola mówi „zapis w panelu" i tak samo ma o nim mówić ekran -
   * `updated_at` pod etykietą „stan z" byłby inną wielkością pod tą samą nazwą
   * (ta sama pułapka, co przy `disabledAt` w kontrakcie floty).
   */
  enteredAt: number;
}

/**
 * ODCZYT MASZYNY WPISANY RĘKĄ ADMINISTRATORA (issue #81) - nadrzędny stan licznika,
 * paliwa i oleju z komentarzem (tabela `aircraft_readings`, append-only).
 *
 * ══ TO JEST INNA LICZBA NIŻ STAN POCZĄTKOWY ══
 * `AircraftSeed` mówi „od czego ta maszyna zaczyna" i przestaje znaczyć od pierwszej
 * zdanej operacji. Ten typ mówi „administrator ZDECYDOWAŁ, że teraz jest tak" - i ma
 * wyprzedzać historię: wchodzi do wyboru przekazania jako KONKURENT zdania samolotu
 * (`aircraftStateView.pickHandover`), a wygrywa ten, kto stoi dalej w łańcuchu MH.
 * Kolejne zdanie z wyższym licznikiem wypiera go samo - stąd `mh` jest obowiązkowe:
 * bez licznika wpis nie ma miejsca w łańcuchu.
 *
 * Nie jedzie na telefon jako osobne pole: telefon dostaje z niego gotowe przekazanie
 * z `origin: 'admin'` (ta sama zasada, co przy stanie początkowym).
 */
export interface AdminReading {
  mh: number;
  fuelL: number;
  /** `null` = administrator nie znał stanu oleju; kotwica oleju zostaje przy rejestrze. */
  oilL: number | null;
  /** Komentarz - WYMAGANY: nadpisuje się cudze odczyty, więc powód jest treścią wpisu. */
  note: string;
  /** Konto administratora, które wpisało odczyt. */
  byPilotId: string;
  /** Chwila WPISU (epoch ms UTC) - nie pomiaru, jak przy stanie początkowym. */
  at: number;
}

/**
 * Port odczytów administratora - w `common/`, bo czytają go OBIE powierzchnie:
 * `GET /reference` (telefon) i karta samolotu w panelu; pisze wyłącznie komenda panelu.
 */
export interface AircraftReadingsPort {
  /** Ostatni wpis maszyny KLUBU; `null` = nigdy nie wpisano (albo maszyna cudzego klubu). */
  latest(db: Queryable, orgId: string, aircraftId: string): Promise<AdminReading | null>;
  /** Ostatnie wpisy CAŁEJ floty klubu jednym zapytaniem, klucz = `aircraft.id`. */
  latestAll(db: Queryable, orgId: string): Promise<Map<string, AdminReading>>;
  /** Najświeższy `created_at` wpisów klubu - składnik ETagu `/reference`. */
  latestAt(db: Queryable, orgId: string): Promise<Date | null>;
  /** `orgId` = klub maszyny (wiersz niesie go denormalizowany, jak każda tabela klubu). */
  insert(tx: Queryable, orgId: string, aircraftId: string, reading: AdminReading): Promise<void>;
}

// ── zgłoszenia błędów z aplikacji pilota (issue #87, na czas testów) ────────────

/**
 * Zgłoszenie tak, jak przyszło z telefonu. Kluczem jest `uuid` NADANY NA TELEFONIE -
 * ta sama idempotencja, co w rejestrze zdarzeń: ponowienie wysyłki po zerwanym
 * połączeniu nie robi drugiego zgłoszenia.
 */
export interface NewBugReport {
  uuid: string;
  /** Zegar TELEFONU - chwila, w której pilot to widział, nie chwila dostarczenia. */
  createdAt: Date;
  /** `null` = pilot nie wybrał wagi; pole jest w formularzu opcjonalne. */
  severity: BugSeverity | null;
  description: string;
  /** Czytelna etykieta miejsca („KOKPIT · arkusz TANKOWANIE") - kolumna listy panelu. */
  screen: string;
  appVersion: string | null;
  /** Operacja, przy której powstało zgłoszenie; `null` poza kokpitem i logiem. */
  sessionUuid: string | null;
  /**
   * KOMPLET kontekstu okna - miejsce, operacja, wydanie, telefon, stan łączności.
   *
   * Nieprzezroczysty dla serwera i to jest decyzja: kształt będzie się zmieniał co
   * tydzień testów, a nikt nie pyta go o nic poza „pokaż wszystko". Walidacja
   * ogranicza się do rozmiaru (trasa) - bramka na polach kosztowałaby wdrożenie
   * serwera przy każdej nowej rzeczy, którą telefon zaczyna dołączać.
   */
  context: Record<string, unknown>;
}

/**
 * Zgłoszenie tak, jak widzi je panel: to, co przysłał telefon, plus obsługa.
 *
 * Kod i nazwisko przychodzą ZŁĄCZENIEM w adapterze, nie osobnym odpytaniem kont -
 * ta sama decyzja, co w `AdminPilotJoin`. `null` znaczy „konta już nie ma": zgłoszenie
 * zostaje, bo opisuje aplikację, a nie człowieka.
 *
 * `org` jest KLUBEM, w którym pilot pracował, gdy zobaczył błąd (epik C wielofirmowości,
 * issue #99): zgłoszenia czyta wyłącznie SUPERADMINISTRATOR, na jednej liście dla
 * wszystkich klubów, więc każdy wiersz musi nazwać swój klub sam.
 */
export interface BugReportRecord extends NewBugReport {
  pilotId: string;
  pilotCode: string | null;
  pilotName: string | null;
  org: { id: string; slug: string; name: string };
  /** Zegar SERWERA - przy wysyłce po dwóch dniach bez zasięgu różnica jest treścią. */
  receivedAt: Date;
  status: BugStatus;
  statusNote: string | null;
  /** Identyfikator administratora, który przestawił status; `null` = nigdy nie zmieniano. */
  statusBy: string | null;
  /** Jego kod - napis dla człowieka, tym samym złączeniem co wyżej. */
  statusByCode: string | null;
  statusAt: Date | null;
}

/** Wynik przyjęcia paczki - kształt `PushResult` z ingestu, bo pytanie jest to samo. */
export interface BugReportIntake {
  accepted: number;
  duplicates: number;
}

export interface BugReportsPort {
  /**
   * Wstawia paczkę, pomijając uuidy już znane. `db`, a nie `tx`: przyjęcie zgłoszenia
   * nie ma nic do zsynchronizowania z rejestrem ani z projekcjami - to zapis obok
   * systemu, nie w nim. `orgId` = klub z tokenu telefonu: zgłoszenie dotyczy ekranu
   * w konkretnym klubie i czyta je panel TEGO klubu.
   */
  insertMany(
    db: Queryable,
    orgId: string,
    pilotId: string,
    reports: NewBugReport[],
  ): Promise<BugReportIntake>;
  /**
   * Lista dla panelu, od najnowszego zgłoszenia. `statuses` puste = wszystkie.
   *
   * Bez keysetu, inaczej niż rejestr zdarzeń i dziennik audytu: to jest lista JEDNEJ
   * fazy testów, liczona w setkach wierszy, a nie rosnący bez końca rejestr klubu.
   * Stronicowanie dołożymy, gdy `limit` zacznie coś ucinać - dziś kosztowałoby
   * kursor w adresie i nie odpowiadałoby na żadne pytanie.
   *
   * ══ BEZ `orgId` - I TO JEST DECYZJA, NIE PRZEOCZENIE (issue #99, C6) ══
   * Zgłoszenia opisują APLIKACJĘ, nie dziennik klubu, i czyta je wyłącznie
   * superadministrator na platformie - dla wszystkich klubów naraz. Żadna trasa
   * klubu tego portu nie woła; klub każdego wiersza jedzie w `BugReportRecord.org`.
   */
  list(
    db: Queryable,
    filter: { statuses: readonly BugStatus[]; limit: number },
  ): Promise<BugReportRecord[]>;
  byUuid(db: Queryable, uuid: string): Promise<BugReportRecord | null>;
  /**
   * Przestawia status. Zwraca `false`, gdy zgłoszenia nie ma - trasa robi z tego 404,
   * zamiast udawać sukces na nieistniejącym wierszu.
   *
   * `tx`, bo to JEDYNA operacja panelu na tej tabeli i idzie przez `AuditedWrite`:
   * decyzja o cudzym zgłoszeniu ma ślad w dzienniku, jak każda inna.
   */
  setStatus(
    tx: Queryable,
    uuid: string,
    change: { status: BugStatus; note: string | null; by: string; at: Date },
  ): Promise<boolean>;
  /** Liczba zgłoszeń per status - plakietka przy zakładce panelu. */
  countByStatus(db: Queryable): Promise<Record<BugStatus, number>>;
}
/** Flota + piloci dla `GET /reference` (§4.6, §4.8). */
export interface ReferenceSnapshot {
  aircraft: ReferenceAircraft[];
  pilots: ReferencePilot[];
  /** Najświeższy `updated_at` - podstawa ETagu i adnotacji wieku cache w aplikacji. */
  updatedAt: Date | null;
  /**
   * Stan początkowy floty (issue #66), klucz = `aircraft.id`; brak klucza = nie wpisano.
   *
   * OBOK `aircraft`, a nie W `ReferenceAircraft`, bo telefon tych liczb NIE DOSTAJE:
   * serwer składa z nich przekazanie i wysyła gotowe. Pole na drucie, którego nikt nie
   * czyta, to drugie źródło tej samej prawdy - i pierwsze miejsce, w którym za pół roku
   * ktoś policzy coś inaczej niż `pickHandover`.
   */
  initial: ReadonlyMap<string, AircraftSeed>;
}

export interface ReferencePort {
  /**
   * Flota i piloci JEDNEGO klubu (wielofirmowość §7.1): aktywny klub z tokenu jest
   * kontekstem floty i przejęcia, a kod pilota na liście jest kodem Z CZŁONKOSTWA w nim.
   */
  snapshot(orgId: string): Promise<ReferenceSnapshot>;
}

/**
 * OŚ FAZ PIONOWYCH lotu (wznoszenie / przelot / zniżanie) dla sesji.
 *
 * Wynik zależy WYŁĄCZNIE od śladu GPS - nie od rejestru zdarzeń. Dzięki temu da się go
 * cache'ować obok nagrania: korekta czasu startu zmienia okno lotu, ale nie zmienia ani
 * jednego odcinka tej osi. Pusta lista znaczy „ten dzień nie ma nagrania" i jest wynikiem
 * pełnoprawnym: interwały tej sesji zostają wtedy bez rozbicia na fazy pionowe.
 */
export interface PhaseTimelinePort {
  read(sessionUuid: string): Promise<PhaseSegment[]>;
}

/**
 * NORMA ZUŻYCIA per samolot (`aircraft_consumption`) - materializacja modelu dla telefonów.
 *
 * Port jest w `common/`, bo normę PRODUKUJE analityka panelu, a KONSUMUJE aplikacja
 * pilota (`GET /reference`). Liczenie jej na żądanie telefonu odpada: `/reference`
 * odpytuje każdy telefon co kwadrans, a model czyta strumienie kilkudziesięciu sesji.
 */
export interface ConsumptionNormPort {
  /** Uuidy zamkniętych dni samolotu KLUBU w oknie - wejście przeliczenia. */
  closedSessionUuids(
    db: Queryable,
    orgId: string,
    aircraftId: string,
    range: { fromMs: number; toMs: number },
  ): Promise<string[]>;

  /**
   * Zapisuje normę; `norm === null` KASUJE wiersz. Model, który przestał się publikować,
   * nie ma prawa dalej podpowiadać starej liczby.
   */
  save(
    db: Queryable,
    orgId: string,
    aircraftId: string,
    windowDays: number,
    norm: ConsumptionNorm | null,
    computedAt: Date,
  ): Promise<void>;

  /** Normy całej floty KLUBU, po `aircraft_id` - wejście `GET /reference`. */
  all(db: Queryable, orgId: string): Promise<Map<string, ConsumptionNorm>>;

  /**
   * Najświeższy stempel policzenia w klubie - trzeci składnik ETagu referencji. Bez niego
   * przeliczenie modeli (bez zmiany sesji ani konfiguracji) nie dotarłoby do telefonów,
   * bo `304` zamroziłoby poprzednią odpowiedź.
   */
  latestComputedAt(db: Queryable, orgId: string): Promise<Date | null>;
}

// ── zdarzenia, sesje, flagi (M2) ────────────────────────────────────────────────

export interface EventsStorePort {
  /**
   * Wstawia paczkę; duplikaty po `uuid` pomija (idempotencja synca §4.3).
   *
   * `orgId` przychodzi OSOBNO, bo `Event` z `@uzaero/domain` klubu nie zna i znać nie ma
   * (wielofirmowość §2: żadna reguła domeny nie czyta `org_id`) - klub jest własnością
   * WIERSZA rejestru, a rozstrzyga o nim wołający: token telefonu albo klub sesji
   * przy zapisie z panelu.
   */
  insertBatch(
    tx: Queryable,
    orgId: string,
    events: readonly Event[],
    sourceDevice: string | null,
  ): Promise<{ accepted: number; duplicates: number }>;
  /**
   * Pełny strumień sesji KLUBU - wejście `projectSession`.
   *
   * ══ KLUB JEST PARAMETREM KAŻDEGO ODCZYTU (epik C wielofirmowości, issue #99) ══
   * Sesja cudzego klubu daje pusty strumień - dokładnie tak, jak nieistniejąca. Wołający
   * zna klub zawsze: z tokenu (telefon), z aktora (panel) albo z wiersza projekcji
   * (eksport, przebudowa). Odczyt „po samym uuid-zie" nie istnieje, bo uuid nie jest
   * poświadczeniem - a nazwa karty arkusza pokazała, jak łatwo zgadnąć cudzy adres.
   */
  sessionEvents(db: Queryable, orgId: string, sessionUuid: string): Promise<Event[]>;
  /**
   * Strumienie WIELU sesji klubu jednym zapytaniem - wejście analityki zużycia (`A10a`).
   *
   * DLACZEGO OSOBNA METODA, A NIE `sessionEvents` W PĘTLI: okno 90 dni to ~50 sesji
   * na samolot, a rok - ponad 200. Pętla oznaczałaby tyleż round-tripów na jedno
   * otwarcie ekranu; `WHERE session_uuid = ANY($1)` załatwia to jednym.
   *
   * DLACZEGO W TYM PORCIE, A NIE W NOWYM: `contract.test.ts` liczy wywołania tego
   * portu, żeby pilnować reguły „listy panelu nie odtwarzają projekcji ze strumienia"
   * (§7.5). Nowy port byłby furtką POZA tym licznikiem - tutaj gwarancja robi się
   * mocniejsza, nie słabsza.
   */
  sessionStreams(
    db: Queryable,
    orgId: string,
    sessionUuids: readonly string[],
  ): Promise<Map<string, Event[]>>;
  /** Znacznik ostatniego przyjęcia zdarzenia samolotu klubu (do `last_sync_at`). */
  lastReceivedAt(db: Queryable, orgId: string, aircraftId: string): Promise<Date | null>;
  /** Liczba zdarzeń sesji klubu przyjętych przez serwer (do `sync-status`). */
  countForSession(db: Queryable, orgId: string, sessionUuid: string): Promise<number>;
}

/** Wiersz projekcji `sessions` - zrzut `projectSession`, nigdy źródło prawdy. */
export interface SessionRow {
  sessionUuid: string;
  /**
   * Klub operacji (wielofirmowość §3.5) - NIE z projekcji, bo `SessionState` klubu nie
   * zna: przepisany z klubu zdarzeń, które ją zbudowały. Niezmiennik
   * `events.org_id = sessions.org_id = aircraft.org_id` pilnuje ingest przy zapisie.
   */
  orgId: string;
  aircraftId: string;
  picId: string;
  dualId: string | null;
  /** 'voided' = sesja unieważniona w całości (2026-08-30) - patrz `sessionRow`. */
  status: 'active' | 'closed' | 'voided';
  /**
   * `SessionState.claimedAt` - czas PRZEJĘCIA samolotu, czyli zdarzenia `session_claim`
   * (decyzja 2026-08-07; wcześniej kolumna niosła meldunek - uzasadnienie w `mappers/sessionRow.ts`).
   * `null` = strumień bez claimu, czyli rejestr niekompletny; wg §4.4 nie powinien wystąpić.
   */
  claimTime: number | null;
  closeTime: number | null;
  /**
   * Rodzaj operacji i klient dnia - wymiary listy dni panelu (`A02`).
   * Wartości pochodzą z projekcji, nie z ponownego czytania payloadów: reguła
   * „agreguj wartości projekcji, nigdy nie odtwarzaj projekcji SQL-em".
   */
  operation: OperationType | null;
  client: string | null;
  /**
   * Notatka pilota do dnia (`sessions.notes`, issue #14) - wolny tekst z `preflight_confirm`.
   * `null` = dzień bez notatki (stan normalny, nie „nieprzeliczony"). Stoi obok
   * `client`, bo pochodzi z tego samego zdarzenia i z tej samej projekcji; różni je
   * ODBIORCA: klienta czyta panel i statystyki, notatkę - podpowiedzi preflightu.
   */
  notes: string | null;
  mhStart: number | null;
  mhEnd: number | null;
  fuelStartL: number | null;
  fuelEndL: number | null;
  fuelLastL: number | null;
  mhLast: number | null;
  blockMs: number;
  flightMs: number;
  flightsCount: number;
  /**
   * Kolumny statystyk (kolumny statystyk) - wejście agregatów `A10`.
   *
   * Wszystkie są NULL-owalne z JEDNEGO powodu: wiersz zapisany przed migracją ma tu
   * `NULL` do czasu przebudowy projekcji (`A11`) i agregat musi umieć to odróżnić od
   * zera. `sessionRowFrom` NIGDY nie pisze `null` w liczniki (`takeoffCount`,
   * `dropCount`, …) - `null` czytany z bazy znaczy więc zawsze „nieprzeliczone".
   * `mhDeltaH`/`fuelConsumedL` bywają `null` także w świeżym wierszu: bilans dnia
   * istnieje dopiero z odczytem końcowym `day_close` (reguła projekcji).
   */
  takeoffCount: number | null;
  landingCount: number | null;
  mhDeltaH: number | null;
  fuelConsumedL: number | null;
  dropCount: number | null;
  jumpersTandem: number | null;
  jumpersAff: number | null;
  jumpersSolo: number | null;
  /** Suma wysokości zrzutów Z FIXEM i ich licznik - średnia zakresu = suma / licznik. */
  dropAltSumFt: number | null;
  dropAltCount: number | null;
  /**
   * Olej (issue #60): pomiar z przejęcia i SUMA dolanego (para z preflightu + zdarzenia
   * `oil_add`). `oilLevelL: null` = pomiaru nie było - stan zwykły dla sesji sprzed
   * modułu i wpisów ręcznych, NIE „nieprzeliczone". Z tych kolumn składa się
   * przekazanie oleju w `GET /reference` (`Handover.oil`).
   */
  oilLevelL: number | null;
  oilAddedL: number | null;

  /**
   * Bieg silnika - PIERWSZA i OSTATNIA chwila pracy śmigła w tej sesji.
   *
   * To NIE JEST `claimTime`/`closeTime`: przejęcie i zdanie samolotu to chwile WOKOŁ
   * biegu, czasem odległe o godziny (pilot bierze maszynę rano, uruchamia po południu).
   * Podstawienie jednego za drugie w logu dnia byłoby kłamstwem o godzinie lotu.
   *
   * `null` = sesja bez uruchomienia (przejęta i zdana bez lotu) albo wiersz sprzed
   * kolumn logu, do przebudowy projekcji.
   */
  engineStartAt: number | null;
  engineStopAt: number | null;

  /**
   * Koperta LOTOW wewnątrz biegu: pierwszy start i ostatnie lądowanie.
   *
   * `null` przy sesji BEZ LOTU (próba silnika, pogoda, usterka) - to jest stan świata,
   * a nie brak danych, i log ma go pokazywać jako pustą komórkę, nie jako zero.
   */
  firstTakeoffAt: number | null;
  lastLandingAt: number | null;

  /**
   * Lotniska sesji z `preflight_confirm`.
   *
   * `arrivalIcao: null` bywa NORMĄ, nie brakiem: przy operacji na jednym placu (skoki,
   * issue #13) drugiego lotniska nie ma z definicji. Czytelnik musi znać rodzaj
   * operacji, żeby odróżnić „to samo lotnisko" od „nie wiadomo" - dlatego log pokazuje
   * jedno i drugie w tej samej komórce.
   */
  departureIcao: string | null;
  arrivalIcao: string | null;

  /**
   * Suma zdarzeń `refuel` w sesji (litry).
   *
   * Do 2026-08-30 ta liczba żyła WYŁĄCZNIE w pamięci projekcji, więc panel znał stan
   * paliwa przed i po, ale nie wiedział, ile dolano między nimi - a bez tego trzeciej
   * liczby bilans sesji jest nie do przeczytania.
   */
  fuelAddedL: number | null;

  /**
   * Sesja wpisana RĘCZNIE po fakcie (`session_claim.manualEntry`, ekran 15 aplikacji).
   *
   * Z metody zdarzeń tego nie da się wywieść (`manual` niesie też lot zapisany
   * przyciskami na żywo), więc znacznik jedzie jawnie od telefonu. `null` = wiersz
   * sprzed kolumny, do przebudowy projekcji.
   */
  manualEntry: boolean | null;

  /**
   * Stan oleju, z którym silnik ruszył: pomiar plus dolewka.
   *
   * PRZEPISUJEMY wartość policzoną przez domenę, zamiast dodawać dwie liczby w panelu
   * - bo to nie jest zwykła suma: dolewka BEZ pomiaru poziomu nie zna (`oil.afterL`
   * jest wtedy `null`, mimo że `addedL` bywa niezerowe). Naiwne `level + added` dałoby
   * w tym wypadku liczbę wziętą znikąd.
   */
  oilAfterL: number | null;
}

/**
 * KTO JEST WŁAŚCICIELEM sesji - jedyne pytanie o wiersz projekcji zadawane BEZ klubu.
 *
 * Istnieje dla ingestu (issue #99, C2): paczka z telefonu niesie uuid sesji, a serwer
 * musi rozstrzygnąć, czy ta sesja już należy do KOGOŚ (innego pilota → `403`, innego
 * klubu → wstrzymanie), ZANIM cokolwiek zapisze pod klubem z tokenu. Skopowany `get`
 * odpowiedziałby „nie ma takiej sesji" i ingest założyłby DRUGĄ, w cudzym kluczu -
 * dwa strumienie pod jednym uuid-em, każdy widoczny w innym klubie.
 */
export interface SessionOwner {
  orgId: string;
  picId: string;
  status: SessionRow['status'];
}

export interface SessionsProjectionPort {
  upsert(tx: Queryable, row: SessionRow): Promise<void>;
  /** Wiersz projekcji sesji KLUBU; `null` = nie ma jej w tym klubie (także: jest w cudzym). */
  get(db: Queryable, orgId: string, sessionUuid: string): Promise<SessionRow | null>;
  /** Właściciel sesji po samym uuid-zie - WYŁĄCZNIE dla ingestu i śladu, patrz `SessionOwner`. */
  ownerOf(db: Queryable, sessionUuid: string): Promise<SessionOwner | null>;
  listByAircraft(db: Queryable, orgId: string, aircraftId: string): Promise<SessionRow[]>;
  /**
   * Sesje jednego PILOTA W KLUBIE - do wykrywania nakładki jego czasu (`pilot_overlap`, §4.7).
   *
   * Osobno od `listByAircraft`, bo to inna OŚ: nakładka grafiku idzie w poprzek maszyn,
   * więc nie da się jej zobaczyć, patrząc na jeden samolot. Filtrujemy po `pic_id`, czyli
   * po PIC-u sesji - Dual nie jest piszącym i nie odpowiada za jej istnienie (§4.1 pkt 3).
   *
   * Nakładka MIĘDZY klubami nie jest wykrywana - świadomie (issue #99): flaga stoi
   * w dzienniku jednego klubu, a wskazywałaby operację drugiego, czyli byłaby wyciekiem.
   */
  listByPilot(db: Queryable, orgId: string, picId: string): Promise<SessionRow[]>;
  /**
   * Sesje jednej maszyny przejęte w danym oknie czasu - SKŁAD KARTY DOBY (§4.7).
   *
   * Osobno od `listByAircraft`, choć zawężenie jest jego podzbiorem: tamten czyta CAŁĄ
   * historię maszyny (łańcuch MH potrzebuje sąsiedztwa sesji przez lata), a eksport
   * potrzebuje jednej doby. Użycie tamtego znaczyłoby wczytywanie całego nalotu
   * samolotu przy każdym zdaniu maszyny - koszt rosnący bez granicy za odpowiedź
   * o dwudziestu czterech godzinach.
   *
   * Okno jest po `claim_time`, czyli po CHWILI PRZEJĘCIA, i granice są DOMKNIĘTE
   * (`utcDayRange`). Sesja rozpoczęta o 23:50 i zdana po północy należy do doby swojego
   * przejęcia - ta sama reguła, co w projekcji dnia pilota (`projectPilotDay`).
   *
   * Wynik jest UPORZĄDKOWANY chronologicznie: karta numeruje zmiany `S1`, `S2`…, więc
   * kolejność jest treścią, a nie przypadkiem planera.
   */
  listByAircraftDay(
    db: Queryable,
    orgId: string,
    aircraftId: string,
    range: { fromMs: number; toMs: number },
  ): Promise<SessionRow[]>;
}

/**
 * Konfiguracja samolotu potrzebna REGUŁOM serwera (dziś: pojemność zbiorników do
 * tolerancji `fuel_mismatch`, §4.5).
 *
 * Osobny, jednometodowy port zamiast sięgnięcia po `ReferenceRepo`: tamten buduje CAŁĄ
 * migawkę floty z ETagiem pod cache telefonów i czyta poza transakcją, a ingest
 * potrzebuje jednej liczby WEWNĄTRZ swojej transakcji.
 */
export interface AircraftConfigPort {
  /** `null` = samolot nieznany W TYM KLUBIE albo bez skonfigurowanej pojemności. */
  capacityL(db: Queryable, orgId: string, aircraftId: string): Promise<number | null>;
  /**
   * Klub, do którego maszyna należy; `null` = maszyna nieznana rejestrowi floty.
   *
   * Wejście JEDYNEJ nowej odmowy ingestu (wielofirmowość §3.5): zdarzenie z tokenu klubu A
   * do maszyny klubu B nie ma miękkiej wersji - zapis do cudzego klubu jest odrzucany,
   * nie flagowany.
   */
  orgIdOf(db: Queryable, aircraftId: string): Promise<string | null>;
}

/**
 * Wiersz flagi po stronie serwera. Kształt „na drucie" (`type`, `sessionUuids`) idzie
 * z domeny - `SessionFlag` w `@uzaero/domain` - bo telefon czyta dokładnie te pola
 * z `/sessions/:uuid/sync-status`. Reszta (`id`, `details`, `status`) jest sprawą
 * panelu i na telefon nie jedzie.
 */
export interface FlagRecord {
  id: number;
  /** Klub flagi = klub maszyny (wielofirmowość §3.5). Na telefon nie jedzie. */
  orgId: string;
  type: FlagType;
  aircraftId: string;
  sessionUuids: string[];
  details: Record<string, unknown>;
  status: FlagStatus;
}

export interface FlagsPort {
  /**
   * Zapewnia OTWARTĄ flagę (typ + ten sam zestaw sesji) - wstawia tylko, gdy nie ma.
   * Ponowny sync tych samych danych nie może mnożyć flag.
   */
  ensureOpen(
    tx: Queryable,
    flag: {
      orgId: string;
      type: FlagType;
      aircraftId: string;
      sessionUuids: string[];
      details: Record<string, unknown>;
    },
  ): Promise<void>;
  openForSession(db: Queryable, orgId: string, sessionUuid: string): Promise<FlagRecord[]>;
  openForAircraft(db: Queryable, orgId: string, aircraftId: string): Promise<FlagRecord[]>;
}

// ── eksport dzienny (§4.7) ──────────────────────────────────────────────────────

/**
 * Dzienna karta arkusza: tytuł wg konwencji §4.7 (`YYYY-MM-DD_SP-XXX`) + zawartość
 * tabelaryczna jako wiersze komórek. Kształt jest CELOWO niezależny od Google API -
 * budowa treści to czysta funkcja domeny eksportu, a jak te wiersze trafiają do
 * arkusza (i czym jest „karta" u dostawcy), wie wyłącznie adapter.
 */
export interface DaySheet {
  tab: string;
  rows: string[][];
}

export interface SheetsPort {
  /**
   * Zapisuje/nadpisuje dzienną kartę arkusza KLUBU; zwraca URL karty.
   *
   * `orgId` osobno od `DaySheet`, bo karta jest dokumentem klubu, a jej treść - czystą
   * funkcją strumienia (`buildDaySheet` klubu nie zna). Nazwa karty (znak + doba) jest
   * jedyna dopiero W KLUBIE (wielofirmowość §3.6): dwa kluby z tą samą rejestracją
   * produkują tę samą nazwę tego samego dnia.
   */
  writeDaySheet(orgId: string, sheet: DaySheet): Promise<{ url: string }>;
}

/** Zapisana karta dzienna: dosłowna treść + stempel ostatniego nadpisania (rewizji). */
export interface StoredDaySheet {
  tab: string;
  rows: string[][];
  updatedAt: Date;
}

/**
 * Odczyt zapisanych kart - OSOBNY port, nie metoda `SheetsPort`. Stronę zapisu
 * implementuje KAŻDY dostawca arkuszy (bazodanowy dziś, Google po dostarczeniu
 * klucza serwisowego - podmiana tego samego portu), ale odczyt po nazwie istnieje
 * wyłącznie dlatego, że karty serwujemy z własnej bazy (`GET /sheets/:tab`).
 * U Google „odczytem" jest sam arkusz pod `sheet_url` - doklejenie tej metody do
 * `SheetsPort` zmuszałoby przyszły adapter do martwego kodu.
 */
/**
 * ADRES kart klubu (issue #99, C5): slug wchodzi do ścieżki, a SEKRET (`sheets_key`)
 * do zapytania `?k=`. Sekret jest jedynym poświadczeniem czytelnika linku - skarbnik
 * klubu otwiera kartę bez logowania, a klub, który sekret ujawnił, zmieni go w panelu
 * (epik E). Kształt mieszka tu, bo składa go ten sam adapter, który karty pisze.
 */
export interface SheetAddress {
  orgId: string;
  slug: string;
  sheetsKey: string;
}

export interface SheetsReadPort {
  /**
   * Karta klubu po nazwie (`YYYY-MM-DD_SP-XXX`); `null` = nigdy nie wyeksportowano.
   * Klub przychodzi z TOKENU czytającego albo z adresu ze slugiem - karta cudzego klubu
   * o tej samej nazwie jest dla czytającego nieistniejąca.
   */
  readDaySheet(orgId: string, tab: string): Promise<StoredDaySheet | null>;
  /** Klub po slugu z adresu karty; `null` = nie ma takiego klubu (albo jest wyłączony). */
  addressOf(slug: string): Promise<SheetAddress | null>;
}

/**
 * Wpis dziennika eksportu (§5.3 `export_log`) - CZŁONKOSTWO jednej sesji w jednej
 * rewizji karty doby.
 *
 * Od 2026-08-07 (karta = doba samolotu) jedna rewizja ma tyle wierszy, ile sesji weszło
 * do karty, i wszystkie niosą ten sam numer. Powód jest jeden: `GET /sessions/:uuid/
 * sync-status` (ekran 11 telefonu) pyta o link PO SESJI, więc powiązanie sesja→karta
 * musi istnieć dla KAŻDEJ zmiany, a nie tylko dla tej, która eksport wyzwoliła.
 */
export interface ExportRecord {
  sessionUuid: string;
  /** Doba karty jako `YYYY-MM-DD` (UTC z chwili przejęcia) - prefiks nazwy karty. */
  day: string;
  aircraftId: string;
  sheetUrl: string;
  /** 1 = pierwszy eksport TEJ DOBY; każda kolejna budowa karty podbija o 1 (§4.7). */
  revision: number;
  exportedAt: Date;
}

/**
 * Jedna REWIZJA karty doby: jeden zapis do arkusza, N wierszy dziennika.
 *
 * Osobny typ od `ExportRecord`, a nie tablica tamtych, bo rewizja jest NIEPODZIELNA -
 * `day`, `aircraftId`, `sheetUrl`, `revision` i `exportedAt` muszą być we wszystkich
 * wierszach identyczne. Tablica `ExportRecord[]` pozwalałaby złożyć komplet, w którym
 * dwie sesje jednej karty mają różny numer rewizji, i nic by tego nie zatrzymało.
 */
export interface ExportCardRecord {
  /** Klub karty = klub maszyny; wiersze dziennika niosą go jak każda tabela klubu. */
  orgId: string;
  day: string;
  aircraftId: string;
  sheetUrl: string;
  revision: number;
  exportedAt: Date;
  /** Sesje WCHODZĄCE w tę rewizję - po jednym wierszu dziennika na każdą. */
  sessionUuids: readonly string[];
}

/**
 * Dziennik eksportu jest append-only jak reszta systemu: regeneracja karty to NOWY
 * komplet wierszy z kolejną rewizją, nie nadpisanie - historia „co i kiedy poszło do
 * arkusza" zostaje do audytu, a `sync-status` czyta po prostu najświeższy wpis sesji.
 */
export interface ExportLogPort {
  /**
   * Ostatnia rewizja karty, w której ta sesja WYSTĄPIŁA; `null` = nigdy nie weszła
   * do żadnej karty. To jest odpowiedź dla ekranu 11: „gdzie leżą moje dane".
   */
  latest(db: Queryable, orgId: string, sessionUuid: string): Promise<ExportRecord | null>;
  /**
   * Numer ostatniej rewizji KARTY (pary doba+samolot) w klubie; `0` = jeszcze nie
   * eksportowano.
   *
   * Osobno od `latest`, bo pytania są dwa i mają różne klucze. Nowa sesja dołączająca
   * do już wyeksportowanej doby nie ma ANI JEDNEGO własnego wiersza - gdyby numer
   * kolejnej rewizji liczyć z `latest(jej uuid)`, karta zaczęłaby od jedynki po raz
   * drugi i dziennik przestałby być osią czasu jednego dokumentu.
   */
  latestRevision(db: Queryable, orgId: string, day: string, aircraftId: string): Promise<number>;
  /** Dopisuje CAŁĄ rewizję: po jednym wierszu na sesję, jednym zapytaniem. */
  appendCard(db: Queryable, card: ExportCardRecord): Promise<void>;
  /**
   * Blokada advisory na dzienniku JEDNEJ KARTY (para doba+samolot), ważna do końca
   * transakcji. Wołana PRZED `latestRevision` przez każdego, kto zaraz nada kolejny numer.
   *
   * ══ CZEGO PILNUJE ══
   * Sekwencji „odczytaj ostatnią rewizję → dodaj jeden → dopisz wiersze". Bez niej
   * spóźniona paczka z telefonu i kliknięcie „Ponów" w panelu, trafione w tę samą
   * chwilę, czytają ten sam stan i obie chcą zapisać rewizję 3 - a dziennik, w którym
   * numer rewizji nie jest jednoznaczny, przestaje odpowiadać na pytanie „co i kiedy
   * poszło do arkusza". Drugi zapis odbija się o `UNIQUE (day,
   * aircraft_id, revision, session_uuid)`; blokada sprawia, że do tego odbicia w ogóle
   * nie dochodzi w normalnej pracy.
   *
   * **Klucz blokady MUSI być tym samym kluczem, co rewizja.** Do 2026-08-07 blokowała
   * sesję i było to poprawne, dopóki rewizja należała do sesji; po przejściu na kartę
   * doby blokada per sesja przepuściłaby dwa równoległe eksporty TEJ SAMEJ karty
   * wyzwolone przez dwie różne zmiany.
   *
   * ══ CZEGO NIE PILNUJE ══
   * Treści karty. `exported_sheets` jest UPSERT-em po nazwie i wygrywa zapis późniejszy
   * - co jest poprawne, bo obie strony budują kartę z TYCH SAMYCH strumieni zdarzeń.
   *
   * Kształt klucza mieszka w adapterze, bo nazwa klucza advisory jest szczegółem
   * Postgresa - ta sama decyzja, co przy `FleetAdminPort.lockAircraft`.
   */
  lock(tx: Queryable, day: string, aircraftId: string): Promise<void>;
}

// ── ślad kalibracyjny GPS (faza 5) ─────────────────────────────────────────────

/**
 * Zrzut śladu kalibracyjnego z telefonów (`POST /traces`): surowe fixy + markery
 * detektora, materiał do kalibracji progów §3.3 i replayu przez `runDetector`.
 * To NIE są zdarzenia domenowe - nie dotykają Postgresa ani projekcji; lądują
 * w plikach NDJSON per sesja, bo analiza i tak jest offline (skrypt replay).
 */
export interface TraceSinkPort {
  /** Dopisuje wpisy (append); grupowanie per sesja robi adapter. */
  append(pilotId: string, entries: Record<string, unknown>[]): Promise<void>;
}

/**
 * ODCZYT śladu jednej sesji - do mapy lotu w panelu (`A02c-slad.html`).
 *
 * Osobny port od `TraceSinkPort`, mimo wspólnego magazynu, bo to dwie różne
 * odpowiedzialności o różnych wymaganiach: zapis jest gorący (kilkanaście telefonów
 * dopisuje w kółko) i musi być tani, odczyt jest rzadki (administrator otwiera mapę)
 * i może sobie pozwolić na przeczytanie całego pliku sesji. Sklejenie ich w jeden port
 * kazałoby adapterowi zapisu deklarować metodę, której zapis nigdy nie użyje.
 *
 * Zwracamy SUROWE wiersze - filtrowanie po oknie lotu i bramkę jakości robi domena
 * (`buildFlightTrack`), tym samym kodem, którym liczy je telefon.
 */
export interface TraceSourcePort {
  /**
   * Wpisy śladu jednej sesji, w kolejności zapisu. Pusta tablica, gdy sesja nie ma
   * zapisu - brak pliku NIE jest błędem: lot mógł być wpisany ręcznie, telefon mógł
   * nie zdążyć wysłać, a ślad i tak nigdy nie był rejestrem (wariant 14B).
   */
  read(sessionUuid: string): Promise<Record<string, unknown>[]>;
}

// ── zegar ───────────────────────────────────────────────────────────────────────

/** Czas jako port - testy okna refresh tokenów sterują nim jawnie. */
export interface Clock {
  now(): Date;
}
