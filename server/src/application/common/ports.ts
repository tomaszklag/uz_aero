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
import type { PilotRole } from '../../domain/roles.ts';

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
 * Konto pilota po stronie serwera.
 *
 * Powstaje przez ZATWIERDZENIE zgłoszenia rejestracyjnego albo wprost z panelu
 * (administrator wpisuje wtedy e-mail, a konto podpina się przy pierwszym logowaniu
 * Google - `docs/logowanie-google.md` §6). Hasha nie ma i mieć nie będzie: hasła znikły
 * z produktu 2026-09-04.
 */
export interface PilotAccount {
  id: string;
  code: string;
  name: string;
  /**
   * Adres konta Google, którym ten pilot się loguje - JEDYNE pole, przez które e-mail
   * cokolwiek uwierzytelnia, i wyłącznie przy PIERWSZYM podpięciu. Wpisuje je
   * administrator albo seed, nigdy użytkownik.
   */
  email: string | null;
  active: boolean;
  /** Uprawnienia w panelu administracyjnym (`src/domain/roles.ts`). */
  role: PilotRole;
}

/**
 * Konto tak, jak widzi je BRAMA UPRAWNIEŃ panelu (`http/authorize.ts`) - bez hasha.
 *
 * Osobny typ od `PilotAccount` i to jest cała jego treść. `PilotAccount` istnieje dla
 * LOGOWANIA, więc niesie `passwordHash`; brama hasła nie weryfikuje, a mimo to czytała
 * go przy KAŻDYM żądaniu panelu i wnosiła aż do warstwy HTTP (`AuthOutcome.account`).
 * Hash, który wjeżdża tam, gdzie nie jest potrzebny, prędzej czy później gdzieś się
 * zserializuje - jeden brak pola jest tańszy niż dyscyplina „pamiętaj, żeby go nie
 * wypisać". Ta sama zasada, co przy `AdminPilotAccount` po stronie panelu.
 */
export interface PilotAuthSnapshot {
  id: string;
  code: string;
  name: string;
  active: boolean;
  role: PilotRole;
  /**
   * Od kiedy poświadczenia tego konta są ważne. `null` = nigdy ich nie
   * unieważniano. Token wydany WCZEŚNIEJ nie przechodzi bramy - to jedyny sposób,
   * w jaki reset hasła i deaktywacja zrywają sesję PANELU, która nie ma wiersza
   * w bazie (podpisany JWT w ciasteczku `HttpOnly`).
   */
  credentialsValidFrom: Date | null;
}

export interface PilotsPort {
  findById(id: string): Promise<PilotAccount | null>;
  /** Projekcja dla bramy panelu: rola, aktywność i znacznik unieważnienia - bez hasha. */
  authSnapshot(id: string): Promise<PilotAuthSnapshot | null>;
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
/** Tożsamość odczytana z tokenu - to, na podstawie czego trasy podejmują decyzje. */
export interface Identity {
  pilotId: string;
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
 * Kto zgłosił się przez dostawcę zewnętrznego, ale NIE MA jeszcze konta pilota -
 * adresat tokenu rejestracyjnego (`docs/logowanie-google.md` §5).
 *
 * Para `(provider, subject)` jest kluczem głównym `external_identities`, więc token
 * nie potrzebuje żadnego surogatu: wskazuje wiersz wprost.
 */
export interface RegistrationIdentity {
  provider: string;
  subject: string;
}

/**
 * Tożsamość zgłoszenia ODCZYTANA z tokenu razem z chwilą wydania (jak `VerifiedIdentity`).
 * `issuedAt` = `iat` w sekundach epoki; `0` = brak claimu, czyli „wydany przed czasem" -
 * domyślna wartość odbiera dostęp, nigdy go nie przyznaje.
 */
export interface VerifiedRegistration extends RegistrationIdentity {
  issuedAt: number;
}

export interface TokenService {
  /** Zwraca podpisany token dostępu dla pilota. */
  sign(claims: Identity, ttlSec: number): string;
  /** Zwraca claims albo `null` - token zły/wygasły. Nigdy nie rzuca. */
  verify(token: string): VerifiedIdentity | null;

