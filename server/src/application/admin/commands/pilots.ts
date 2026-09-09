/**
 * UZ Aero (serwer) - członkowie klubu: dopisanie, edycja, wyłączenie, usunięcie
 * (panel, mockupy `A06-piloci.html` i `A06a-konto.html`; od wielofirmowości - moduł
 * PILOCI jako lista CZŁONKÓW klubu, `docs/wielofirmowosc.md` §8.3).
 *
 * ══ HASŁA ZNIKŁY (2026-09-04, `docs/logowanie-google.md`) ══
 * Plik powstał 2026-08-01, bo administrator zamknął się poza systemem i nie było żadnej
 * ścieżki zmiany hasła. Wejście Google zdejmuje tę klasę problemów u źródła: konto nie
 * ma poświadczenia, które dałoby się zgubić albo zresetować.
 *
 * ══ OD WIELOFIRMOWOŚCI (issue #98) KOMENDA ZMIENIA CZŁONKOSTWO, NIE OSOBĘ ══
 * Kod, rola i „czy ma dostęp" należą do członkostwa w klubie administratora (`actor.orgId`).
 * Nazwisko i e-mail należą do OSOBY i są widoczne we wszystkich jej klubach - ta komenda
 * je zmienia, bo dziś nie ma innego miejsca (propozycja „tylko przy jednym członkostwie"
 * czeka na potwierdzenie, §8.3). Dopisanie członka o e-mailu osoby z innego klubu
 * dopisuje CZŁONKOSTWO do tej osoby, a nie zakłada drugiej (adapter, `insert`).
 *
 * **Zerwanie sesji ma jedną drogę: wyłączenie członkostwa** (a gdy dostęp ma wrócić -
 * wyłączenie i ponowne włączenie). `memberships.credentials_valid_from` przesuwa
 * `setActive`, a włączenie znacznika NIE cofa. Sesje kasujemy PER KLUB: w drugim klubie
 * człowiek dalej jest członkiem (§3.4).
 *
 * ══ TRZY ZASADY, KTÓRE TA KOMENDA MUSI UTRZYMAĆ ══
 *
 *  1. **Wyłączenie ZRYWA sesje - OBU powierzchni.** Refresh tokeny telefonu (tego klubu)
 *     kasujemy z tabeli; sesji panelu skasować się nie da, bo jest podpisanym JWT
 *     w ciasteczku i nie ma dla niej wiersza. Dlatego ta sama operacja przesuwa
 *     `credentials_valid_from` członkostwa, a brama odrzuca token wydany wcześniej
 *     (`http/authorize.ts`). Liczba unieważnionych TOKENÓW jedzie do audytu i dotyczy
 *     wyłącznie telefonu - panel liczy się osobno.
 *  2. **Administrator nie odcina sam siebie** ani ostatniego administratora KLUBU -
 *     odmowa jest jawna i z powodem (`AccountRefusal`), nigdy ciche ukrycie akcji.
 *     Populację administratorów klubu chroni blokada advisory na kluczu klubu, wzięta
 *     PRZED policzeniem ich (`PilotsAdminPort.lockAdminPopulation`) - patrz `update`.
 *  3. **Osoby, KTÓRA LATAŁA, się nie kasuje.** Wyłączenie odbiera dostęp; zdarzenia
 *     zostają w rejestrze (append-only) i dalej liczą się w statystykach, kartach dnia
 *     i łańcuchu motogodzin samolotu. `remove` przepuszcza wyłącznie osobę, do której
 *     NIC się nie odwołuje - także w INNYCH klubach - i której członkostwo jest już
 *     wyłączone. Usuwalne jest więc dokładnie to, co powstało pomyłką.
 *
 * Konstruktor bez `Database`/`Queryable` - komenda nie ma jak zapisać z pominięciem
 * śladu audytu, bo nie ma uchwytu do bazy (`auditedWrite.ts`, `test/architecture.test.ts`).
 */

import {
  refuseDeactivate,
  refuseDelete,
  refuseRoleChange,
  type AccountRefusal,
} from '../../../domain/accountGuards.ts';
import type { PilotRole } from '../../../domain/roles.ts';
import type { Clock } from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import { uniqueConflictOn } from './uniqueConflict.ts';
import type {
  Actor,
  AdminPilotAccount,
  PilotsAdminPort,
  RefreshTokensAdminPort,
} from '../ports.ts';

