/**
 * Ninerdeck - panel 2.0: KOPERTY ODPOWIEDZI `/admin/api/*` jako własne typy.
 *
 * Dlaczego własne, a nie importowane z serwera: `server/` to workspace z `type: module`,
 * rozszerzeniami `.ts` w importach, typami Fastify i `pg`. Import stamtąd wciągnąłby
 * typy Node'a do bundla przeglądarki i przywiązałby panel do wewnętrznego podziału
 * warstw serwera. **Nigdy nie importujemy z `server/src`** - a kształty odpowiedzi
 * po stronie serwera przybijają jego własne testy tras.
 *
 * Byty domenowe biorzemy jako TYPY z `@ninerdeck/domain` (`import type`, nigdy wartości).
 *
 * == TEN PLIK OPISUJE TO, CZEGO PANEL 2.0 UZYWA ==
 * Serwer przysyła w tych samych kopertach WIĘCEJ, niż jest tu wymienione: przy kontach
 * `counts`, `scopes`, `daysFrom`/`daysTo` i `flyingDays`, przy flocie `counts`, `scopes`,
 * `claim`, `reading`, `lastEventAt`, `openFlags`. Panel 2.0 świadomie tego nie rysuje
 * (kafle i liczniki chipów opisują klub kilkunastoosobowy, a stan z telefonów to nie
 * konfiguracja) - a TypeScript ignoruje pola nadmiarowe, więc kontrakt zostaje spełniony.
 * Pole dopisuje się tutaj razem z ekranem, który je pokazuje, nigdy „na zapas".
 */

import type {
  Event,
  MhFormat,
  OperationType,
  PasswordWeakness,
  ServiceStatus,
  SessionState,
  SessionTrackPayload,
} from '@ninerdeck/domain';

// -- sesja panelu (logowanie, `GET /me`) ----------------------------------------

/*
 * RÓL KLUBU NIE MA (epik #197, `docs/uprawnienia.md`). Zdolność nadaje się
 * CZŁONKOSTWU, a „administrator" jest odtąd ZESTAWEM - skrótem przy wypełnianiu
 * formularza, nie bytem w modelu. Nazwę zakresu składa panel ze zbioru
 * (`screens/accounts/scope.ts`), bo serwer nie zna języka interfejsu.
 */

/**
 * Zdolności. LUSTRO `server/src/domain/roles.ts`, przybite `test/mirrors.test.ts`.
 *
 * Panel 2.0 pyta o dwie z nich (`accounts.manage`, `fleet.manage`), ale unia musi być
 * KOMPLETNA: zdolność dodana na serwerze i nieznana panelowi zostaje po cichu pominięta
 * przy porównaniu, więc ekran zablokowałby akcję komuś, kto ma uprawnienie.
 */
export type Capability =
  | 'panel.access'
  | 'flags.resolve'
  | 'events.correct'
  | 'accounts.manage'
  | 'fleet.manage'
  | 'thresholds.manage'
  | 'audit.read'
  | 'maintenance.run'
  | 'reservations.manage'
  | 'reservations.approve'
  /** Karta maszyny w aplikacji i powiadomienia o jej lotach (3.2.0, issue #205). */
  | 'fleet.watch'
  | 'bugs.triage'
  /** Zakładanie klubów - rola PLATFORMOWA superadministratora (wielofirmowość, epik E). */
  | 'platform.manage';

/**
 * Konto zalogowane w panelu - stopka nawigacji i decyzje o widoczności akcji.
 *
 * Od wielofirmowości `code` jest kodem Z CZŁONKOSTWA w klubie sesji
 * (`PanelSessionDto.org`). Sesja superadministratora niesie `code: null`.
 *
 * ROLI TU NIE MA (epik #197): o tym, co wolno, rozstrzyga `capabilities` sesji,
 * a jak to nazwać - `scopeLabel`. Sesję platformową poznaje się po `org: null`.
 */
export interface PanelPilotDto {
  id: string;
  code: string | null;
  name: string;
}

/** Klub sesji panelu (wielofirmowość §8.2) - nazwa do kolumny bocznej. */
export interface OrganizationRefDto {
  id: string;
  slug: string;
  name: string;
}

/**
 * Klub, do którego wolno PRZEŁĄCZYĆ tę sesję (mockup `00a-wybor-klubu`; issue #101, E2).
 *
 * Kod i ZAKRES opisują drugą linię karty wyboru („administrator · Twój kod AKO")
 * i tylko ją: o tym, co wolno w klubie, rozstrzygają zdolności sesji WYDANEJ dla
 * tego klubu, czytane przez serwer przy każdym żądaniu.
 */
export interface PanelScopeClubDto {
  org: OrganizationRefDto;
  code: string;
  capabilities: Capability[];
}

/**
 * Zakresy sesji: kluby z wejściem do panelu i - osobno - platforma.
 *
 * Jedzie w KAŻDEJ odpowiedzi o sesji, bo panel pyta o to przy każdym wczytaniu: czy
 * kafel klubu w kolumnie bocznej jest linkiem (jest co przełączyć) i czy po zalogowaniu
 * iść na ekran wyboru. Osobna trasa znaczyłaby drugie żądanie przy każdym starcie.
 */
export interface PanelScopesDto {
  clubs: PanelScopeClubDto[];
  platform: boolean;
}

/**
 * Odpowiedź `POST /admin/api/auth/login`, `POST /admin/api/auth/switch`
 * i `GET /admin/api/me` - TEN SAM kształt.
 *
 * Tokenu tu nie ma i być nie może: sesja jedzie ciasteczkiem `HttpOnly`, którego
 * JavaScript panelu nie widzi. To nie jest niedopatrzenie kontraktu, tylko jego treść.
 */
export interface PanelSessionDto {
  pilot: PanelPilotDto;
  /** Klub sesji; `null` wyłącznie w sesji superadministratora (`platform.manage`). */
  org: OrganizationRefDto | null;
  capabilities: Capability[];
  scopes: PanelScopesDto;
}

// -- logowanie hasłem, link i sesje (2.1.0, issue #134) -------------------------

/**
 * Metody logowania panelu - `GET /admin/api/auth/methods`.
 *
 * `google: null` znaczy „to wdrożenie nie ma klienta Google": ekran logowania gasi
 * wtedy separator „albo" i przycisk pod nim W CAŁOŚCI, zamiast pokazywać kontrolkę,
 * która nie zadziała. `password` jest dziś zawsze `true` - hasło nie ma konfiguracji,
 * ale pole zostaje, bo panel ma czytać odpowiedź, a nie zakładać jej treść.
 */
export interface PanelMethodsDto {
  google: { clientId: string } | null;
  password: boolean;
}

/**
 * Czym OSOBA może wejść. LUSTRO `LOGIN_METHODS_ISSUED` z `server/src/domain/loginSessions.ts`.
 *
 * Plakietki „Google" i „hasło" - w karcie członka i na `#/konto`. Bez `legacy`: to nie
 * jest metoda, tylko brak odpowiedzi o sesji sprzed 2.1.0.
 */
