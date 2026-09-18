/**
 * Ninerdeck (serwer) - SŁOWNIK SESJI LOGOWANIA (2.1.0, issue #133;
 * `docs/logowanie-haslem.md` §4.3, §6).
 *
 * Trzy katalogi wartości, które muszą zgadzać się w czterech miejscach naraz: CHECK-i
 * migracji 10, adapter, claim `sid` w tokenie i napisy panelu. Stąd listy stoją TU, przy
 * domenie, a nie przy tabeli - dokładnie jak `PILOT_ROLES` w `roles.ts`. Adapter, który
 * czyta wartość z bazy, przepuszcza ją przez strażnika: CHECK broni zapisu, ale wiersz
 * wpisany kiedyś ręką albo przyszłą migracją nie ma prawa wywrócić odczytu.
 */

/**
 * Czym człowiek dowiódł, że to on.
 *
 * `legacy` nie jest metodą, tylko BRAKIEM ODPOWIEDZI: noszą je sesje z backfillu
 * migracji 10 (refreshe sprzed 2.1.0) i sesje wydane z tokenu osoby sprzed tej wersji.
 * Nic nowego tej wartości nie zakłada - stąd `LOGIN_METHODS_ISSUED` osobno, dla miejsc,
 * w których wybór jest świadomy.
 *
 * Kodu jednorazowego do przepisywania NIE MA (decyzja właściciela, §5.4) i dlatego nie
 * ma tu wartości `code`, choć wcześniejsza wersja listy zadań #133 ją wymieniała.
 */
export const LOGIN_METHODS = ['google', 'password', 'legacy'] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

/** Metody, którymi wolno OZNACZYĆ nową sesję - `legacy` opisuje wyłącznie przeszłość. */
export const LOGIN_METHODS_ISSUED = ['google', 'password'] as const;

export const isLoginMethod = (value: unknown): value is LoginMethod =>
  typeof value === 'string' && (LOGIN_METHODS as readonly string[]).includes(value);

/** Gdzie ta sesja żyje: para tokenów w telefonie albo ciasteczko w przeglądarce. */
export const SESSION_SURFACES = ['mobile', 'panel'] as const;
export type SessionSurface = (typeof SESSION_SURFACES)[number];

export const isSessionSurface = (value: unknown): value is SessionSurface =>
  typeof value === 'string' && (SESSION_SURFACES as readonly string[]).includes(value);

/**
 * KTO sesję zakończył - do napisu w panelu i do wpisu w audycie.
 *
 * `self` = człowiek wylogował się sam (telefon albo panel), `admin` = administrator klubu
 * z karty członka, `platform` = blokada osoby przez superadministratora, `system` = skutek
 * uboczny innej decyzji (zmiana hasła, realizacja linku, wyłączenie członkostwa), czyli
 * jedyna wartość, za którą nie stoi czyjeś kliknięcie w sesję.
 */
export const REVOCATION_SOURCES = ['self', 'admin', 'platform', 'system'] as const;
export type RevokedBy = (typeof REVOCATION_SOURCES)[number];
