/**
 * Ninerdeck (serwer) - ZDOLNOŚCI i bramy uprawnień panelu administracyjnego.
 *
 * ══ ZDOLNOŚĆ NALEŻY DO CZŁONKOSTWA, NIE DO ROLI ══
 * (decyzja właściciela 2026-09-23, epik #197, `docs/uprawnienia.md`)
 *
 * Do 3.1.0 zdolności wyliczały się z ROLI klubu, a role były dwie: `admin` z kompletem
 * i `pilot` z pustą listą. Nie dało się przez to powiedzieć „mechanik zatwierdza
 * rezerwacje, ale floty ani kont nie dotyka" - każde wyjście albo oddawało mu wszystko,
 * albo budowało drugi mechanizm uprawnień obok tego pliku. Odtąd w bazie stoi ZBIÓR
 * zdolności per członkostwo (`membership_capabilities`), a kolumny `memberships.role`
 * nie ma wcale.
 *
 * **Zbiór czyta BRAMA Z BAZY**, tym samym zapytaniem, co członkostwo (`authSnapshot`),
 * a nie z tokenu - dzięki temu odebranie zdolności działa natychmiast, a nie po
 * wygaśnięciu poświadczenia.
 *
 * **Zestaw („administrator", „technik") jest SKRÓTEM PRZY WYPEŁNIANIU, nie bytem**:
 * po wybraniu w bazie stoi zbiór, a nazwa liczy się z niego z powrotem. Dzięki temu
 * zmiana katalogu zestawów nie rusza nikomu uprawnień - przestawia tylko to, co panel
 * proponuje następnemu. Katalog zestawów i polskie nazwy zdolności mieszkają W PANELU
 * (`admin/src/screens/accounts/scope.ts`), bo są słownikiem interfejsu, a serwer języka
 * interfejsu nie zna (ta sama zasada, co przy kodach `AccountRefusal`). Tutaj stoi
 * wyłącznie KOMPLET zdolności klubowych, którego potrzebuje bootstrap: backfill
 * migracji 12, pierwszy administrator klubu i seed.
 *
 * **Bezpiecznik jest wbudowany w model.** `can` pyta o obecność KONKRETNEJ pozycji
 * katalogu, więc napis, którego katalog nie zna - literówka, pozycja z przyszłej wersji -
 * nie pasuje do żadnego pytania: brak wiersza i wiersz niezrozumiały znaczą to samo.
 * Do 3.1.0 tę rolę pełnił dopisany obok `isPilotRole(...) ? role : DEFAULT_ROLE`
 * i zniknął razem z rolą.
 *
 * ══ DRUGA OŚ WŁADZY: ROLA PLATFORMOWA ══
 * `pilots.platform_role` zostaje ROLĄ i to nie jest niekonsekwencja: superadministrator
 * jest OSOBĄ BEZ CZŁONKOSTWA, więc nie ma czemu nadać zbioru. Jego władza jest jedna
 * (zakładanie i wyłączanie klubów) i rozłączna ze zdolnościami klubu - do dziennika klubu
 * nie wchodzi (`docs/wielofirmowosc.md` §3.3), bo wyjątek wpisany w rolę byłby
 * niewidoczny dla klubu, którego dotyczy.
 *
 * ══ DLACZEGO JEDEN PLIK ══
 * Pytanie „kto może rozwiązać flagę" ma mieć JEDNĄ odpowiedź, w jednym pliku, który da
 * się przeczytać w całości i pokryć testem. Rozsiane po trasach `if (role === ...)` to
 * konstrukcja, w której nikt nigdy nie wie, czy zna wszystkie miejsca - ten sam powód,
 * dla którego istnieje `http/authorize.ts`.
 */

/**
 * Rola PLATFORMOWA - poza klubami (`pilots.platform_role`, wielofirmowość §3.3).
 *
 * Jedna pozycja i tak ma być: superadministrator jest OSOBĄ bez ani jednego członkostwa,
 * której jedyną władzą jest zakładanie i wyłączanie klubów oraz zapraszanie ich
 * pierwszych administratorów. `null` w kolumnie = zwykła osoba (stan każdego pilota).
 */
