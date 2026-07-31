/**
 * UZ Aero (serwer) — role kont i uprawnienia panelu administracyjnego.
 *
 * Decyzja 2026-07-31 (odwraca 2026-07-24): panel powstaje jako osobna aplikacja web,
 * z dwiema rolami. Projekt UI: `design/admin/`; analiza i mapowanie ekranów na
 * uprawnienia: `design/admin/ANALIZA.md`.
 *
 * **Rola siedzi na koncie pilota, nie w osobnej tabeli użytkowników panelu**, bo
 * administrator i szef wyszkolenia SĄ pilotami — latają, mają telefon i dodatkowo
 * wchodzą do back-office'u. Osobny byt użytkownika rozdwoiłby tożsamość: ten sam
 * człowiek miałby dwa identyfikatory, a jego nalot rozjechałby się między nimi.
 *
 * **Uprawnienia trzymamy jako mapę ról na zdolności**, a nie jako `if (role === 'admin')`
 * rozsiane po trasach. Powód jest ten sam, dla którego istnieje `http/authorize.ts`:
 * pytanie „kto może rozwiązać flagę" ma mieć JEDNĄ odpowiedź, w jednym pliku, który
 * da się przeczytać w całości i pokryć testem. Rozsiane porównania ról to konstrukcja,
 * w której nikt nigdy nie wie, czy zna wszystkie miejsca.
 */

/** Kolejność bez znaczenia — to zbiór, nie drabina. Uprawnienia daje mapa niżej. */
export const PILOT_ROLES = ['pilot', 'training_lead', 'admin'] as const;

export type PilotRole = (typeof PILOT_ROLES)[number];

/**
 * Rola konta, którego rola jest nieznana (stary token, kolumna z domyślną wartością).
 * Zawsze najmniejsze uprawnienia: podniesienie musi być jawną decyzją administratora,
 * nigdy skutkiem ubocznym wdrożenia albo błędu odczytu.
 */
export const DEFAULT_ROLE: PilotRole = 'pilot';

export type Capability =
  /** Wejście do panelu w ogóle — bez tego logowanie do `admin/` jest odrzucane. */
  | 'panel.access'
  /** Zamknięcie flagi (`status='resolved'`) i wywołany tym re-eksport karty dnia. */
  | 'flags.resolve'
  /** Korekta zdarzenia po oknie 24 h — dopisanie `event_correction` w cudzej sesji. */
  | 'events.correct'
  /** Zakładanie kont, reset hasła, deaktywacja, zmiana roli. */
  | 'accounts.manage'
  /** Dodanie i edycja samolotu, wyłączenie ze służby. */
  | 'fleet.manage'
  /** Zmiana tolerancji flag (progi detekcji są tylko do odczytu — patrz A08). */
  | 'thresholds.manage'
  /** Odczyt dziennika akcji administratorów. */
  | 'audit.read';

const CAPABILITIES: Readonly<Record<PilotRole, readonly Capability[]>> = {
  // Pilot pracuje wyłącznie w aplikacji na telefonie. Panel go nie dotyczy —
  // i to jest pełna lista jego uprawnień w panelu, celowo pusta.
  pilot: [],

  // Szef wyszkolenia: patrzy i rozstrzyga rozbieżności. NIE dostaje korekty zdarzeń
  // ani audytu (rekomendacja `ANALIZA.md`, do rewizji, gdy praktyka pokaże inaczej):
  // wyjaśnienie rozbieżności to inna odpowiedzialność niż pisanie w cudzym rejestrze.
  training_lead: ['panel.access', 'flags.resolve'],

  // Administrator — wszystko. Lista jest wypisana jawnie, a nie wyliczona jako
  // „reszta": dopisanie nowej zdolności ma zmusić do świadomej decyzji, komu ją dać.
  admin: [
    'panel.access',
    'flags.resolve',
    'events.correct',
    'accounts.manage',
    'fleet.manage',
    'thresholds.manage',
    'audit.read',
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
