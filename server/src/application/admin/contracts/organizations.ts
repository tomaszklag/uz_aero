/**
 * UZ Aero (serwer) - KONTRAKT klubu w odpowiedziach panelu (wielofirmowość, issue #98;
 * `docs/wielofirmowosc.md` §8).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` i siebie nawzajem (pilnuje `test/architecture.test.ts`).
 *
 * Klub w odpowiedziach panelu to trzy pola: identyfikator (klucz w adresach tras),
 * slug (jedyny identyfikator PUBLICZNY - adres kart arkusza, nadawany raz) i nazwa
 * (napis dla człowieka, może się zmieniać). Moduł Organizacje (epik E) dołoży tu
 * listę klubów z licznikami; do tego czasu kontrakt niesie to, co panel klubu
 * potrzebuje w pasku górnym i w kontekście kolumny bocznej: nazwę swojego klubu.
 */

/** Klub tak, jak nazywa go panel: w sesji, w kontekście kolumny bocznej, w adresie karty. */
export interface OrganizationRef {
  id: string;
  slug: string;
  name: string;
}

/**
 * Lustro `MEMBERSHIP_STATUSES` z `domain/memberships.ts` - ta sama kopia, co
 * `PilotRoleWire` w `pilots.ts` i z tego samego powodu (granica katalogu kontraktów).
 */
export type MembershipStatusWire = 'pending' | 'active' | 'disabled' | 'rejected';

/** Lustro `PLATFORM_ROLES` z `domain/roles.ts`. */
export type PlatformRoleWire = 'superadmin';

// ── kod klubu: panel KLUBU (wielofirmowość §3.8, §8.3; issue #100, D2) ──────────

/**
 * KOD KLUBU na karcie „Kod klubu" (mockup `piloci-kod-klubu`).
 *
 * ══ DLACZEGO KOD JEDZIE JAWNIE, A NIE „POKAŻ RAZ" ══
 * Bo nie jest sekretem: daje WYŁĄCZNIE zgłoszenie do rozpatrzenia, a wpuszcza człowiek
 * (§3.8). Administrator musi go odczytać z ekranu, żeby podać pilotom - więc karta
 * pokazuje go na stałe, a nie jednorazowo po akcji.
 *
 * `code: null` = dołączanie kodem wyłączone; karta pokazuje wtedy kreski i „Wygeneruj
 * kod" (stan P4a). `formatted` jest zapisem kanonicznym `XXX-XXXX` - panel nie składa go
 * sam, bo to ta sama reguła, przez którą nazwę karty arkusza liczy wyłącznie serwer.
 */
export interface AdminClubCode {
  code: string | null;
  formatted: string | null;
  /** ISO 8601 UTC - „Obowiązuje od"; `null` razem z kodem. */
  since: string | null;
  /** Zgłoszenia złożone TYM kodem i czekające na decyzję - patrz `ClubCodeState`. */
  pendingWithCode: number;
}

// ── moduł Organizacje: platforma (wielofirmowość §8.1; issue #100, D3) ──────────

/**
 * Administrator klubu na liście platformy - odpowiedź na pytanie „do kogo dzwonić".
 *
 * `signedIn: false` = członkostwo `admin` istnieje, ale tożsamość Google jeszcze się pod
 * ten adres nie podpięła (nikt się nie zalogował). To jedyny stan, w którym
 * superadministrator ma coś do zrobienia - przypomnieć się - więc mockup nazywa go
 * wprost („nie zalogował się", plakietka „Administrator nie wszedł").
 */
export interface AdminOrganizationAdmin {
  pilotId: string;
  name: string;
  email: string | null;
  /** Kod pilota W TYM klubie - z członkostwa, nie z osoby. */
  code: string;
  signedIn: boolean;
}

/**
 * Wiersz listy klubów (mockup `organizacje-lista`).
 *
 * Z wnętrza klubu niesie SAME LICZBY i administratorów - tak stanowi §3.3 („nic nie
 * wycieka między klubami" obejmuje też tę listę). Dziennika, floty ani kolejki zgłoszeń
 * superadministrator nie widzi i ta lista nie jest wyjątkiem.
 */
export interface AdminOrganizationListItem {
  id: string;
  name: string;
  /** Jedyny PUBLICZNY identyfikator klubu - adres kart arkusza, stały od założenia. */
  slug: string;
  active: boolean;
  /** ISO 8601 UTC - „Założony". */
  createdAt: string;
  members: number;
  aircraft: number;
  admins: AdminOrganizationAdmin[];
}

/**
 * Karta klubu (mockup `organizacje-klub`) - wiersz listy + KOD KLUBU DO ODCZYTU.
 *
 * Kod jest tu po to, żeby superadministrator mógł przekazać go pierwszemu administratorowi
 * razem z dostępem (§8.1, rozstrzygnięcie 2026-09-09). Generowania i wyłączania na tej
 * powierzchni NIE MA - to należy do panelu klubu, bo kod jest konfiguracją klubu,
 * a klub prowadzi go sam.
 */
export interface AdminOrganizationDetail extends AdminOrganizationListItem {
  joinCode: string | null;
  joinCodeFormatted: string | null;
  joinCodeSince: string | null;
}

/** Lista bez kursora: klubów na serwerze jest tyle, ile klubów - nie tyle, ile lotów. */
export interface AdminOrganizationPage {
  items: AdminOrganizationListItem[];
  /** Liczniki chipów „Wszystkie"/„Aktywne" - po WSZYSTKICH klubach, nie po filtrze. */
  counts: { total: number; active: number };
}

/**
 * Założenie klubu: nazwa, slug i PIERWSZY administrator (§8.1).
 *
 * Administrator jest polem WYMAGANYM, bo klub bez niego nie ma jak zacząć: kodem klubu
 * nie miałby go kto zatwierdzić, a drugiej drogi do klubu nie ma. Adres konta Google też
 * jest wymagany - to on podpina tożsamość przy pierwszym logowaniu (bootstrap z §3.8).
 */
export interface AdminOrganizationDraft {
  name: string;
  slug: string;
  admin: { name: string; email: string; code: string };
}