  /**
   * Token ZGŁOSZENIA - jedyne poświadczenie, jakie dostaje ktoś bez konta pilota.
   * Otwiera dokładnie jedną trasę: `GET /auth/registration` (ekran `00c`).
   */
  signRegistration(claims: RegistrationIdentity, ttlSec: number): string;

  /**
   * ══ TE DWIE PARY MUSZĄ BYĆ ROZŁĄCZNE I TO JEST WŁASNOŚĆ BEZPIECZEŃSTWA ══
   * `verify` odrzuca każdy token rejestracyjny, a `verifyRegistration` każdy token
   * pilota. Bez tego rozdziału token zgłoszenia byłby ważną TOŻSAMOŚCIĄ wskazującą
   * nieistniejące konto - a wtedy `POST /events` zapisywałby zdarzenia z `pilot_id`,
   * za którym nikt nie stoi. Podpis HMAC tego nie łapie: token jest nasz, tylko
   * wystawiony w innym celu.
   */
  verifyRegistration(token: string): VerifiedRegistration | null;
}

/**
 * Refresh tokeny: NIEPRZEZROCZYSTE losowe wartości w bazie (hash), nie JWT.
 * Powód: refresh żyje długo (§3.0 - wygasły JWT nie wylogowuje), więc musi dać się
 * unieważnić po stronie serwera; JWT z natury unieważnić się nie da.
 */
export interface RefreshTokensPort {
  issue(pilotId: string, expiresAt: Date): Promise<string>;
  /**
   * ATOMOWA rotacja: unieważnia stary i wydaje nowy w jednej transakcji.
   * Rozdzielone consume+issue (audyt) zostawiały okno, w którym crash/zgubiona
   * odpowiedź kasowały stary token bez wydania nowego - a pełne ponowne logowanie
   * wymaga sieci, więc łamałoby obietnicę §3.0. `null` = token nieznany/wygasły.
   */
  rotate(token: string, newExpiresAt: Date): Promise<{ pilotId: string; token: string } | null>;
}

// ── tożsamości zewnętrzne (logowanie Google) ────────────────────────────────────

/** Stan zgłoszenia: `docs/logowanie-google.md` §3.1. */
export type IdentityStatus = 'pending' | 'linked' | 'rejected';

/**
 * Konto U DOSTAWCY przez całe swoje życie: zgłoszenie → zatwierdzone albo odrzucone.
 *
 * `email` i `name` pochodzą Z TOKENU dostawcy i służą wyłącznie administratorowi przy
 * decyzji. To NIE są `pilots.email` ani `pilots.name`: tamte wpisuje administrator,
 * i tylko tamten e-mail cokolwiek znaczy przy podpinaniu konta.
 */
export interface ExternalIdentity {
  provider: string;
  subject: string;
  /** `null` dopóki niezatwierdzone. Niepustość jest RÓWNOWAŻNA `status === 'linked'`. */
  pilotId: string | null;
  email: string;
  name: string;
  status: IdentityStatus;
  rejectReason: string | null;
  createdAt: Date;
  /** Chwila decyzji administratora; `null` dopóki zgłoszenie czeka. Ekran `00d` ją cytuje. */
  decidedAt: Date | null;
  /**
   * Pierwsze/ostatnie wejście na konto tą tożsamością. Dla tokenu rejestracyjnego to
   * JEDNORAZOWOŚĆ: ustawione znaczy „ktoś już wszedł" (tym tokenem albo Googlem), więc
   * skopiowany token nie może być fabryką kolejnych par tokenów (audyt 2026-09-05).
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

  /** Nowe zgłoszenie (`pending`) - konta pilota NIE tworzy. */
  createPending(profile: ProviderProfile): Promise<ExternalIdentity>;