export type AccountMethodDto = 'google' | 'password';

/** Moje konto - `GET /admin/api/me/account` (karta „Logowanie" na `#/konto`). */
export interface PanelAccountDto {
  /** `null` = konta bez adresu; taka osoba nie odzyska hasła linkiem. */
  email: string | null;
  methods: AccountMethodDto[];
}

/**
 * Gdzie ta sesja żyje. LUSTRO `SESSION_SURFACES` z `server/src/domain/loginSessions.ts`.
 */
export type SessionSurfaceDto = 'mobile' | 'panel';

/**
 * Czym zalogowano TĘ sesję. LUSTRO `LOGIN_METHODS`.
 *
 * `legacy` opisuje wyłącznie przeszłość - sesje sprzed 2.1.0, o których rejestr nie wie.
 * Panel pisze przy nich samo urządzenie, bez członu metody: „wcześniejsze wydanie"
 * powiedziałoby człowiekowi o wydaniach aplikacji, a nie o jego tablecie.
 */
export type SessionMethodDto = 'google' | 'password' | 'legacy';

/**
 * Jedno urządzenie na liście sesji (`/me/sessions`, `/pilots/:id/sessions`).
 *
 * Czego tu NIE MA: niczego, czym dałoby się tę sesję podszyć. `id` służy WYŁĄCZNIE do
 * kliknięcia „Wyloguj" - brama pyta o podpisany token, w którym ten identyfikator jest
 * jednym z claimów.
 */
export interface LoginSessionDto {
  id: string;
  surface: SessionSurfaceDto;
  method: SessionMethodDto;
  /** ISO 8601 UTC - „od kiedy". */
  createdAt: string;
  /** ISO 8601 UTC - ostatnia aktywność; serwer pisze ją z przepustnicą 60 s. */
  lastSeenAt: string;
  /** `null` = urządzenie nieznane; panel pisze wtedy „urządzenie nieznane", nie zmyśla. */
  device: string | null;
  ip: string | null;
  /** Ta karta przeglądarki - „To urządzenie" i BRAK przycisku „Wyloguj". */
  current: boolean;
}

/**
 * Wynik wysłania linku „ustaw hasło" - z karty członka i z karty klubu.
 *
 * Adres i termin, NIGDY link ani kod: administrator wysyła, nie dyktuje
 * (`docs/logowanie-haslem.md` §5.4). Panel pisze z tego „wysłano na … · ważny godzinę".
 */
export interface PasswordLinkSentDto {
  sentTo: string;
  /** ISO 8601 UTC - termin ważności linku (godzina; zaproszenie z platformy: 72 h). */
  expiresAt: string;
}

// -- odmowy ---------------------------------------------------------------------

/**
 * Powód odmowy zmiany na koncie (`409 refused`).
 * LUSTRO `AccountRefusal` z `server/src/domain/accountGuards.ts`.
 */
export type PilotRefusalDto =
  | 'self_deactivate'
  | 'self_demote'
  | 'last_admin'
  | 'inactive_account'
  | 'self_delete'
  | 'account_active'
  | 'has_history';

/**
 * Powód odmowy zmiany konfiguracji samolotu (`409 refused`).
 * LUSTRO `FleetRefusal` z `server/src/domain/fleetGuards.ts`.
 *
 * Do 2.0 brakowało tu obu powodów oleju (issue #60) - panel pokazałby wtedy klientowi
 * surowe `oil_min_above_capacity`. Rozjazdu pilnuje odtąd `test/mirrors.test.ts`.
 */
export type FleetRefusalDto =
  | 'capacity_not_positive'
  | 'open_session'
  | 'oil_not_positive'
  | 'oil_min_above_capacity'
  | 'fuel_norm_not_positive'
  | 'initial_negative'
  | 'initial_fuel_over_capacity'
  | 'initial_oil_over_capacity'
  | 'aircraft_in_service'
  | 'has_history';

/** Ciało odmowy z tras panelu - `error` zawsze, reszta zależnie od powodu. */
export interface ApiErrorDto {
  error: string;
  /** 403 z bramy zdolności: KTOREJ zdolności zabrakło. */
  required?: Capability;
  /**
   * 409 `conflict`: KTORE pole jest zajęte - bez tego formularz nie wie, co poprawić.
   * `slug` dochodzi z modułem Organizacje (adres klubu jest jedyny na SERWERZE, nie
   * w klubie), `email` wskazuje tam osobę, która jest już administratorem tego klubu.
   */
  field?: 'code' | 'email' | 'reg' | 'slug' | 'homeIcao' | 'timezone';
  /**
   * 409 `wrong_status` (decyzja o członkostwie): W JAKIM STANIE jest zgłoszenie teraz.
   * Administrator z otwartą szufladą nie wie, że drugi rozstrzygnął je minutę temu -
   * „nie można" bez podania stanu wygląda jak awaria.
   */
  status?: MembershipStatusDto | string;
  /**
   * DLACZEGO odmówiono - `409 refused` (konto, flota) i `400 weak_password` (polityka
   * hasła, 2.1.0). Odmowa bez powodu każe zgadywać, czy to awaria.
   *
   * Powód polityki hasła bierzemy jako TYP z domeny, a nie jako lustro: tę samą regułę
   * liczy przeglądarka przed wysłaniem (`checkPassword`), więc obie strony i tak muszą
   * mówić tym samym słownikiem - a kopia unii mogłaby się z nim rozjechać w ciszy.
   */
  reason?: PilotRefusalDto | FleetRefusalDto | PasswordWeakness;
  /**
   * 429 `too_many_attempts`: ZA ILE wolno spróbować ponownie (sekundy, 2.1.0).
   *
   * Bez tej liczby ekran napisałby „spróbuj za chwilę", a chwila znaczy co innego
   * przy minucie i przy kwadransie - człowiek przy tablecie musi wiedzieć, czy czekać,
   * czy iść po administratora.
   */
  retryAfterSec?: number;
  /**
   * 422 `rule_violation`: naruszenia REGUŁ REJESTRU, po polsku i wprost od domeny.
   *
   * Nie tłumaczymy ich w panelu na własne zdania (inaczej niż odmowy `409 refused`):
   * te komunikaty są autorstwa domeny, czyta je też pilot na telefonie, a druga wersja
   * tego samego zdania rozjeżdża się przy pierwszej poprawce jednej z nich.
   */
  violations?: { code: string; message: string }[];
}

// -- konta pilotów --------------------------------------------------------------

/**
 * Jedno konto - wiersz `GET /admin/api/pilots`.
 *
 * Czego tu NIE MA i nie będzie: **hasła** (ani samego, ani jego skrótu - od 2.1.0
 * hasło jest metodą, o której wiersz mówi NAZWĄ w `loginMethods`, i niczym więcej)
 * oraz **ostatniego logowania** (kolumny nie ma w `pilots` i nikt jej nie zapisuje -
 * wyliczenie jej z rotacji tokenów byłoby inną wielkością pod tą samą etykietą;
 * „ostatnio aktywny" niżej odpowiada na inne pytanie).
 */
