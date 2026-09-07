/**
 * UZ Aero (serwer) - KONTRAKT dziennika audytu panelu (`A09`).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` (pilnuje `test/architecture.test.ts`). Ten akurat nie importuje
 * niczego: dziennik audytu nie opisuje bytu domenowego. Opisuje AKCJĘ CZŁOWIEKA przy
 * biurku - a domena nie zna ani panelu, ani ról, ani adresów IP.
 *
 * ══ CO TEN KONTRAKT ŚWIADOMIE ZOSTAWIA NIEDOMKNIĘTE ══
 *
 *  1. **`action` jest napisem, nie unią `AdminAction`.** Migracja 9 celowo nie ma
 *     `CHECK`-a na tej kolumnie (uzasadnienie stoi nad nią w `schema.ts`): wiersz jest
 *     zapisem historycznym, więc przemianowanie akcji nie może unieważnić tego, co
 *     zdarzyło się rok temu. Kontrakt idzie za tą decyzją - kod spoza katalogu jedzie
 *     do panelu DOSŁOWNIE, a nazwanie go (plakietka, opis) jest sprawą panelu.
 *     To samo dotyczy `actorRole`.
 *  2. **`details` jest workiem `Record<string, unknown>`.** Kształt zależy od akcji
 *     i serwer go nie interpretuje - `domain/adminActions.ts` mówi wprost: „serwer
 *     nie zna języka interfejsu". Rozpisanie tego na unię per akcja związałoby kontrakt
 *     z treścią komend i wymuszałoby migrację typu przy każdym nowym polu diffu.
 */

/** Jeden wpis dziennika - wiersz tabeli `A09`. */
export interface AdminAuditEntry {
  /** `admin_audit.id` - rosnący, widoczny w kolumnie czasu jako `#8814`. */
  id: number;
  /** ISO 8601 UTC - chwila akcji wg zegara serwera. */
  createdAt: string;

  actorPilotId: string;
  /** Kod i nazwisko z `pilots`; `null` = konta już nie ma, wpis zostaje. */
  actorCode: string | null;
  actorName: string | null;
  /** Rola Z CHWILI AKCJI, surowym napisem (patrz nagłówek pliku). */
  actorRole: string;

  /** Surowy kod akcji (`zasób.czynność`) - także spoza katalogu. */
  action: string;
  /** Na czym: `flag` · `event` · `pilot` · `aircraft` · `sheet` · `threshold`. */
  targetType: string | null;
  targetId: string | null;

  /** Diff, notatka, kontekst decyzji. NIGDY hasło, hash, token ani PIN. */
  details: Record<string, unknown>;
  /** `null` = akcja spoza żądania HTTP (skrypt administracyjny). */
  ip: string | null;
}

/**
 * Strona dziennika. Kursor KEYSET, nie `OFFSET`: `admin_audit` rośnie w nieskończoność
 * i rośnie W TRAKCIE przeglądania, a offset na rosnącej tabeli gubi wiersze między
 * stronami i dubluje inne - najgorszy możliwy tryb awarii narzędzia nadzoru.
 *
 * `nextCursor === null` znaczy „to był koniec", a nie „spróbuj jeszcze raz".
 */
export interface AdminAuditPage {
  items: AdminAuditEntry[];
  nextCursor: string | null;
  /**
   * Ile wpisów spełnia CAŁY filtr - także wtedy, gdy `limit` obciął stronę.
   *
   * **`null` = „nie liczyliśmy", a nie „zero".** Liczba jest własnością ZAPYTANIA,
   * nie strony: nie zmienia się przy przewijaniu, więc serwer płaci za nią raz, przy
   * pierwszej stronie (bez kursora), a strony kursorowe oddają `null`. Klient niesie
   * wartość z pierwszej strony. Sklejenie `null` z zerem kazałoby ekranowi twierdzić,
   * że w całej historii systemu nie było ani jednej akcji - dokładnie wtedy, gdy nic
   * o tym nie wie.
   */
  total: number | null;
}