  /**
   * PODPIĘCIE do istniejącego konta po zweryfikowanym e-mailu (§6) - `null`, gdy nie
   * ma do czego podpiąć. Wołający MUSI wcześniej sprawdzić `emailVerified`.
   *
   * Operacja jest JEDNYM poleceniem SQL i to jest wymóg, nie optymalizacja: rozbita na
   * odczyt konta i zapis tożsamości zostawiałaby okno, w którym dwa równoległe
   * logowania podpinają dwie tożsamości do jednego konta.
   */
  claimByVerifiedEmail(profile: ProviderProfile): Promise<ExternalIdentity | null>;

  /** Stempel ostatniego wejścia - wyłącznie informacyjny, dla panelu. */
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
  /** Ostatni wpis maszyny; `null` = nigdy nie wpisano. */
  latest(db: Queryable, aircraftId: string): Promise<AdminReading | null>;
  /** Ostatnie wpisy CAŁEJ floty jednym zapytaniem, klucz = `aircraft.id`. */
  latestAll(db: Queryable): Promise<Map<string, AdminReading>>;
  /** Najświeższy `created_at` w tabeli - składnik ETagu `/reference`. */
  latestAt(db: Queryable): Promise<Date | null>;
  insert(tx: Queryable, aircraftId: string, reading: AdminReading): Promise<void>;
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
 */
export interface BugReportRecord extends NewBugReport {
  pilotId: string;
  pilotCode: string | null;
  pilotName: string | null;
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
   * systemu, nie w nim.
   */
  insertMany(db: Queryable, pilotId: string, reports: NewBugReport[]): Promise<BugReportIntake>;
  /**
   * Lista dla panelu, od najnowszego zgłoszenia. `statuses` puste = wszystkie.
   *
   * Bez keysetu, inaczej niż rejestr zdarzeń i dziennik audytu: to jest lista JEDNEJ
   * fazy testów, liczona w setkach wierszy, a nie rosnący bez końca rejestr klubu.
   * Stronicowanie dołożymy, gdy `limit` zacznie coś ucinać - dziś kosztowałoby
   * kursor w adresie i nie odpowiadałoby na żadne pytanie.
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
  snapshot(): Promise<ReferenceSnapshot>;
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
  /** Uuidy zamkniętych dni samolotu w oknie - wejście przeliczenia. */
  closedSessionUuids(
    db: Queryable,
    aircraftId: string,
    range: { fromMs: number; toMs: number },
  ): Promise<string[]>;

  /**
   * Zapisuje normę; `norm === null` KASUJE wiersz. Model, który przestał się publikować,
   * nie ma prawa dalej podpowiadać starej liczby.
   */
  save(
    db: Queryable,
    aircraftId: string,
    windowDays: number,
    norm: ConsumptionNorm | null,
    computedAt: Date,
  ): Promise<void>;

  /** Normy całej floty, po `aircraft_id` - wejście `GET /reference`. */
  all(db: Queryable): Promise<Map<string, ConsumptionNorm>>;