export const PLATFORM_ROLES = ['superadmin'] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Strażnik wejścia z zewnątrz (kolumna `pilots.platform_role`). */
export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export type Capability =
  /** Wejście do panelu w ogóle - bez tego logowanie do `admin/` jest odrzucane. */
  | 'panel.access'
  /** Zamknięcie flagi (`status='resolved'`) i wywołany tym re-eksport karty dnia. */
  | 'flags.resolve'
  /** Korekta zdarzenia po oknie 24 h - dopisanie `event_correction` w cudzej sesji. */
  | 'events.correct'
  /** Zakładanie kont, reset hasła, deaktywacja, zmiana roli. */
  | 'accounts.manage'
  /**
   * Dodanie i edycja samolotu, wyłączenie ze służby - **oraz ręczne ponowienie eksportu
   * karty dnia** (`POST /admin/api/exports/:sessionUuid/retry`, `A05`).
   *
   * Eksport dostał TĘ zdolność, a nie własną, i to jest decyzja do potwierdzenia przez
   * człowieka (2026-08-01). Powód: konfiguracja floty już dziś rozstrzyga, JAK WYGLĄDA
   * każda przyszła karta danego samolotu (`mh_format` i pojemność jadą wprost do treści
   * arkusza), więc pytanie „kto steruje dokumentem klubu" ma dalej JEDNĄ odpowiedź
   * w jednym pliku. Mnożenie zdolności bez potrzeby rozmywa tę odpowiedź.
   *
   * Gdyby ponowienie miało trafić do szefa wyszkolenia, właściwym ruchem jest osobna
   * zdolność `exports.retry` - a NIE dopisanie `fleet.manage` do jego roli, bo tamta
   * niesie też edycję wejść reguł §4.5.
   */
  | 'fleet.manage'
  /** Zmiana tolerancji flag (progi detekcji są tylko do odczytu - patrz A08). */
  | 'thresholds.manage'
  /** Odczyt dziennika akcji administratorów. */
  | 'audit.read'
  /**
   * Narzędzia serwisowe z `A11`: porównanie i **nadpisanie** projekcji `sessions`
   * ze strumienia zdarzeń oraz odczyt stanu schematu.
   *
   * ══ DLACZEGO NOWA POZYCJA, A NIE KTÓRAŚ Z ISTNIEJĄCYCH (2026-08-02) ══
   * **To jest decyzja do potwierdzenia przez człowieka**, tak jak `fleet.manage`
   * przy ponowieniu eksportu. Przeglądnięcie katalogu nie dało dopasowania: każda
   * dotychczasowa zdolność nazywa ZASÓB (flagi, rejestr, konta, flota, progi,
   * dziennik), a przebudowa nie dotyczy żadnego z nich - nadpisuje PROJEKCJĘ
   * wszystkich dni klubu naraz. Wpisanie jej pod `fleet.manage` („kto steruje
   * dokumentem klubu") albo `thresholds.manage` („kto stroi reguły") dałoby fałszywą
   * odpowiedź na pytanie, po które ten plik istnieje: „co panel potrafi zmienić".
   *
   * Zakres jest WĄSKI i celowo nie obejmuje dwóch pozostałych operacji ekranu A11:
   * sprzątanie wygasłych tokenów jedzie na `accounts.manage` (ta sama tabela i ta
   * sama władza, co unieważnianie sesji przy deaktywacji konta), a ponowienie
   * eksportu na `fleet.manage` (dokładnie jak na `A05` - druga zdolność dla tego
   * samego przycisku byłaby rozjazdem).
   */
  | 'maintenance.run'
  /**
   * Odczyt i zmiana statusu ZGŁOSZEŃ BŁĘDÓW z aplikacji pilota (issue #87, moduł
   * „Zgłoszenia" panelu).
   *
   * ══ DLACZEGO NOWA POZYCJA ══
   * Katalog nazywa ZASOBY, a zgłoszenie nie jest żadnym z dotychczasowych: nie jest
   * flagą (tę wystawia serwer z reguł §4.5, a nie człowiek z telefonu), nie jest
   * rejestrem ani kontem. Wpisanie go pod `flags.resolve` dałoby fałszywą odpowiedź
   * na pytanie, po które ten plik istnieje - „co panel potrafi zmienić".
   *
   * ══ ZDOLNOŚĆ PLATFORMOWA, NIE KLUBOWA (issue #99, C6 - decyzja właściciela) ══
   * Do epiku C moduł był w panelu KLUBU (odczyt na `panel.access`). Zgłoszenie opisuje
   * APLIKACJĘ, a nie dziennik klubu - obsługuje je ten, kto aplikację utrzymuje, czyli
   * superadministrator, na jednej liście dla wszystkich klubów. Administrator klubu
   * nie widzi ani zakładki, ani danych; do klubu wraca odpowiedź w aplikacji, nie w panelu.
   * Dlatego zdolność stoi w mapie ról PLATFORMOWYCH, a żadna rola klubu jej nie ma.
   */

  /**
   * Władza nad CUDZYM planem: odwołanie i zmiana rezerwacji innego pilota oraz
   * wpisanie rezerwacji za kogoś (milestone 3.0.0, `docs/rezerwacje.md` §8).
   *
   * ══ DLACZEGO NOWA POZYCJA, A NIE `fleet.manage` ══
   * Katalog nazywa ZASOBY, a rezerwacja jest zasobem, którego do 3.0.0 nie było.
   * `fleet.manage` nazywa FLOTĘ - konfigurację maszyn, z której wynika kształt każdej
   * przyszłej karty dnia. Tu chodzi o czyjś sobotni plan, czyli o coś, co należy do
   * człowieka, nie do maszyny. Wpisanie tego pod flotę dałoby fałszywą odpowiedź na
   * pytanie, po które ten plik istnieje: „co panel potrafi zmienić".
   *
   * **Wyłączenie maszyny z użytku na konkretne dni idzie natomiast na `fleet.manage`**
   * i to nie jest niekonsekwencja: to stan MASZYNY rozciągnięty w czasie, czyli
   * przedłużenie `service_status`, którym tamta zdolność już steruje.
   *
   * **Rezerwuje każdy aktywny członek klubu** - to nie jest zdolność panelu, tylko
   * zwykła praca pilota, jak wpisanie lotu. Ta pozycja dotyczy wyłącznie cudzych.
   */
  | 'reservations.manage'
  /**
   * ROZSTRZYGANIE KROKÓW ŚCIEŻKI AKCEPTACJI (3.1.0, `docs/rezerwacje.md` §8) oraz
   * podgląd wszystkich terminów klubu w komplecie - z zadaniem, trasą, drugim pilotem
   * i notatką.
   *
   * ══ DLACZEGO OSOBNA POZYCJA, A NIE `reservations.manage` ══
   * Tamta jest WŁADZĄ NAD CUDZYM PLANEM: odwołaniem i przesunięciem terminu. Ta jest
   * ZGODĄ albo ODMOWĄ w obiegu, który klub sam ułożył - i ma ją dostawać mechanik
   * albo szef wyszkolenia, czyli ktoś, kto cudzych rezerwacji nie kasuje. Zlanie ich
   * w jedną oddawałoby akceptującemu władzę, o którą nikt nie prosił, i odbierało
   * całej zmianie sens: po to rozbiliśmy role na zbiory, żeby dało się dać JEDNO.
   *
   * Podgląd jedzie RAZEM ze zgodą i to jest decyzja: zgoda bez kontekstu jest podpisem
   * w ciemno (uwaga właściciela 2026-09-23), a kontekstem są dane cudzej rezerwacji.
   */
  | 'reservations.approve'
  /**
   * OBSERWOWANIE SAMOLOTÓW (3.2.0, issue #205; `docs/obserwowanie-samolotu.md` §3):
   * karta maszyny w aplikacji (stan teraz, liczniki, terminy, historia, wykresy)
   * i powiadomienia o jej lotach po włączeniu obserwowania.
   *
   * ══ DLACZEGO NOWA POZYCJA, A NIE `fleet.manage` ══
   * Katalog nazywa ZASOBY, a obserwowanie jest nowym RODZAJEM dostępu do zasobu,
   * który do dziś miał wyłącznie zarządzanie. Koordynator lotów floty nie konfiguruje,
   * mechanik-akceptujący nie ma nic poza zgodą - obu nie da się wpuścić na kartę
   * maszyny żadną istniejącą pozycją bez oddania im władzy, o którą nikt nie prosił.
   *
   * Zdolność mówi „wolno ci patrzeć i obserwować"; sam ZAMIAR („chcę") jest wierszem
   * `aircraft_watches`, a prawo adresata sprawdza się PRZY WYSYŁCE (§2.1): odebranie
   * zdolności wycisza od razu, bez sprzątania wierszy.
   */
  | 'fleet.watch'
  | 'bugs.triage'
  /**
   * Zakładanie i wyłączanie KLUBÓW oraz zapraszanie ich pierwszych administratorów
   * (moduł `#/organizacje`, wielofirmowość §8.1).
   *
   * ══ DLACZEGO NOWA POZYCJA I DLACZEGO NIE MA JEJ ŻADNA ROLA KLUBU ══
   * Katalog nazywa ZASOBY, a klub jest zasobem, którego do issue #98 nie było. Wynika
   * z ROLI PLATFORMOWEJ, nie z roli członkostwa - i celowo nie stoi na liście
   * `admin`: administrator klubu nie zakłada klubów, a superadministrator nie ma
   * `panel.access` do żadnego klubu (§3.3). To dwie rozłączne władze i tak ma zostać.
   */
  | 'platform.manage';