export interface PilotListItemDto {
  id: string;
  /** Etykieta w arkuszu klubu i przy wyborze drugiego pilota. */
  code: string;
  name: string;
  /**
   * Adres, którym ta osoba się loguje - Googlem, hasłem albo jednym i drugim.
   * `null` = konto bez adresu, czyli takie, do którego nikt nie wejdzie i któremu
   * nie da się wysłać linku „ustaw hasło".
   */
  email: string | null;
  active: boolean;
  /** ZAKRES w tym klubie (epik #197); pusty zbiór = pilot, czyli stan domyślny. */
  capabilities: Capability[];
  /**
   * Ostatnia aktywność ŻYWEJ sesji tego członka W TYM klubie (2.1.0), ISO 8601;
   * `null` = nie ma czynnej sesji. To nie jest „nigdy nie wszedł" - po wygaśnięciu
   * sesji wraca `null`, więc panel pisze wtedy kreskę, a nie zdanie o przeszłości.
   */
  lastSeenAt: string | null;
  /** Czym ta osoba może wejść - plakietki pod adresem w karcie członka (2.1.0). */
  loginMethods: AccountMethodDto[];
}

/** Lista kont. Bez kursora - klub ma kilkanaście kont, `limit` starcza na komplet. */
export interface PilotPageDto {
  items: PilotListItemDto[];
  /** Ile kont spełnia filtr - także wtedy, gdy `limit` obciął listę. */
  total: number;
}

/**
 * Odpowiedź założenia i zmiany konta.
 *
 * **Wiersza z tej odpowiedzi NIE WSTAWIAMY do tabeli.** Serwer składa go skrótem
 * (`accountToWire` w `server/src/http/routes/admin/pilots.ts`) - mutacja oddaje
 * tożsamość i status konta, którego dotyczyła, a nie jego świeży wiersz listy.
 * Po zapisie unieważniamy listę i prawda przychodzi z niej.
 */
export interface PilotChangeDto {
  pilot: PilotListItemDto;
}

// -- zgłoszenia kodem klubu: kolejka i decyzje (issue #101, E3) -----------------

/**
 * Stan członkostwa. LUSTRO `MEMBERSHIP_STATUSES` z `server/src/domain/memberships.ts`,
 * przybite `test/mirrors.test.ts`.
 *
 * Kolumna w bazie jest zwykłym `TEXT`-em z CHECK-iem, więc bez lustra stan dodany na
 * serwerze wyciekłby na ekran klubu surowym napisem - dokładnie ten sam tryb awarii,
 * przed którym broni lustro statusu zgłoszenia błędu.
 */
export type MembershipStatusDto = 'pending' | 'active' | 'disabled' | 'rejected';

/**
 * Jedno zgłoszenie w kolejce klubu (karta ZGŁOSZENIA na `piloci-lista`).
 *
 * Imię i adres wzięły się z ZAŁOŻENIA KONTA, którego ta osoba dokonała sama - Googlem
 * albo adresem i hasłem (2.1.0). Administrator czyta więc to, co ona podała, a nie to,
 * co sam wpisał. Kodu ani zakresu tu NIE MA - nadaje się je dopiero przy zatwierdzeniu (P3),
 * i to jest cała różnica między kandydatem a wierszem listy członków.
 */
export interface MembershipRequestDto {
  /** Identyfikator OSOBY - adres decyzji (`POST /memberships/:pilotId/approve`). */
  pilotId: string;
  name: string;
  email: string | null;
  /** ISO 8601 UTC - „czeka od" na karcie ZGŁOSZENIA. */
  requestedAt: string;
}

/**
 * Kolejka bez licznika i bez kursora: `items.length` JEST liczbą w tytule karty
 * („Zgłoszenia kodem klubu · 2"), a druga liczba w odpowiedzi mogłaby się z nią rozjechać.
 */
export interface MembershipQueueDto {
  items: MembershipRequestDto[];
}

/** Stan członkostwa PO decyzji - odpowiedź odrzucenia i cofnięcia odrzucenia. */
export interface MembershipDecisionDto {
  pilotId: string;
  status: MembershipStatusDto;
  /** ISO 8601 UTC; `null` po cofnięciu odrzucenia - zgłoszenie znów czeka. */
  decidedAt: string | null;
  /** Powód, który pilot czyta na swoim telefonie; `null` poza stanem `rejected`. */
  rejectReason: string | null;
}

/**
 * Zatwierdzenie: kod pilota W TYM klubie i ZAKRES. Kod wymagany - aktywny ⟺ ma kod;
 * zbiór bywa PUSTY i to jest stan domyślny (pilot pracuje w aplikacji).
 */
export interface MembershipApprovalBody {
  code: string;
  capabilities: Capability[];
}

// -- kod klubu: JEDYNA droga do klubu (issue #101, E3) --------------------------

/**
 * Kod klubu na karcie „Kod klubu" (mockup `piloci-kod-klubu`).
 *
 * `code: null` = dołączanie kodem WYŁĄCZONE; karta pokazuje wtedy kreski i „Wygeneruj
 * kod". `formatted` jest zapisem kanonicznym `XXX-XXXX` - panel go NIE SKŁADA sam, bo
 * to ta sama reguła, przez którą nazwę karty arkusza liczy wyłącznie serwer.
 */
export interface ClubCodeDto {
  code: string | null;
  formatted: string | null;
  /** ISO 8601 UTC - „Obowiązuje od"; `null` razem z kodem. */
  since: string | null;
  /** Zgłoszenia złożone TYM kodem i czekające na decyzję - nie cała kolejka. */
  pendingWithCode: number;
}

// -- organizacje: moduł PLATFORMY (issue #101, E1) ------------------------------

/**
 * Administrator klubu na liście platformy - odpowiedź na pytanie „do kogo dzwonić".
 *
 * `signedIn: false` = członkostwo `admin` istnieje, ale nikt się jeszcze tym adresem nie
 * zalogował, więc tożsamość Google nie jest podpięta. To jedyny stan, w którym
 * superadministrator ma coś do zrobienia - przypomnieć się.
 */
export interface OrganizationAdminDto {
  pilotId: string;
  name: string;
  email: string | null;
  /** Kod pilota W TYM klubie - z członkostwa, nie z osoby. */
  code: string;
  signedIn: boolean;
  /** Ostatnia aktywność żywej sesji w tym klubie (2.1.0), ISO 8601; `null` = brak. */
  lastSeenAt: string | null;
  /**
   * ZAPROSZENIE w drodze (2.1.0) - niezużyty list „ustaw hasło" wysłany z platformy.
   * `null` = nic nie wysłano albo link został zrealizowany. O tym, czy termin jeszcze
   * biegnie, rozstrzyga karta klubu - stąd `expiresAt` zamiast flagi.
   */
  invite: { sentAt: string; expiresAt: string } | null;
}

