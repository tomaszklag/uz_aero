/**
 * UZ Aero (serwer) - role kont i uprawnienia panelu administracyjnego.
 *
 * Decyzja 2026-07-31 (odwraca 2026-07-24): panel powstaje jako osobna aplikacja web,
 * z dwiema rolami. Projekt UI: `design/admin/`; analiza i mapowanie ekranów na
 * uprawnienia: `design/admin/ANALIZA.md`.
 *
 * **Rola siedzi na koncie pilota, nie w osobnej tabeli użytkowników panelu**, bo
 * administrator JEST pilotem - lata, ma telefon i dodatkowo wchodzi do back-office'u.
 * Osobny byt użytkownika rozdwoiłby tożsamość: ten sam człowiek miałby dwa
 * identyfikatory, a jego nalot rozjechałby się między nimi.
 *
 * **Uprawnienia trzymamy jako mapę ról na zdolności**, a nie jako `if (role === 'admin')`
 * rozsiane po trasach. Powód jest ten sam, dla którego istnieje `http/authorize.ts`:
 * pytanie „kto może rozwiązać flagę" ma mieć JEDNĄ odpowiedź, w jednym pliku, który
 * da się przeczytać w całości i pokryć testem. Rozsiane porównania ról to konstrukcja,
 * w której nikt nigdy nie wie, czy zna wszystkie miejsca.
 */

/**
 * Kolejność bez znaczenia - to zbiór, nie drabina. Uprawnienia daje mapa niżej.
 *
 * == `training_lead` WYCOFANY 2026-08-30 (decyzja właściciela produktu) ==
 * „Na razie pozbądźmy się roli szef wyszkolenia, niech zostanie tylko admin i pilot.
 * Rozbudujemy i przemyślimy uprawnienia w kolejnych iteracjach."
 *
 * Zostają dwie role i jedna z nich w ogóle nie dotyczy panelu, więc KAŻDY, kto wejdzie
 * do back-office'u, ma dziś komplet zdolności. Katalog `Capability` zostaje mimo to
 * rozpisany i egzekwowany na każdej trasie - bo wraca razem z trzecią rolą, a brama,
 * która przez jedną iterację nie odmawia nikomu, jest tańsza niż brama dopisywana
 * z powrotem do dwudziestu tras.
 *
 * **`CHECK` na kolumnie `pilots.role` poszedł za tą zmianą** (decyzja użytkownika:
 * „nic nie jest wdrożone, mamy kontrolę nad danymi") - kolumna dopuszcza dokładnie te
 * dwie role. Baza założona wcześniej ma starsze ograniczenie i to nie przeszkadza:
 * żaden wiersz go nie używa, a każdy odczyt przechodzi przez
 * `isPilotRole(...) ? role : DEFAULT_ROLE` (`infrastructure/pg/**\/pilotsRepo.ts`,
 * `infrastructure/auth/hs256Tokens.ts`), więc wartość spoza katalogu schodzi do
 * `pilot` - czyli do NAJMNIEJSZYCH uprawnień. Ten kierunek błędu jest bezpieczny;
 * odwrotny nie byłby.
 */
export const PILOT_ROLES = ['pilot', 'admin'] as const;

export type PilotRole = (typeof PILOT_ROLES)[number];

/**
 * Rola konta, którego rola jest nieznana (stary token, kolumna z domyślną wartością).
 * Zawsze najmniejsze uprawnienia: podniesienie musi być jawną decyzją administratora,
 * nigdy skutkiem ubocznym wdrożenia albo błędu odczytu.
 */
export const DEFAULT_ROLE: PilotRole = 'pilot';

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
  | 'maintenance.run';

const CAPABILITIES: Readonly<Record<PilotRole, readonly Capability[]>> = {
  // Pilot pracuje wyłącznie w aplikacji na telefonie. Panel go nie dotyczy -
  // i to jest pełna lista jego uprawnień w panelu, celowo pusta.
  pilot: [],

  // Administrator - wszystko. Lista jest wypisana jawnie, a nie wyliczona jako
  // „reszta": dopisanie nowej zdolności ma zmusić do świadomej decyzji, komu ją dać.
  admin: [
    'panel.access',
    'flags.resolve',
    'events.correct',
    'accounts.manage',
    'fleet.manage',
    'thresholds.manage',
    'audit.read',
    'maintenance.run',
  ],
};

/** Strażnik wejścia z zewnątrz (kolumna w bazie, claim w tokenie, body żądania). */
export function isPilotRole(value: unknown): value is PilotRole {
  return typeof value === 'string' && (PILOT_ROLES as readonly string[]).includes(value);
}

/** Jedyne miejsce, w którym system odpowiada na pytanie „czy wolno mu to zrobić". */
export function can(role: PilotRole, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

/**
 * Komplet zdolności roli - dla `GET /admin/api/me`.
 *
 * Panel MUSI znać tę listę, bo mockup wymaga pozycji nawigacji **widocznych
 * i wyszarzonych** z podanym powodem, a nie ukrytych (`SZABLON.html`, `.nav-item.locked`).
 * Wysyłanie listy zamiast samej roli oznacza, że panel nie trzyma DRUGIEJ kopii mapy
 * uprawnień: zmiana tutaj przemalowuje sidebar bez wydania panelu.
 *
 * To nadal WYŁĄCZNIE podpowiedź dla UI - egzekwuje `can` na każdym żądaniu. Ukrycie
 * przycisku nigdy nie było zabezpieczeniem i tym się nie staje.
 */
export function capabilitiesOf(role: PilotRole): readonly Capability[] {
  return CAPABILITIES[role];
}