/**
 * KOMPLET zdolności klubowych - to, co w panelu nazywa się zestawem „Administrator".
 *
 * Wypisany jawnie, a nie wyliczony jako „wszystko z katalogu": katalog niesie też
 * zdolności PLATFORMOWE (`platform.manage`, `bugs.triage`), których administrator klubu
 * mieć nie może i nie ma ich dostać przez przeoczenie. Dopisanie nowej zdolności
 * klubowej ma przy okazji zmusić do świadomej decyzji, czy wchodzi do kompletu.
 *
 * Trzy miejsca, które go potrzebują, i wszystkie trzy są BOOTSTRAPEM, nie bramą:
 * backfill migracji 12, pierwszy administrator klubu zakładany przez platformę
 * i seed. Brama pyta wyłącznie `can(zbiór, zdolność)`.
 */
export const CLUB_CAPABILITIES: readonly Capability[] = [
  'panel.access',
  'flags.resolve',
  'events.correct',
  'accounts.manage',
  'fleet.manage',
  'thresholds.manage',
  'audit.read',
  'maintenance.run',
  'reservations.manage',
  'reservations.approve',
  'fleet.watch',
];

/**
 * KLUCZ ZAKRESU do dziennika audytu - `full` / `partial` / `none`.
 *
 * Kolumna `admin_audit.actor_role` niosła dotąd rolę Z CHWILI AKCJI, a roli nie ma.
 * Wiersz dziennika ma jednak dalej mówić, jaką władzę miał wtedy sprawca, więc
 * zapisujemy klucz liczony ze zbioru. Napisy są SUROWE i takie jadą na drut -
 * nazywa je panel, dokładnie jak kody `AccountRefusal`.
 *
 * Wiersze sprzed 3.1.0 mówią w tej kolumnie `admin` albo `pilot` i tak zostaje:
 * dziennik jest zapisem historycznym, a przepisanie go zmieniłoby to, co się wtedy
 * naprawdę wydarzyło. Ta sama zasada, przez którą w katalogu akcji został kod
 * `pilot.password_reset` po funkcji, której już nie ma.
 */