/**
 * Wiersz listy klubów (mockup `organizacje-lista`).
 *
 * Z wnętrza klubu niesie SAME LICZBY i administratorów: „nic nie wycieka między klubami"
 * obejmuje także tę listę (`docs/wielofirmowosc.md` §3.3).
 */
export interface OrganizationListItemDto {
  id: string;
  name: string;
  /** Jedyny PUBLICZNY identyfikator klubu - adres kart arkusza, stały od założenia. */
  slug: string;
  active: boolean;
  /** ISO 8601 UTC - „Założony". */
  createdAt: string;
  members: number;
  aircraft: number;
  admins: OrganizationAdminDto[];
}

/** Karta klubu (mockup `organizacje-klub`) - wiersz listy + KOD KLUBU DO ODCZYTU. */
export interface OrganizationDetailDto extends OrganizationListItemDto {
  joinCode: string | null;
  joinCodeFormatted: string | null;
  joinCodeSince: string | null;
  /** Strefa, w której klub czyta godziny kalendarza (3.0.0). */
  timezone: string;
  /** Lotnisko macierzyste - wyznacza dobę lotną kalendarza. */
  homeIcao: string | null;
  /** Nazwa z katalogu lotnisk; `null` przy pustym polu. Katalogu panel NIE MA. */
  homeAirfieldName: string | null;
}

/** Lista bez kursora: klubów na serwerze jest tyle, ile klubów - nie tyle, ile lotów. */
export interface OrganizationPageDto {
  items: OrganizationListItemDto[];
  /** Liczniki chipów „Wszystkie"/„Aktywne" - po WSZYSTKICH klubach, nie po filtrze. */
  counts: { total: number; active: number };
}

/** Odpowiedź założenia i zmiany klubu - karta, nie wiersz listy. */
export interface OrganizationChangeDto {
  organization: OrganizationDetailDto;
  /**
   * ZAPROSZENIE pierwszego administratora - wyłącznie w odpowiedzi ZAŁOŻENIA klubu
   * (2.1.0, `docs/logowanie-haslem.md` D8). List wychodzi razem z klubem, ale PO nim:
   * klub jest faktem niezależnie od poczty, więc `null` znaczy „klub jest, listu nie
   * ma" i karta pokazuje wtedy to samo „Wyślij ponownie", co przy wygasłym zaproszeniu.
   *
   * Pola nie ma we `PATCH`-u ani przy włączaniu klubu - stąd `?`, a nie `| null`
   * z wymuszeniem: zmiana nazwy nie ma o zaproszeniu nic do powiedzenia.
   */
  invite?: PasswordLinkSentDto | null;
}

/**
 * Założenie klubu: nazwa, adres i PIERWSZY administrator.
 *
 * Administrator jest polem WYMAGANYM, bo klub bez niego nie ma jak zacząć: kodem klubu
 * nie miałby go kto zatwierdzić, a drugiej drogi do klubu nie ma.
 */
export interface OrganizationDraftBody {
  name: string;
  slug: string;
  admin: { name: string; email: string; code: string };
}

/**
 * Zmiana karty klubu. Każde pole jest OPCJONALNE, bo łatka opisuje to, co się zmienia,
 * a nie cały klub; `homeIcao: null` znaczy „wyczyść" i jest czym innym niż pominięcie.
 */
export interface OrganizationPatchBody {
  name?: string;
  timezone?: string;
  homeIcao?: string | null;
}

// -- flota ----------------------------------------------------------------------

/**
 * Jedna jednostka - wiersz `GET /admin/api/fleet`.
 *
 * `fuelToleranceL` LICZY SERWER i to jest treść tej trasy: próg flagi rozjazdu paliwa
 * to `max(10 L, 5% pojemności)`, a panelowi wolno importować z `@ninerdeck/domain` wyłącznie
 * TYPY. Gdyby serwer nie podawał wyniku, panel musiałby trzymać drugą kopię reguły.
 */
export interface AircraftListItemDto {
  id: string;
  /** Znaki na kadłubie - unikalne. Etykieta, nie klucz zdarzeń (te wiążą `id`). */
  reg: string;
  type: string;
  year: number | null;
  capacityL: number;
  /** Efektywny próg rozjazdu paliwa (L) dla tej pojemności - patrz wyżej. */
  fuelToleranceL: number;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
  /** Konfiguracja oleju (issue #60); `null` = nieprowadzony - moduł w telefonie milczy. */
  oilMinL: number | null;
  oilCapacityL: number | null;
  oilNormLPerH: number | null;
  /**
   * Spalanie z instrukcji użytkowania (L na godzinę PRACY SILNIKA, issue #66).
   * Obowiązuje, dopóki aplikacja nie policzy własnej normy z lotów tej maszyny.
   */
  fuelNormLPerH: number | null;
  /**
   * STAN POCZĄTKOWY - co pokazywały przyrządy przy wprowadzeniu jednostki (issue #66).
   * Podpowiedź dla PIERWSZEGO pilota; od pierwszej zdanej sesji nieużywany. Czy jeszcze
   * cokolwiek znaczy, mówi `reading.source`.
   */
  initialMh: number | null;
  initialFuelL: number | null;
  initialOilL: number | null;
  /**
   * Ostatni znany odczyt liczników - `null` = maszyna nie ma ani przekazania, ani
   * wpisanego stanu początkowego.
   */
  reading: AircraftReadingDto | null;
  /** Sesje bez zdania samolotu. Blokują wyłączenie ze służby - i tylko po to tu są. */
  openSessions: number;
}

/**
 * Ostatni znany odczyt jednostki - `source` mówi, czy stan początkowy jeszcze
 * kogokolwiek dotyczy (`handover`/`open_session` = maszynę prowadzą odczyty z lotów,
 * `initial` = pierwszy pilot dostanie to, co wpisano w panelu), a wartości wypełniają
 * pola „Aktualny stan" karty samolotu w trybie odczytu (uwagi do issue #66).
 */
export interface AircraftReadingDto {
  mh: number;
  fuelL: number;
  /** Epoch ms UTC. Przy `source: 'initial'` to chwila ZAPISU W PANELU, nie pomiaru. */
  at: number;
  /** `null` przy `source: 'initial'` - stanu początkowego nikt nie przekazał. */
  byPilotId: string | null;
  byPilotName: string | null;
  /**
   * Ostatni znany stan oleju (L): pomiar + dolewki po nim - SUMĘ liczy serwer, jak
   * `oilAfterL` na liście operacji. `null` = dziennik nie zna ani jednego pomiaru
   * i nie wpisano stanu początkowego oleju.
   */
  oilL: number | null;
  /** Ile z `oilL` to dolewki PO pomiarze - do podpisu pola. `null` razem z `oilL`. */
  oilAddedSinceL: number | null;
  /** Kiedy zmierzono olej - bywa dużo starszy niż `at`. `null` razem z `oilL`. */
  oilAt: number | null;
  /**
   * `admin` = odczyt wpisany ręką administratora (issue #81), który wyprzedził ostatnie
   * zdanie w łańcuchu MH: `byPilotId` jest `null`, `byPilotName` niesie nazwisko
   * administratora, `note` jego komentarz.
   */
  source: 'handover' | 'open_session' | 'initial' | 'admin';
  /** Komentarz do odczytu administratora; `null` przy każdym innym `source`. */
  note: string | null;
}