export interface CreatePilotInput {
  code: string;
  name: string;
  email: string | null;
  role: PilotRole;
}

/** Zmiana tożsamości albo roli. Pola nieustawione zostają bez zmian. */
export interface UpdatePilotInput {
  code?: string;
  name?: string;
  email?: string | null;
  role?: PilotRole;
}

export interface PilotChange {
  account: AdminPilotAccount;
  revokedSessions: number;
}

/**
 * Uproszczony CQRS repo: komenda zwraca WYNIK, a odmowa jest jego wariantem, nie
 * wyjątkiem na granicy HTTP (wzorzec `ResolveFlagOutcome`, `CorrectEventOutcome`).
 * Trasa mapuje wariant na status i niczego nie interpretuje.
 */
export type PilotOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'no_changes' }
  | { ok: false; reason: 'conflict'; field: 'code' | 'email' }
  | { ok: false; reason: 'refused'; refusal: AccountRefusal };

/**
 * Sygnały przerwania transakcji. Muszą być WYJĄTKAMI, bo tylko wyjątek wycofuje
 * transakcję `AuditedWrite.run` - zwrócenie wartości zostawiłoby wpis audytu
 * o operacji, która się nie zdarzyła. Poza ten plik nie wychodzą.
 */
class PilotNotFound extends Error {}

class NoChanges extends Error {}

class Conflict extends Error {
  constructor(readonly field: 'code' | 'email') {
    super(`pole ${field} jest już zajęte`);
  }
}

class Refused extends Error {
  constructor(readonly refusal: AccountRefusal) {
    super(`odmowa: ${refusal}`);
  }
}

/**
 * Naruszenie UNIKALNOŚCI zgłoszone przez bazę (SQLSTATE `23505`) → pole formularza.
 *
 * Rozpoznanie mieszka w `uniqueConflict.ts` - od 2026-08-01 ma DRUGIEGO konsumenta
 * (rejestracja samolotu, `commands/fleet.ts`), a cała trudność tej funkcji siedzi
 * w jednej linii regexa, której nie wolno mieć w dwóch kopiach. Tutaj zostaje samo
 * PIERWSZEŃSTWO pól przy komunikacie wskazującym oba naraz - kolejność zachowana
 * dokładnie taka, jaka była przed wydzieleniem. Indeks kodu nazywa się dziś
 * `idx_memberships_code` i regex go widzi, bo separatorem jest podkreślenie.
 */
export function uniqueConflictField(err: unknown): 'code' | 'email' | null {
  // Osoba znaleziona po e-mailu JUŻ JEST członkiem tego klubu (`memberships_pkey` =
  // para klub+osoba): dla formularza zajętym polem jest e-mail - to on wskazał osobę.
  // Bez tego przegrany wyścig dwóch „dodaj pilota" z tym samym adresem lądowałby
  // jako 500, choć sprawdzenie przed zapisem nazywa tę samą sytuację `email`.
  if (uniqueConflictOn(err, ['memberships_pkey'] as const) != null) return 'email';
  return uniqueConflictOn(err, ['email', 'code'] as const);
}

/** Jedna zmiana pola w dzienniku audytu: „z czego na co". */
interface FieldDiff {
  from: unknown;
  to: unknown;
}