export function scopeKey(capabilities: readonly Capability[]): 'full' | 'partial' | 'none' {
  if (capabilities.length === 0) return 'none';
  return CLUB_CAPABILITIES.every((c) => capabilities.includes(c)) ? 'full' : 'partial';
}

/** Strażnik wejścia z zewnątrz (wiersz `membership_capabilities`, body żądania). */
export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CATALOGUE as readonly string[]).includes(value);
}

/**
 * Pełny katalog - do walidacji wejścia i do ekranu zakresu w panelu.
 *
 * Osobno od `CLUB_CAPABILITIES`, bo to dwie różne listy: tamta mówi „co wolno dać
 * członkowi klubu", ta „co w ogóle istnieje". Zlanie ich w jedną wpuściłoby
 * `platform.manage` do zakresu klubowego pierwszą literówką w panelu.
 */
const CATALOGUE: readonly Capability[] = [...CLUB_CAPABILITIES, 'bugs.triage', 'platform.manage'];
/**
 * Zdolności ról PLATFORMOWYCH - osobna mapa, bo to osobna oś władzy. Wypisana jawnie
 * z tego samego powodu, co lista administratora: dopisanie zdolności ma być decyzją.
 */
const PLATFORM_CAPABILITIES: Readonly<Record<PlatformRole, readonly Capability[]>> = {
  // Zgłoszenia błędów obsługuje platforma (issue #99, C6) - patrz `bugs.triage` wyżej.
  superadmin: ['platform.manage', 'bugs.triage'],
};


/**
 * Jedyne miejsce, w którym system odpowiada na pytanie „czy wolno mu to zrobić" W KLUBIE.
 *
 * Zbiór przychodzi z BAZY, razem z członkostwem (`authSnapshot`), a nie z tokenu -
 * dzięki temu odebranie zdolności działa natychmiast, a nie po wygaśnięciu tokenu.
 * `null`/`undefined` (brak członkostwa) nie może niczego, jak pusty zbiór.
 */
export function can(
  capabilities: readonly Capability[] | null | undefined,
  capability: Capability,
): boolean {
  return capabilities?.includes(capability) ?? false;
}

/** To samo pytanie dla roli PLATFORMOWEJ - `null` (zwykła osoba) nie może niczego. */
export function platformCan(role: PlatformRole | null, capability: Capability): boolean {
  return role != null && PLATFORM_CAPABILITIES[role].includes(capability);
}

/** Komplet zdolności platformowych - dla sesji panelu superadministratora. */
export function platformCapabilitiesOf(role: PlatformRole): readonly Capability[] {
  return PLATFORM_CAPABILITIES[role];
}