/** Lista floty. Bez kursora - klub ma kilka jednostek. */
export interface FleetPageDto {
  items: AircraftListItemDto[];
}

/** Odpowiedź zapisu konfiguracji - pełny, świeży wiersz listy (inaczej niż przy kontach). */
export interface AircraftChangeDto {
  aircraft: AircraftListItemDto;
}

/**
 * Próg rozjazdu paliwa rozwiązany dla pojemności, która NIE MUSI być w bazie -
 * odpowiedź `GET /admin/api/fleet/tolerance`.
 *
 * Jedyna droga, którą formularz dostaje liczbę „+/-55 L" dla wpisywanej wartości,
 * zamiast liczyć 5% po swojemu.
 */
export interface AircraftToleranceDto {
  /** `null` = pytanie bez pojemności; próg schodzi wtedy do podłogi 10 L. */
  capacityL: number | null;
  fuelToleranceL: number;
}

// -- dziennik: poziom 1 (flota w zakresie) --------------------------------------

/**
 * Jedna maszyna w zakresie dat - wiersz poziomu 1.
 *
 * Wszystkie liczby SUMUJE SERWER z kolumn projekcji. Panel niczego tu nie dodaje
 * ani nie dzieli - także „ile średnio na godzinę", bo takiej liczby nie zamówiono,
 * a policzona w przeglądarce rozjechałaby się z analityką zużycia.
 */
export interface LogAircraftDto {
  aircraftId: string;
  /** `null` = jednostki nie ma już w rejestrze floty; sesje historyczne zostają. */
  reg: string | null;
  aircraftType: string | null;
  mhFormat: MhFormat | null;

  sessions: number;
  /** Ile sesji jeszcze trwa - to jest jedyny sygnał „ta maszyna lata teraz". */
  openSessions: number;
  /** DNI pracy, nie liczba sesji: dwie zmiany jednego dnia to jeden dzień. */
  activeDays: number;

  flights: number;
  /** Liczniki ZDARZEŃ - z kręgami, więc większe od `flights` (issue #62). */
  takeoffs: number | null;
  landings: number | null;

  blockMs: number;
  flightMs: number;

  fuelAddedL: number | null;
  /** `null` = choć jedna sesja zakresu nie ma bilansu; `fuelUnknownSessions` mówi ile. */
  fuelConsumedL: number | null;
  fuelUnknownSessions: number;
  /** WYŁĄCZNIE dolewki - zużycia oleju nie ma, bo po locie się go nie mierzy. */
  oilAddedL: number | null;
  mhDeltaH: number | null;
  lastEngineStopAt: number | null;
}

export interface LogRangeDto {
  from: string;
  to: string;
  /** `true` = zakresu nie podano i serwer wybrał domyślny. */
  defaulted: boolean;
}

export interface LogReportDto {
  /** Chwila odpowiedzi z zegara SERWERA - panel kotwiczy nią szybkie filtry. */
  at: string;
  range: LogRangeDto;
  aircraft: LogAircraftDto[];
}


// -- dziennik: poziom 2 (sesje jednej maszyny) i poziom 3 (jedna sesja) ---------

/**
 * Jedna sesja - wiersz gridu poziomu 2 (`GET /admin/api/sessions`).
 *
 * Sesja to JEDEN bieg silnika (pivot 2026-08-10): od uruchomienia do zatrzymania,
 * a lotów w niej może być wiele albo ani jednego.
 *
 * == CZASY SA CZTERY I KAZDY ZNACZY CO INNEGO ==
 * `claimedAt`/`closeTime` to PRZEJECIE i ZDANIE maszyny, `engineStartAt`/`engineStopAt`
 * to praca śmigła, a `firstTakeoffAt`/`lastLandingAt` to koperta lotów w środku.
 * Pomylenie ich jest najłatwiejszym błędem tego ekranu: pilot bierze samolot rano,
 * uruchamia po południu, a zdaje wieczorem.
 */
export interface SessionListItemDto {
  sessionUuid: string;
  /**
   * SYGNATURA OPERACJI - „SP-AXA/2026-09-01/BNO/1" (issue #68). Liczy ją SERWER; panel
   * nigdy nie skleja jej u siebie, bo druga konwencja nazw znaczyłaby, że pilot
   * i administrator mówią o jednym locie dwoma napisami.
   *
   * `null` = nie ma jej z czego złożyć (samolot spoza rejestru, operacja bez biegu
   * silnika) - wiersz identyfikuje się wtedy datą, maszyną i godzinami, jak dotąd.
   */
  signature: string | null;
  aircraftId: string;
  reg: string | null;
  aircraftType: string | null;
  mhFormat: MhFormat | null;

  picId: string;
  picCode: string | null;
  picName: string | null;
  dualCode: string | null;
  dualName: string | null;

  /** `voided` = pilot unieważnił CAŁY wpis (issue #62); wiersz zostaje przekreślony. */
  status: 'active' | 'closed' | 'voided';
  operation: OperationType | null;
  client: string | null;

  claimedAt: number | null;
  closeTime: number | null;
  engineStartAt: number | null;
  engineStopAt: number | null;
  firstTakeoffAt: number | null;
  lastLandingAt: number | null;

  departureIcao: string | null;
  /** `null` bywa NORMĄ, nie brakiem: przy skokach drugiego lotniska nie ma z definicji. */
  arrivalIcao: string | null;

  blockMs: number;
  flightMs: number;
  flightsCount: number;
  takeoffCount: number | null;
  landingCount: number | null;

  mhStart: number | null;
  mhEnd: number | null;
  fuelStartL: number | null;
  fuelAddedL: number | null;
  fuelEndL: number | null;
  /** Pomiar oleju z PRZEJĘCIA; po locie oleju się nie mierzy (issue #60). */
  oilLevelL: number | null;
  oilAddedL: number | null;
  /** Stan oleju, z ktorym silnik ruszyl (pomiar + dolewka) - liczy DOMENA, nie panel. */
  oilAfterL: number | null;

  /** Sesja wpisana ręcznie po fakcie - plakietka przy dacie, nie przy wartościach. */
  manualEntry: boolean | null;
  updatedAt: string;
}

/**
 * Strona listy sesji.
 *
 * `nextCursor !== null` znaczy „lista jest PRZYCIĘTA" - i ekran musi to powiedzieć.
 * Lista ucięta po cichu wygląda jak komplet, a to najgorszy tryb awarii narzędzia,
 * które ma odpowiadać na pytanie „co ta maszyna robiła w sierpniu".
 */