export class AdminPilotCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly pilots: PilotsAdminPort,
    private readonly sessions: RefreshTokensAdminPort,
    /**
     * Identyfikator OSOBY jako FUNKCJA w konstruktorze, nie port: nie ma tu adaptera
     * do podmiany (composition root podaje `randomUUID`), a port bez drugiej
     * implementacji to koszt bez zysku - ta sama decyzja, co przy `newId`
     * w `commands/corrections.ts`.
     *
     * `id` NIE jest kodem pilota i to jest reguła produktu, nie szczegół: zdarzenia
     * wiążą się z `id`, więc zmiana kodu nie przepisuje historii (mockup A06: „Kod
     * pilota jest etykietą, nie kluczem"). Od wielofirmowości ten sam `id` niesie
     * kilka kodów - po jednym na klub.
     */
    private readonly newId: () => string,
    /**
     * Zegar potrzebny WYŁĄCZNIE po to, żeby ostemplować unieważnienie poświadczeń
     * (`credentials_valid_from`). Nie bierzemy `now()` z SQL-a, bo wtedy w testach
     * znacznik szedłby z zegara systemowego, a `iat` tokenu ze sterowanego zegara -
     * i porównanie tych dwóch odpowiadałoby na pytanie o dwa różne czasy.
     */
    private readonly clock: Clock,
  ) {}

  /**
   * Dopisanie członka WPROST z panelu - droga równoległa do zatwierdzenia zgłoszenia
   * (a docelowo, w epiku D, do trzech dróg zaproszenia).
   *
   * Po wejściu Google (2026-09-04) konto nie dostaje żadnego poświadczenia: logowanie
   * daje dopiero PODPIĘCIE konta Google, a warunkiem podpięcia jest `email` wpisany
   * tutaj przez administratora (`docs/logowanie-google.md` §6). Ta droga istnieje po to,
   * żeby dało się przygotować konto ZANIM człowiek pierwszy raz się zaloguje.
   *
   * Osoba o tym e-mailu może już istnieć (lata w innym klubie) - wtedy powstaje samo
   * członkostwo, a `result.id` jest identyfikatorem TEJ osoby, nie nowym uuid-em.
   */
  async create(actor: Actor, input: CreatePilotInput): Promise<PilotOutcome<AdminPilotAccount>> {
    const proposedId = this.newId();

    try {
      const account = await this.write.run(actor, async (tx) => {
        const clash = await this.pilots.conflict(tx, actor.orgId, {
          code: input.code,
          email: input.email,
          exceptId: null,
        });
        if (clash != null) throw new Conflict(clash);

        const id = await this.pilots.insert(tx, { id: proposedId, orgId: actor.orgId, ...input });
        const created: AdminPilotAccount = { id, orgId: actor.orgId, ...input, active: true };

        return {
          result: created,
          audit: {
            action: 'pilot.create',
            targetType: 'pilot',
            targetId: id,
            details: {
              code: created.code,
              name: created.name,
              // E-mail jest w tym wpisie NAJWAŻNIEJSZY: to on rozstrzyga, czyje konto
              // Google podepnie się pod ten wiersz przy pierwszym logowaniu.
              email: created.email,
              role: created.role,
              // Czy dopisano członkostwo do OSOBY, która już była na serwerze (inny
              // klub), czy założono nową - dziennik ma odróżniać te dwa fakty.
              existingPerson: id !== proposedId,
            },
          },
        };
      });

      return { ok: true, result: account };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdatePilotInput,
  ): Promise<PilotOutcome<PilotChange>> {
    try {
      const account = await this.write.run(actor, async (tx) => {
        const before = await this.pilots.byId(tx, actor.orgId, id);
        if (before == null) throw new PilotNotFound();

        const changes = diffOf(before, input);
        // Zapis bez zmiany zostawiłby w dzienniku wpis o niczym. Dziennik nadzoru,
        // w którym połowa wierszy to „otwarto i zamknięto formularz", przestaje być
        // czytelny - a panel i tak blokuje przycisk, gdy nic nie ruszono.
        if (Object.keys(changes).length === 0) throw new NoChanges();

        if (input.role !== undefined) {
          // Blokada PRZED odczytem licznika i w TEJ SAMEJ transakcji - inaczej nie
          // szereguje niczego. `SELECT COUNT(*)` w READ COMMITTED nie blokuje, a dwie
          // transakcje odbierające rolę DWÓM RÓŻNYM administratorom piszą do różnych
          // wierszy, więc bez tej blokady nic ich nie serializuje: obie widzą „jest
          // dwóch", obie commitują i zostaje ZERO administratorów. Z blokadą druga
          // transakcja liczy dopiero po pierwszej, widzi jednego i odbija się
          // o `last_admin` - czyli gałąź, która dopiero tu staje się osiągalna.
          await this.pilots.lockAdminPopulation(tx, actor.orgId);

          const refusal = refuseRoleChange({
            actorPilotId: actor.pilotId,
            targetPilotId: id,
            currentRole: before.role,
            nextRole: input.role,
            targetActive: before.active,
            activeAdmins: await this.pilots.countActiveAdmins(tx, actor.orgId),
          });
          if (refusal != null) throw new Refused(refusal);
        }

        if (input.code !== undefined || input.email !== undefined) {
          const clash = await this.pilots.conflict(tx, actor.orgId, {
            code: input.code ?? before.code,
            email: input.email === undefined ? before.email : input.email,
            exceptId: id,
          });
          if (clash != null) throw new Conflict(clash);
        }

        await this.pilots.update(tx, actor.orgId, id, input);
        const after: AdminPilotAccount = { ...before, ...stripUndefined(input) };

        return {
          result: after,
          audit: {
            action: 'pilot.update',
            targetType: 'pilot',
            targetId: id,
            // Diff, a nie stan po zmianie: dziennik ma odpowiadać na pytanie „co się
            // zmieniło", a stan bieżący i tak widać na liście. Pole niezmienione
            // w ogóle się tu nie pojawia.
            details: { code: before.code, changes },
          },
        };
      });

      return { ok: true, result: { account, revokedSessions: 0 } };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  /**
   * Wyłączenie i włączenie członkostwa jedną komendą, bo to jest jedna decyzja („czy
   * ten człowiek ma dostęp do klubu"), tylko w dwie strony. Rozjeżdżają się w DWÓCH
   * miejscach i oba są istotne:
   *
   *  • **wyłączenie zrywa sesje** (tego klubu), włączenie nie ma czego zrywać;
   *  • **akcja w audycie** jest inna. `pilot.deactivate` istnieje w katalogu
   *    (`domain/adminActions.ts`), `pilot.activate` - NIE, i to jest świadoma treść
   *    tego katalogu, a nie luka: przywrócenie dostępu jest zmianą stanu członkostwa,
   *    czyli zwykłą aktualizacją. Odebranie dostępu ma własny kod, bo jest
   *    zdarzeniem, którego szuka się w dzienniku po nazwie.
   */
  async setActive(actor: Actor, id: string, active: boolean): Promise<PilotOutcome<PilotChange>> {
    try {
      const result = await this.write.run(actor, async (tx) => {
        // Blokada PRZED odczytem stanu konta, a nie dopiero przed licznikiem:
        // aktywacja też zmienia populację administratorów (przywraca administratora),
        // więc obie strony tej operacji muszą stać w tej samej kolejce co zmiana roli.
        // Klucz jest per klub, więc kolejka jest jedna dla wszystkich trzech ścieżek.
        await this.pilots.lockAdminPopulation(tx, actor.orgId);

        const before = await this.pilots.byId(tx, actor.orgId, id);
        if (before == null) throw new PilotNotFound();
        if (before.active === active) throw new NoChanges();

        if (!active) {
          const refusal = refuseDeactivate({
            actorPilotId: actor.pilotId,
            targetPilotId: id,
            currentRole: before.role,
            activeAdmins: await this.pilots.countActiveAdmins(tx, actor.orgId),
          });
          if (refusal != null) throw new Refused(refusal);
        }

        // `at` stempluje unieważnienie poświadczeń - patrz `PilotsAdminPort.setActive`.
        await this.pilots.setActive(tx, actor.orgId, id, active, this.clock.now());
        // Sesje zrywamy TĄ SAMĄ transakcją, co zmianę statusu. Rozdzielenie
        // zostawiałoby okno, w którym członkostwo jest już wyłączone, a token jeszcze
        // działa - czyli dokładnie stan, którego ta operacja ma nie dopuścić.
        const revokedSessions = active
          ? 0
          : await this.sessions.revokeAllFor(tx, id, actor.orgId);

        return {
          result: { account: { ...before, active }, revokedSessions },
          audit: {
            action: active ? ('pilot.update' as const) : ('pilot.deactivate' as const),
            targetType: 'pilot',
            targetId: id,
            details: {
              code: before.code,
              changes: { active: { from: before.active, to: active } },
              revokedSessions,
            },
          },
        };
      });

      return { ok: true, result };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  /**
   * TRWAŁE usunięcie członkostwa RAZEM z osobą (2026-08-30).
   *
   * ══ DLACZEGO TA OPERACJA W OGOLE ISTNIEJE, SKORO „KONT SIE NIE KASUJE" ══
   * Bo zasada 3 tego pliku mówi o osobie, KTÓRA LATAŁA - i dla takiej zostaje
   * w mocy: `refuseDelete` odbija wszystko, do czego cokolwiek się odwołuje (a od
   * wielofirmowości także osobę z członkostwem w innym klubie). To, co zostaje
   * usuwalne, to konto założone pomyłką: literówka w kodzie, dubel, ktoś, kto
   * ostatecznie nie dołączył. Trzymanie takiego wiersza na zawsze zamienia listę klubu
   * w archiwum cudzych pomyłek, a wyłączenie go nie usuwa - tylko przenosi na dół listy.
   *
   * ══ BLOKADA POPULACJI ADMINISTRATORÓW ══
   * Bierzemy ją jak przy wyłączeniu i zmianie roli, mimo że usuwane członkostwo MUSI już
   * być nieaktywne (więc do puli administratorów się nie liczy). Powód jest w wyścigu:
   * bez blokady równoległe włączenie tego samego członkostwa mogłoby wejść między odczyt
   * a `DELETE` - i skasowalibyśmy konto, które w tej samej chwili odzyskało dostęp.
   */
  async remove(actor: Actor, id: string): Promise<PilotOutcome<{ account: AdminPilotAccount }>> {
    try {
      const result = await this.write.run(actor, async (tx) => {
        await this.pilots.lockAdminPopulation(tx, actor.orgId);

        const account = await this.pilots.byId(tx, actor.orgId, id);
        if (account == null) throw new PilotNotFound();

        const refusal = refuseDelete({
          actorPilotId: actor.pilotId,
          targetPilotId: id,
          targetActive: account.active,
          references: await this.pilots.references(tx, actor.orgId, id),
        });
        if (refusal != null) throw new Refused(refusal);

        await this.pilots.delete(tx, actor.orgId, id);

        return {
          result: { account },
          audit: {
            action: 'pilot.delete' as const,
            targetType: 'pilot',
            targetId: id,
            // KOMPLET tożsamości, nie sam identyfikator: wiersza już nie ma, więc ten
            // wpis jest jedynym miejscem, z którego da się odczytać, KOGO usunięto.
            // `targetId` zostaje uuid-em, którego nikt nie rozpozna.
            details: {
              code: account.code,
              name: account.name,
              email: account.email,
              role: account.role,
            },
          },
        };
      });

      return { ok: true, result };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  /** Wyjątek przerwania transakcji → wariant wyniku. Nieznany błąd leci dalej. */
  private asOutcome<T>(err: unknown): PilotOutcome<T> {
    if (err instanceof PilotNotFound) return { ok: false, reason: 'not_found' };
    if (err instanceof NoChanges) return { ok: false, reason: 'no_changes' };
    if (err instanceof Conflict) return { ok: false, reason: 'conflict', field: err.field };
    if (err instanceof Refused) return { ok: false, reason: 'refused', refusal: err.refusal };

    // Przegrany wyścig o unikalność to TA SAMA odpowiedź, co sprawdzenie przed
    // zapisem - 409 z nazwą pola. Bez tego dwa równoległe `POST /pilots` z tym samym
    // kodem kończyły się 500, czyli komunikatem „coś się zepsuło" na zdarzenie, które
    // ma gotowe wyjaśnienie i gotowy formularz do poprawienia.
    const field = uniqueConflictField(err);
    if (field != null) return { ok: false, reason: 'conflict', field };

    throw err;
  }
}

/**
 * Co naprawdę się zmienia - pola o wartości identycznej z obecną wypadają.
 *
 * Bez tego „zapisz" bez zmiany pola dopisywałby do dziennika wiersz mówiący, że kod
 * pilota zmienił się z `KZA` na `KZA`. Diff jest tu jedyną treścią wpisu, więc jego
 * pustka jest sygnałem, że operacji nie ma po co wykonywać (`NoChanges`).
 */
function diffOf(before: AdminPilotAccount, input: UpdatePilotInput): Record<string, FieldDiff> {
  const changes: Record<string, FieldDiff> = {};
  for (const key of ['code', 'name', 'email', 'role'] as const) {
    const next = input[key];
    if (next === undefined) continue;
    if (next === before[key]) continue;
    changes[key] = { from: before[key], to: next };
  }
  return changes;
}

/** `{code: undefined}` nadpisałoby wartość w rozwinięciu obiektu - stąd ten filtr. */
function stripUndefined(input: UpdatePilotInput): Partial<AdminPilotAccount> {
  const out: Partial<AdminPilotAccount> = {};
  if (input.code !== undefined) out.code = input.code;
  if (input.name !== undefined) out.name = input.name;
  if (input.email !== undefined) out.email = input.email;
  if (input.role !== undefined) out.role = input.role;
  return out;
}
