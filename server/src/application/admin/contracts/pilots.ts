/**
 * UZ Aero (serwer) - KONTRAKT kont pilotów (`A06`, `A06a`).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` (pilnuje `test/architecture.test.ts`). Ten importuje `PilotRole`
 * z… no właśnie: rola mieszka dziś w `server/src/domain/roles.ts`, a nie we wspólnej
 * domenie (przeniesienie jest otwartą decyzją człowieka -
 * `docs/architektura-panelu-frontend.md` §11 pkt 6). Do czasu tej decyzji kontrakt
 * powtarza unię jako WŁASNY typ napisowy: kopia jest tu tańsza niż złamanie granicy
 * katalogu kontraktów, a panel i tak trzyma swoją (`admin/src/api/dto.ts`).
 *
 * ══ CZEGO W TYM KONTRAKCIE ŚWIADOMIE NIE MA ══
 *  1. **`passwordHash`** - nigdzie i nigdy. Hash nie jest treścią konta, tylko
 *     szczegółem uwierzytelnienia; wjechałby na drut wyłącznie przez przeoczenie.
 *  2. **Hasło startowe w wierszu listy.** Wartość jedzie WYŁĄCZNIE w odpowiedzi na
 *     akcję, która ją wytworzyła (`PilotSecretDto`), i tylko raz. Nie ma trasy
 *     „pokaż ponownie" - kolejny reset generuje nowe.
 *  3. **`lastLoginAt`.** Mockup A06 ma kolumnę „Ostatnie logowanie", a tabela `pilots`
 *     nie ma takiej kolumny i nikt jej nie zapisuje. Zgadywanie z `refresh_tokens`
 *     dałoby „ostatnią rotację sesji telefonu", czyli inną wielkość pod tą samą
 *     etykietą. Pozycja do decyzji: migracja + zapis na ścieżce logowania.
 */

/** Lustro `PILOT_ROLES` z `domain/roles.ts` - patrz nagłówek pliku. */
export type PilotRoleWire = 'pilot' | 'admin';

/** Jedno konto na liście `A06`. */
export interface AdminPilotListItem {
  id: string;
  /** Etykieta widoczna w logu dnia i w kartach arkusza - NIE klucz zdarzeń. */
  code: string;
  name: string;
  email: string | null;
  active: boolean;
  role: PilotRoleWire;
  /** ISO 8601 UTC - ostatnia zmiana wiersza konta (nie: ostatnie logowanie). */
  updatedAt: string;
  /**
   * Dni lotne w oknie `daysFrom`–`daysTo`: sesje ZAMKNIĘTE, w których konto było
   * PIC-em albo Dualem. Liczy serwer agregatem po projekcji `sessions`.
   */
  flyingDays: number;
}

/** Liczniki kafli i karty „Rola w panelu" - po WSZYSTKICH kontach, nie po filtrze. */
export interface AdminPilotCounts {
  total: number;
  active: number;
  inactive: number;
  admin: number;
  /** `training_lead` wypadł razem z rolą (2026-08-30) - patrz `domain/roles.ts`. */
  pilot: number;
  /**
   * Dni lotne CAŁEGO klubu w oknie `daysFrom`–`daysTo`: liczba sesji ZAMKNIĘTYCH,
   * a nie suma kolumny `flyingDays`. Dzień szkolny liczy się dwóm pilotom naraz, więc
   * suma kolumny jest liczbą osobodni - panel nie ma jak tej różnicy odgadnąć i nie
   * powinien próbować.
   */
  flyingDays: number;
}

/**
 * Liczniki CHIPÓW filtra - cztery zawężenia listy w bieżącym WYSZUKIWANIU.
 *
 * Osobne od `AdminPilotCounts`, bo odpowiadają na inne pytanie. Kafel mówi o KLUBIE
 * („Konta aktywne 8 / 10") i ma się nie ruszać przy wpisywaniu w wyszukiwarkę; chip
 * z liczbą jest obietnicą „tyle wierszy zobaczysz po kliknięciu". Do 2026-08-01 chipy
 * nosiły liczby kafli, więc po wpisaniu frazy chip „Nieaktywni" pokazywał 2 i po
 * kliknięciu dawał pustą tabelę.
 *
 * Zawęża je wyłącznie wyszukiwanie, nie wybrany chip - inaczej liczby na czterech
 * chipach przestałyby być porównywalne między sobą.
 */
export interface AdminPilotScopeCounts {
  /** Chip „Wszyscy". */
  total: number;
  active: number;
  inactive: number;
  /** Chip „Z rolą panelu" - konta z rolą dającą wejście do panelu. */
  panel: number;
}

/**
 * Lista kont. Bez kursora: klub ma kilkanaście kont, a lista referencyjna, którą da
 * się wziąć w całości, jest użyteczna także dla filtrów innych ekranów (`A02`).
 * `total` mówi, ile kont spełnia filtr - także wtedy, gdy `limit` obciął stronę.
 */
export interface AdminPilotPage {
  items: AdminPilotListItem[];
  total: number;
  counts: AdminPilotCounts;
  /** Liczniki chipów - patrz `AdminPilotScopeCounts`. Bez wyszukiwania = jak `counts`. */
  scopes: AdminPilotScopeCounts;
  /** Okno, w którym policzono `flyingDays` - dzień UTC `YYYY-MM-DD`, włącznie. */
  daysFrom: string;
  daysTo: string;
}

/** Odpowiedź zmiany konta: nowy stan wiersza + skutki uboczne. */
export interface PilotChangeDto {
  pilot: AdminPilotListItem;
  /** `0` przy zmianie tożsamości; przy deaktywacji - ile sesji zerwano. */
  revokedSessions: number;
}