export interface SessionPageDto {
  items: SessionListItemDto[];
  nextCursor: string | null;
  total: number;
}

/**
 * Jeden wiersz osi zdarzeń (poziom 3).
 *
 * Oś pokazuje strumień SUROWY - rejestr jest append-only, więc widać w nim wszystko,
 * łącznie ze zdarzeniami unieważnionymi. `Event` bierzemy jako TYP z domeny.
 */
export interface TimelineEntryDto {
  event: Event;
  /** `true` = unieważnione korektą; wiersz jest przekreślony, ale zostaje. */
  voided: boolean;
  /** Czas PO korekcie; `null` = czas zdarzenia jest oryginalny. */
  correctedTime: number | null;
  /** `true` = poprawił to administrator z panelu, a nie pilot w oknie 24 h. */
  adminCorrected: boolean;
}

/**
 * Szczegóły jednej sesji (poziom 3).
 *
 * `state` liczy SERWER (`projectSession`) na żądanie - to jedyne miejsce panelu,
 * w którym tak jest, i dzięki temu karta sesji nie ma jak pokazać innych liczb niż
 * ekran rozliczenia w telefonie.
 */
export interface SessionDetailDto {
  session: SessionListItemDto;
  state: SessionState;
  timeline: TimelineEntryDto[];
}

/**
 * Wynik unieważnienia całej sesji (`POST /sessions/:uuid/void`).
 *
 * `state` liczy SERWER - ta sama zasada, co przy karcie sesji: panel formatuje
 * i nic nie liczy sam.
 */
export interface SessionVoidResultDto {
  sessionUuid: string;
  voidUuid: string;
  recordedAt: string;
  state: SessionState;
  /**
   * O czym uprzedzić PO zapisie: pilot nadal prowadzi tę sesję albo ma otwarte własne
   * okno poprawek. Nie są powodem odmowy - wpis jest już wycofany.
   */
  warnings: { code: string; message: string }[];
  /** Przebudowa karty arkusza; `null` = arkusz nie odpowiedział. */
  reexport: { exported: boolean } | null;
}

/**
 * Wynik ZAKOŃCZENIA ADMINISTRACYJNEGO operacji (`POST /sessions/:uuid/close`, issue #81).
 * `voidUuid` niesie uuid dopisanego unieważnienia, gdy zamknięto „i od razu unieważnij";
 * `state` liczy serwer, jak przy unieważnieniu.
 */
export interface SessionCloseResultDto {
  sessionUuid: string;
  closeUuid: string;
  voidUuid: string | null;
  recordedAt: string;
  state: SessionState;
  warnings: { code: string; message: string }[];
  reexport: { exported: boolean } | null;
}

/**
 * Ślad GPS sesji (poziom 3).
 *
 * Kształt bierzemy WPROST z domeny, zamiast przepisywać go tutaj na lustro. To nie jest
 * wyłom w zasadzie „DTO panelu ma swoje typy": lustra piszemy dla rzeczy, które panel
 * i serwer mogą rozumieć inaczej (role, powody odmowy) - i wtedy `test/mirrors.test.ts`
 * pilnuje, żeby nie rozjechały się w ciszy. `SessionTrackPayload` jest czymś innym:
 * to KOPERTA TRANSPORTOWA, zaprojektowana jako jeden kształt dla obu odbiorców, i jej
 * kopia w panelu tworzyłaby dokładnie ten rozjazd, przed którym miałaby chronić.
 */
export type SessionTrackDto = SessionTrackPayload;


// -- zgłoszenia błędów z aplikacji pilota (issue #87) ---------------------------

/**
 * Cykl życia zgłoszenia. LUSTRO `BUG_STATUSES` z `server/src/domain/bugReports.ts`,
 * przybite `test/mirrors.test.ts`.
 */
export type BugStatusDto = 'new' | 'in_progress' | 'resolved' | 'rejected';

/** Waga zgłoszona przez PILOTA. LUSTRO `BUG_SEVERITIES`; `null` = nie wybrał. */
export type BugSeverityDto = 'blocking' | 'annoying' | 'minor';

/**
 * Jedno zgłoszenie - wiersz listy I treść szuflady w jednym kształcie.
 *
 * Bez podziału na „element listy" i „szczegóły", inaczej niż flota i konta: całą
 * treścią zgłoszenia jest opis i kontekst, więc lista skrócona o kontekst
 * oszczędzałaby kilobajty i kosztowała drugie żądanie przy każdym otwarciu wiersza.
 */
export interface BugReportDto {
  uuid: string;
  /** ISO UTC - zegar TELEFONU: chwila, w której pilot zobaczył problem. */
  createdAt: string;
  /** ISO UTC - zegar SERWERA. Różnica względem `createdAt` mierzy czas offline. */
  receivedAt: string;
  pilotId: string;
  /** `null` = konta już nie ma; zgłoszenie zostaje, bo opisuje aplikację. */
  pilotCode: string | null;
  pilotName: string | null;
  /**
   * KLUB zgłoszenia (wielofirmowość, issue #99 C6). Kolejka jest jedna dla całego
   * serwera - czyta ją superadministrator - a kod pilota jest jedyny W KLUBIE, nie na
   * serwerze: bez tego pola `AKO` z dwóch klubów byłoby nieodróżnialne.
   */
  org: OrganizationRefDto;
  severity: BugSeverityDto | null;
  description: string;
  /** Czytelna etykieta miejsca („KOKPIT (04/05) · arkusz TANKOWANIE"). */
  screen: string;
  appVersion: string | null;
  sessionUuid: string | null;
  /**
   * Komplet kontekstu okna, tak jak przysłał go telefon.
   *
   * Worek `Record<string, unknown>` - jak `details` w dzienniku audytu i z tego
   * samego powodu: kształt należy do APLIKACJI i zmienia się co tydzień testów.
   * Panel go WYPISUJE, nie interpretuje - poza kilkoma polami, które ma nazwane
   * po polsku (`bugContextRows`).
   */
  context: Record<string, unknown>;
  status: BugStatusDto;
  statusNote: string | null;
  /** KOD administratora, nie identyfikator; `null` = status nigdy nie zmieniany. */
  statusBy: string | null;
  statusAt: string | null;
}

/**
 * Lista + liczniki per status.
 *
 * Liczniki jadą RAZEM z listą, a nie osobnym żądaniem: filtr ma pokazywać, ile jest
 * w każdej szufladzie, także w tych, których właśnie nie widać - inaczej
 * „Rozwiązane" wyglądałoby na puste, dopóki ktoś w nie nie kliknie.
 */