  /**
   * Najświeższy stempel policzenia - trzeci składnik ETagu referencji. Bez niego
   * przeliczenie modeli (bez zmiany sesji ani konfiguracji) nie dotarłoby do telefonów,
   * bo `304` zamroziłoby poprzednią odpowiedź.
   */
  latestComputedAt(db: Queryable): Promise<Date | null>;
}

// ── zdarzenia, sesje, flagi (M2) ────────────────────────────────────────────────

export interface EventsStorePort {
  /** Wstawia paczkę; duplikaty po `uuid` pomija (idempotencja synca §4.3). */
  insertBatch(
    tx: Queryable,
    events: readonly Event[],
    sourceDevice: string | null,
  ): Promise<{ accepted: number; duplicates: number }>;
  /** Pełny strumień sesji - wejście `projectSession`. */
  sessionEvents(db: Queryable, sessionUuid: string): Promise<Event[]>;
  /**
   * Strumienie WIELU sesji jednym zapytaniem - wejście analityki zużycia (`A10a`).
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
    sessionUuids: readonly string[],
  ): Promise<Map<string, Event[]>>;
  /** Znacznik ostatniego przyjęcia zdarzenia samolotu (do `last_sync_at`). */
  lastReceivedAt(db: Queryable, aircraftId: string): Promise<Date | null>;
  /** Liczba zdarzeń sesji przyjętych przez serwer (do `sync-status`). */
  countForSession(db: Queryable, sessionUuid: string): Promise<number>;
}

/** Wiersz projekcji `sessions` - zrzut `projectSession`, nigdy źródło prawdy. */
export interface SessionRow {
  sessionUuid: string;
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

export interface SessionsProjectionPort {
  upsert(tx: Queryable, row: SessionRow): Promise<void>;
  get(db: Queryable, sessionUuid: string): Promise<SessionRow | null>;
  listByAircraft(db: Queryable, aircraftId: string): Promise<SessionRow[]>;
  /**
   * Sesje jednego PILOTA - do wykrywania nakładki jego czasu (`pilot_overlap`, §4.7).
   *
   * Osobno od `listByAircraft`, bo to inna OŚ: nakładka grafiku idzie w poprzek maszyn,
   * więc nie da się jej zobaczyć, patrząc na jeden samolot. Filtrujemy po `pic_id`, czyli
   * po PIC-u sesji - Dual nie jest piszącym i nie odpowiada za jej istnienie (§4.1 pkt 3).
   */
  listByPilot(db: Queryable, picId: string): Promise<SessionRow[]>;
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
  /** `null` = samolot nieznany albo bez skonfigurowanej pojemności. */
  capacityL(db: Queryable, aircraftId: string): Promise<number | null>;
}

/**
 * Wiersz flagi po stronie serwera. Kształt „na drucie" (`type`, `sessionUuids`) idzie
 * z domeny - `SessionFlag` w `@uzaero/domain` - bo telefon czyta dokładnie te pola
 * z `/sessions/:uuid/sync-status`. Reszta (`id`, `details`, `status`) jest sprawą
 * panelu i na telefon nie jedzie.
 */
export interface FlagRecord {
  id: number;
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
    flag: { type: FlagType; aircraftId: string; sessionUuids: string[]; details: Record<string, unknown> },
  ): Promise<void>;
  openForSession(db: Queryable, sessionUuid: string): Promise<FlagRecord[]>;
  openForAircraft(db: Queryable, aircraftId: string): Promise<FlagRecord[]>;
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
  /** Zapisuje/nadpisuje dzienną kartę arkusza; zwraca URL karty. */
  writeDaySheet(sheet: DaySheet): Promise<{ url: string }>;
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
export interface SheetsReadPort {
  /** Karta po nazwie (`YYYY-MM-DD_SP-XXX`); `null` = nigdy nie wyeksportowano. */
  readDaySheet(tab: string): Promise<StoredDaySheet | null>;
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
  latest(db: Queryable, sessionUuid: string): Promise<ExportRecord | null>;
  /**
   * Numer ostatniej rewizji KARTY (pary doba+samolot); `0` = jeszcze nie eksportowano.
   *
   * Osobno od `latest`, bo pytania są dwa i mają różne klucze. Nowa sesja dołączająca
   * do już wyeksportowanej doby nie ma ANI JEDNEGO własnego wiersza - gdyby numer
   * kolejnej rewizji liczyć z `latest(jej uuid)`, karta zaczęłaby od jedynki po raz
   * drugi i dziennik przestałby być osią czasu jednego dokumentu.
   */
  latestRevision(db: Queryable, day: string, aircraftId: string): Promise<number>;
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