export interface BugReportPageDto {
  items: BugReportDto[];
  counts: Record<BugStatusDto, number>;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * KALENDARZ ZAJĘTOŚCI (moduł Kalendarz, milestone 3.0.0; `docs/rezerwacje.md` §10)
 * ══════════════════════════════════════════════════════════════════════════════ */

export type BookingKindDto = 'flight' | 'block';

/**
 * Lustro `BookingStatus` z `server/src/domain/bookings.ts` - pilnuje go
 * `test/mirrors.test.ts` (od issue #204: stan `expired` wszedł na serwerze w 3.1.0
 * i przez dwa dni nikt tego nie widział, bo kontrakty kalendarza nie były na liście
 * strażnika).
 */
export type BookingStatusDto =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'fulfilled'
  | 'released'
  | 'expired';

export type BlockReasonDto = 'maintenance' | 'defect' | 'other';

/**
 * Jedna zajętość maszyny. Rezerwacja pilota i wyłączenie z użytku jadą JEDNYM
 * kształtem, bo w kalendarzu są jednym: paskiem na osi maszyny. Rozróżnia je `kind`,
 * a pola drugiego rodzaju stoją wtedy puste.
 *
 * ══ IDENTYFIKATORY, NIE NAPISY ══
 * `pilotId` i `aircraftId` to identyfikatory - nazwisko i znak rejestracyjny panel
 * rozwiązuje z list, które i tak ma (`usePilots`, `useFleet`). Doklejenie ich do tej
 * odpowiedzi znaczyłoby drugie źródło tych samych napisów, a przy pierwszej zmianie
 * nazwiska - dwa różne nazwiska w dwóch miejscach ekranu.
 */
export interface BookingDto {
  id: string;
  aircraftId: string;
  kind: BookingKindDto;
  status: BookingStatusDto;
  startsAt: string;
  endsAt: string;
  /** `null` przy wyłączeniu z użytku - ono nie ma właściciela. */
  pilotId: string | null;
  dualId: string | null;
  operation: string | null;
  fromIcao: string | null;
  toIcao: string | null;
  plannedAirMin: number | null;
  plannedFuelL: number | null;
  /** Operacja, która ją zrealizowała; `null` = lot jeszcze się nie odbył. */
  sessionUuid: string | null;
  blockReason: BlockReasonDto | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
  closeReason: string | null;
}

/**
 * Doba kalendarza w strefie KLUBU - granice jako chwile bezwzględne.
 *
 * Panel dostaje je gotowe z tego samego powodu, co telefon: doba zmiany czasu ma 23
 * albo 25 godzin, a przeglądarka administratora stoi czasem w innej strefie niż klub.
 * Liczenie tego po stronie klienta dałoby siatkę przesuniętą o godzinę dwa razy w roku.
 */
export interface CalendarDayDto {
  /** `YYYY-MM-DD` w strefie klubu. */
  date: string;
  startsAt: string;
  endsAt: string;
}

export interface CalendarDto {
  /** Strefa klubu - NAPIS do wyświetlenia, nie materiał do rachunku. */
  timezone: string;
  homeIcao: string | null;
  days: CalendarDayDto[];
  bookings: BookingDto[];
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ŚCIEŻKA AKCEPTACJI I KOLEJKA DECYZJI (milestone 3.1.0, issue #165;
 * `docs/rezerwacje.md` §11)
 *
 * Cztery lustra unii pilnuje `test/mirrors.test.ts`. Reszta to kształty odpowiedzi
 * tras panelu - identyfikatory, nie napisy: nazwisko decydującego i znak maszyny panel
 * rozwiązuje z list, które i tak ma (`usePilots`, `useFleet`).
 * ══════════════════════════════════════════════════════════════════════════════ */

/** Lustro `ApprovalOutcome` (`server/src/domain/approvals.ts`) - stan ścieżki rezerwacji. */
export type ApprovalOutcomeDto = 'pending' | 'confirmed' | 'rejected';

/**
 * Lustro `ApprovalRefusal` - dlaczego decyzja nie może zapaść. Kody surowe; zdania po
 * polsku należą do ekranu (`screens/calendar/approvalRefusal.ts`).
 */
export type ApprovalRefusalDto = 'not_pending' | 'not_your_step' | 'reason_required';

/** Lustro `ApprovalVerdict` (`application/common/ports.ts`). */
export type ApprovalVerdictDto = 'approved' | 'rejected';

/**
 * Lustro `ApprovalVia`: `person` = ktoś kliknął, `self` = krok przeszedł sam, bo
 * rezerwujący stoi na jego liście (§11.2).
 */
export type ApprovalViaDto = 'person' | 'self';

/** Lustro `ApprovalStepsRefusal` - odmowy zapisu ścieżki; obie niosą `stepLabel`. */
export type ApprovalStepsRefusalDto = 'step_without_members' | 'member_not_in_org';

/** Krok ścieżki klubu w KONFIGURACJI (`GET`/`PUT /admin/api/approval-steps`). */
export interface ApprovalStepDto {
  id: string;
  /** Kolejność pytania - zmienna, w odróżnieniu od `id`. */
  position: number;
  label: string;
  /** Pula uprawnionych, nie komplet podpisów: wystarczy zgoda JEDNEJ z tych osób. */
  memberIds: string[];
}

export interface ApprovalPathDto {
  /** Pusta lista = klub bez akceptacji, czyli stan domyślny (§11.1). */
  steps: ApprovalStepDto[];
  /**
   * Skutek ZAPISU dla spraw w toku (issue #207) - tylko w odpowiedzi `PUT`: ile
   * czekających rezerwacji dostało komplet zgód na nowej ścieżce (potwierdzone), a ile
   * czeka teraz na inny krok (jego osoby dostały prośbę). Zapis konfiguracji dotyka
   * cudzych rezerwacji, więc panel mówi to banerem.
   */
  reconciled?: PathEffectDto;
}

export interface PathEffectDto {
  confirmed: number;
  moved: number;
}

/**
 * Krok w ZAMÓWIENIU zapisu ścieżki. Kolejność w tablicy JEST kolejnością pytania;
 * `id` puste = krok nowy (identyfikator nadaje serwer), krok istniejący zachowuje
 * swój `id` razem z zapadłymi pod nim decyzjami.
 */
export interface ApprovalStepInputDto {
  id?: string | null;
  label: string;
  memberIds: string[];
}

/**
 * Decyzja pod krokiem. `decidedBy` jest identyfikatorem OSOBY i jedzie do panelu
 * ŚWIADOMIE, choć na telefon nie (§9.4): administrator pyta „do kogo zadzwonić",
 * a pilot dostaje nazwę kroku, bo krok bywa obsadzony przez kilka osób.
 */
export interface ApprovalDecisionDto {
  decision: ApprovalVerdictDto;
  via: ApprovalViaDto;
  reason: string | null;
  decidedBy: string;
  decidedAt: string;
}

export interface ApprovalStepStateDto {
  id: string;
  label: string;
  /** Czy to jego pytamy TERAZ. */
  current: boolean;
  /** `null` = decyzja pod tym krokiem jeszcze nie zapadła. */
  decision: ApprovalDecisionDto | null;
}

/** Stan ścieżki JEDNEJ rezerwacji. `steps` puste = klub bez akceptacji. */
export interface ApprovalViewDto {
  outcome: ApprovalOutcomeDto;
  steps: ApprovalStepStateDto[];
}

/** `GET /admin/api/bookings/:id` - zajętość razem ze stanem jej ścieżki. */
export interface BookingDetailDto {
  /** Strefa klubu - godziny decyzji czyta się nią, jak resztę kalendarza. */
  timezone: string;
  booking: BookingDto;
  approval: ApprovalViewDto;
}

/**
 * Pozycja kolejki „czeka na Twoją decyzję": rezerwacja stojąca na kroku, na którego
 * liście jest zalogowany. `step.members` i `step.next` służą zdaniu pod listą („krok ma
 * dwie osoby i rozstrzyga pierwsza; po zatwierdzeniu idzie do kroku …").
 */
export interface ApprovalQueueItemDto {
  booking: BookingDto;
  step: {
    id: string;
    label: string;
    /** Ile osób stoi na liście tego kroku. */
    members: number;
    /** Nazwa NASTĘPNEGO kroku; `null` = ten jest ostatni. */
    next: string | null;
  };
}

export interface ApprovalQueueDto {
  /** Strefa klubu - „wczoraj 18:40" i „termin za 3 dni" liczą się jej dobą. */
  timezone: string;
  items: ApprovalQueueItemDto[];
}

/** Odpowiedź `POST /admin/api/bookings/:id/decision`. */
export interface DecisionResultDto {
  status: BookingStatusDto;
  approval: ApprovalViewDto;
}

// -- podgląd pilota i samolotu przy decyzji (3.1.0, issue #206) ------------------
//
// Ten sam komplet faktów, który dostaje telefon (ekrany 26A/26B) - serwer składa go
// JEDNYM zapytaniem dla obu powierzchni, więc szuflada K6/K6a nie liczy nic sama.
// Wiersze niosą identyfikatory; nazwiska i znaki rozwiązuje panel z list klubu.

/** Trójka Loty · Blok · Lot - stała w całym produkcie. */
export interface PreviewFlyingDto {
  flights: number;
  blockMs: number;
  flightMs: number;
}

export interface PreviewRecentDto {
  sessionUuid: string;
  /** Chwila operacji (uruchomienie silnika, awaryjnie przejęcie); ISO. */
  at: string | null;
  aircraftId: string;
  pilotId: string;
  dualId: string | null;
  operation: string | null;
  blockMs: number;
  flights: number;
}

export interface PreviewUpcomingDto {
  id: string;
  aircraftId: string;
  kind: BookingKindDto;
  status: BookingStatusDto;
  startsAt: string;
  endsAt: string;
  pilotId: string | null;
  blockReason: BlockReasonDto | null;
  /** Rozpatrywana sprawa - wiersz „· ta sprawa". */
  thisCase: boolean;
  /** Nachodzi na rozpatrywany termin - ten sam człowiek nie poleci dwiema maszynami. */
  overlaps: boolean;
  day: CalendarDayDto;
}

export interface PilotPreviewDto {
  timezone: string;
  bookingId: string;
  pilot: {
    id: string;
    code: string | null;
    name: string | null;
    memberSince: string | null;
  };
  lastFlightAt: string | null;
  /** Doświadczenie NA EGZEMPLARZU sprawy - pierwsza karta, bo to pytanie decyzji. */
  onAircraft: {
    aircraftId: string;
    operations: number;
    lastAt: string | null;
    flights: number;
    blockMs: number;
    flightMs: number;
  };
  flying: {
    last30: PreviewFlyingDto;
    last90: PreviewFlyingDto;
    total: PreviewFlyingDto;
  };
  recent: PreviewRecentDto[];
  upcoming: PreviewUpcomingDto[];
}

export interface AircraftPreviewDto {
  timezone: string;
  bookingId: string;
  aircraft: {
    id: string;
    reg: string;
    type: string;
    serviceStatus: ServiceStatus;
    capacityL: number;
    mhFormat: MhFormat;
    oilMinL: number | null;
  };
  lastFlightAt: string | null;
  /** Ostatni odczyt liczników ZE ŹRÓDŁEM - liczba bez metryczki wygląda na stan bieżący. */
  counters: {
    mh: number;
    fuelL: number;
    oilL: number | null;
    at: string;
    source: AircraftReadingDto['source'];
    byPilotId: string | null;
    enteredBy: string | null;
  } | null;
  last30: {
    daysWithFlights: number;
    takeoffs: number;
    blockMs: number;
    flightMs: number;
  };
  recent: PreviewRecentDto[];
  upcoming: PreviewUpcomingDto[];
}
/* ══════════════════════════════════════════════════════════════════════════════
 * OBSERWOWANE SAMOLOTY (3.2.0, issue #205, decyzja 12; `docs/obserwowanie-samolotu.md`
 * §6.6, §7.2) - karta „Obserwowane samoloty" na `#/konto`
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Stan maszyny TERAZ - lustro `AircraftNow` z `server/src/domain/aircraftCard.ts`
 * (unia OBIEKTÓW po `kind`, więc strażnik luster jej nie czyta; nowy rodzaj stanu
 * ujawnia się kompilatorem przy `switch` w `screens/me/watchRows.ts`).
 *
 * JEDEN kształt dla telefonu (sekcja 13C, hero karty 27) i panelu: obie powierzchnie
 * pokazują tę samą flotę w tym samym stanie. Chwile operacji (`since`) jadą stemplem
 * UTC, terminy (`until`, `startsAt`) też - dobę klubu panel liczy sam z `timezone`.
 */
export type AircraftNowDto =
  | { kind: 'retired' }
  | {
      kind: 'flying' | 'claimed' | 'after_flight';
      sessionUuid: string;
      pilotId: string;
      dualId: string | null;
      operation: string | null;
      departureIcao: string | null;
      /** `null` wyłącznie przy `claimed` sprzed uruchomienia silnika bez chwili przejęcia. */
      since: string | null;
    }
  | { kind: 'blocked'; bookingId: string; reason: BlockReasonDto | null; until: string }
  | { kind: 'booked'; bookingId: string; pilotId: string | null; startsAt: string; endsAt: string }
  | { kind: 'free'; next: { bookingId: string; kind: BookingKindDto; startsAt: string } | null };

/** Jedna maszyna floty klubu sesji z flagą „obserwuję" (`GET /admin/api/me/watches`). */
export interface WatchListItemDto {
  aircraftId: string;
  reg: string;
  type: string;
  serviceStatus: ServiceStatus;
  watching: boolean;
  now: AircraftNowDto;
}

export interface WatchListDto {
  /** Strefa klubu - do „dziś 14:00" przy terminach, jak w kalendarzu. */
  timezone: string;
  items: WatchListItemDto[];
}

