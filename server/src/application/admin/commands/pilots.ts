/**
 * UZ Aero (serwer) — konta pilotów: zakładanie, edycja, reset hasła, deaktywacja
 * (panel, mockupy `A06-piloci.html` i `A06a-konto.html`).
 *
 * ══ DLACZEGO TEN PLIK POWSTAJE AKURAT TERAZ ══
 * 2026-08-01 administrator nie mógł wejść do systemu, bo w całym produkcie nie było
 * ŻADNEJ ścieżki zmiany hasła: seed z założenia nie nadpisuje `password_hash`, CLI nie
 * ma, panelu kont nie było. Jedynym wyjściem był ręczny `UPDATE` z hashem policzonym
 * poza aplikacją — czyli operacja bez śladu, bez walidacji i bez świadka. Ten plik to
 * zamyka; `domain/accountGuards.ts` pilnuje, żeby przy okazji nie otworzył gorszej
 * dziury (jeden klik zostawiający klub bez administratora).
 *
 * ══ CZTERY ZASADY, KTÓRE TA KOMENDA MUSI UTRZYMAĆ ══
 *
 *  1. **Hasło generuje SERWER i oddaje je RAZ.** Panel nigdy hasła nie wysyła i nie ma
 *     trasy „pokaż ponownie". Do dziennika audytu idzie WYŁĄCZNIE fakt i komu — nigdy
 *     wartość, nigdy hash (`A09`: „Hasła, hashe, PIN-y — nigdy").
 *  2. **Deaktywacja i reset ZRYWAJĄ sesje — OBU powierzchni.** Refresh tokeny telefonu
 *     kasujemy z tabeli; sesji panelu skasować się nie da, bo jest podpisanym JWT
 *     w ciasteczku i nie ma dla niej wiersza. Dlatego te same dwie operacje przesuwają
 *     `credentials_valid_from` konta, a brama odrzuca token wydany
 *     wcześniej (`http/authorize.ts`). Bez tego „Deaktywuj" jest obietnicą bez pokrycia
 *     w obie strony: pilot z żywym refreshem pracuje dalej, a wykradzione poświadczenie
 *     panelu przeżywa reset hasła o osiem godzin. Liczba unieważnionych TOKENÓW jedzie
 *     do audytu i dotyczy wyłącznie telefonu — panel liczy się osobno, bo jego sesji
 *     nikt nie zliczał i zliczyć nie może.
 *  3. **Administrator nie odcina sam siebie** ani ostatniego administratora klubu —
 *     odmowa jest jawna i z powodem (`AccountRefusal`), nigdy ciche ukrycie akcji.
 *     Populację administratorów chroni blokada advisory na stałym kluczu, wzięta
 *     PRZED policzeniem ich (`PilotsAdminPort.lockAdminPopulation`) — patrz `update`.
 *  4. **Konta się NIE KASUJE.** Deaktywacja odbiera dostęp; zdarzenia zostają
 *     w rejestrze (append-only) i dalej liczą się w statystykach, kartach dnia
 *     i łańcuchu motogodzin samolotu. W tym pliku nie ma i nie może być `DELETE`
 *     na `pilots`.
 *
 * Konstruktor bez `Database`/`Queryable` — komenda nie ma jak zapisać z pominięciem
 * śladu audytu, bo nie ma uchwytu do bazy (`auditedWrite.ts`, `test/architecture.test.ts`).
 */

import {
  refuseDeactivate,
  refusePasswordReset,
  refuseRoleChange,
  type AccountRefusal,
} from '../../../domain/accountGuards.ts';
import type { PilotRole } from '../../../domain/roles.ts';
import type { Clock, PasswordHasher } from '../../common/ports.ts';
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

export interface PilotSecret {
  account: AdminPilotAccount;
  /** Wartość jawna — jedyny raz w całym systemie. Trasa oddaje ją i zapomina. */
  password: string;
  revokedSessions: number;
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
 * transakcję `AuditedWrite.run` — zwrócenie wartości zostawiłoby wpis audytu
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
 * Rozpoznanie mieszka w `uniqueConflict.ts` — od 2026-08-01 ma DRUGIEGO konsumenta
 * (rejestracja samolotu, `commands/fleet.ts`), a cała trudność tej funkcji siedzi
 * w jednej linii regexa, której nie wolno mieć w dwóch kopiach. Tutaj zostaje samo
 * PIERWSZEŃSTWO pól przy komunikacie wskazującym oba naraz — kolejność zachowana
 * dokładnie taka, jaka była przed wydzieleniem.
 */
export function uniqueConflictField(err: unknown): 'code' | 'email' | null {
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
    private readonly hasher: PasswordHasher,
    /**
     * Identyfikator konta i hasło startowe jako FUNKCJE w konstruktorze, nie porty:
     * nie ma tu adaptera do podmiany (composition root podaje `randomUUID`
     * i `generateStartPassword`), a port bez drugiej implementacji to koszt bez zysku
     * — ta sama decyzja, co przy `newId` w `commands/corrections.ts`.
     *
     * `id` NIE jest kodem pilota i to jest reguła produktu, nie szczegół: zdarzenia
     * wiążą się z `id`, więc zmiana kodu nie przepisuje historii (mockup A06: „Kod
     * pilota jest etykietą, nie kluczem"). Gdyby `id = code`, każda zmiana kodu
     * odrywałaby konto od jego nalotu.
     */
    private readonly newId: () => string,
    private readonly newPassword: () => string,
    /**
     * Zegar potrzebny WYŁĄCZNIE po to, żeby ostemplować unieważnienie poświadczeń
     * (`credentials_valid_from`). Nie bierzemy `now()` z SQL-a, bo wtedy w testach
     * znacznik szedłby z zegara systemowego, a `iat` tokenu ze sterowanego zegara —
     * i porównanie tych dwóch odpowiadałoby na pytanie o dwa różne czasy.
     */
    private readonly clock: Clock,
  ) {}

  async create(actor: Actor, input: CreatePilotInput): Promise<PilotOutcome<PilotSecret>> {
    // Hasło i hash POWSTAJĄ PRZED transakcją: scrypt kosztuje ~100 ms, a trzymanie
    // przez ten czas otwartej transakcji blokowałoby wiersze bez powodu. Hash hasła,
    // które nie doczekało konta (rollback), jest wartością bez konsekwencji.
    const password = this.newPassword();
    const passwordHash = await this.hasher.hash(password);
    const id = this.newId();

    try {
      const account = await this.write.run(actor, async (tx) => {
        const clash = await this.pilots.conflict(tx, {
          code: input.code,
          email: input.email,
          exceptId: null,
        });
        if (clash != null) throw new Conflict(clash);

        const created: AdminPilotAccount = { id, ...input, active: true };
        await this.pilots.insert(tx, { ...created, passwordHash });

        return {
          result: created,
          audit: {
            action: 'pilot.create',
            targetType: 'pilot',
            targetId: id,
            // `passwordIssued: true` zamiast hasła i zamiast hasha. Wpis odpowiada na
            // pytanie „czy to konto dostało poświadczenie i od kogo", a nie „jakie".
            details: {
              code: created.code,
              name: created.name,
              email: created.email,
              role: created.role,
              passwordIssued: true,
            },
          },
        };
      });

      return { ok: true, result: { account, password, revokedSessions: 0 } };
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
        const before = await this.pilots.byId(tx, id);
        if (before == null) throw new PilotNotFound();

        const changes = diffOf(before, input);
        // Zapis bez zmiany zostawiłby w dzienniku wpis o niczym. Dziennik nadzoru,
        // w którym połowa wierszy to „otwarto i zamknięto formularz", przestaje być
        // czytelny — a panel i tak blokuje przycisk, gdy nic nie ruszono.
        if (Object.keys(changes).length === 0) throw new NoChanges();

        if (input.role !== undefined) {
          // Blokada PRZED odczytem licznika i w TEJ SAMEJ transakcji — inaczej nie
          // szereguje niczego. `SELECT COUNT(*)` w READ COMMITTED nie blokuje, a dwie
          // transakcje odbierające rolę DWÓM RÓŻNYM administratorom piszą do różnych
          // wierszy, więc bez tej blokady nic ich nie serializuje: obie widzą „jest
          // dwóch", obie commitują i zostaje ZERO administratorów. Z blokadą druga
          // transakcja liczy dopiero po pierwszej, widzi jednego i odbija się
          // o `last_admin` — czyli gałąź, która dopiero tu staje się osiągalna.
          await this.pilots.lockAdminPopulation(tx);

          const refusal = refuseRoleChange({
            actorPilotId: actor.pilotId,
            targetPilotId: id,
            currentRole: before.role,
            nextRole: input.role,
            targetActive: before.active,
            activeAdmins: await this.pilots.countActiveAdmins(tx),
          });
          if (refusal != null) throw new Refused(refusal);
        }

        if (input.code !== undefined || input.email !== undefined) {
          const clash = await this.pilots.conflict(tx, {
            code: input.code ?? before.code,
            email: input.email === undefined ? before.email : input.email,
            exceptId: id,
          });
          if (clash != null) throw new Conflict(clash);
        }

        await this.pilots.update(tx, id, input);
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
   * Deaktywacja i aktywacja jedną komendą, bo to jest jedna decyzja („czy to konto ma
   * dostęp"), tylko w dwie strony. Rozjeżdżają się w DWÓCH miejscach i oba są istotne:
   *
   *  • **deaktywacja zrywa sesje**, aktywacja nie ma czego zrywać;
   *  • **akcja w audycie** jest inna. `pilot.deactivate` istnieje w katalogu
   *    (`domain/adminActions.ts`), `pilot.activate` — NIE, i to jest świadoma treść
   *    tego katalogu, a nie luka: przywrócenie dostępu jest zmianą pola `active`,
   *    czyli zwykłą aktualizacją konta. Odebranie dostępu ma własny kod, bo jest
   *    zdarzeniem, którego szuka się w dzienniku po nazwie.
   */
  async setActive(actor: Actor, id: string, active: boolean): Promise<PilotOutcome<PilotChange>> {
    try {
      const result = await this.write.run(actor, async (tx) => {
        // Blokada PRZED odczytem stanu konta, a nie dopiero przed licznikiem:
        // aktywacja też zmienia populację administratorów (przywraca administratora),
        // więc obie strony tej operacji muszą stać w tej samej kolejce co zmiana roli.
        // Klucz jest stały, więc kolejka jest jedna dla wszystkich trzech ścieżek.
        await this.pilots.lockAdminPopulation(tx);

        const before = await this.pilots.byId(tx, id);
        if (before == null) throw new PilotNotFound();
        if (before.active === active) throw new NoChanges();

        if (!active) {
          const refusal = refuseDeactivate({
            actorPilotId: actor.pilotId,
            targetPilotId: id,
            currentRole: before.role,
            activeAdmins: await this.pilots.countActiveAdmins(tx),
          });
          if (refusal != null) throw new Refused(refusal);
        }

        // `at` stempluje unieważnienie poświadczeń — patrz `PilotsAdminPort.setActive`.
        await this.pilots.setActive(tx, id, active, this.clock.now());
        // Sesje zrywamy TĄ SAMĄ transakcją, co zmianę `active`. Rozdzielenie
        // zostawiałoby okno, w którym konto jest już wyłączone, a token jeszcze
        // działa — czyli dokładnie stan, którego ta operacja ma nie dopuścić.
        const revokedSessions = active ? 0 : await this.sessions.revokeAllFor(tx, id);

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
   * Reset hasła: nowa wartość, hash w bazie, WSZYSTKIE sesje pilota unieważnione.
   *
   * Zerwanie sesji nie jest tu ostrożnością, tylko treścią operacji: sesja, która
   * przeżywa zmianę poświadczeń, znaczy, że reset niczego nie odebrał temu, kto miał
   * dostęp poprzednim hasłem. Skutek dla pilota opisuje mockup A06a: potrzebuje
   * PEŁNEGO logowania przy sieci i ustawia PIN od nowa.
   *
   * `revokedSessions` liczy WYŁĄCZNIE refresh tokeny telefonu — sesji panelu nikt nie
   * zliczał i zliczyć nie może, bo nie ma jej w bazie. Odbiera ją znacznik
   * `credentials_valid_from`, a nie ta liczba; komunikat na ekranie musi więc mówić
   * o obu rodzajach osobno i pozostać prawdziwy także przy `revokedSessions === 0`.
   */
  async resetPassword(actor: Actor, id: string): Promise<PilotOutcome<PilotSecret>> {
    const password = this.newPassword();
    const passwordHash = await this.hasher.hash(password);

    try {
      const result = await this.write.run(actor, async (tx) => {
        const account = await this.pilots.byId(tx, id);
        if (account == null) throw new PilotNotFound();

        const refusal = refusePasswordReset(account.active);
        if (refusal != null) throw new Refused(refusal);

        await this.pilots.setPasswordHash(tx, id, passwordHash, this.clock.now());
        const revokedSessions = await this.sessions.revokeAllFor(tx, id);

        return {
          result: { account, revokedSessions },
          audit: {
            action: 'pilot.password_reset',
            targetType: 'pilot',
            targetId: id,
            // Ani hasła, ani hasha, ani nawet jego długości. Sam fakt, komu i ile
            // sesji przy okazji zerwano — mockup A06a mówi to wprost przy banerze
            // „Hasło widzisz wyłącznie teraz".
            details: { code: account.code, passwordIssued: true, revokedSessions },
          },
        };
      });

      return { ok: true, result: { ...result, password } };
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
    // zapisem — 409 z nazwą pola. Bez tego dwa równoległe `POST /pilots` z tym samym
    // kodem kończyły się 500, czyli komunikatem „coś się zepsuło" na zdarzenie, które
    // ma gotowe wyjaśnienie i gotowy formularz do poprawienia.
    const field = uniqueConflictField(err);
    if (field != null) return { ok: false, reason: 'conflict', field };

    throw err;
  }
}

/**
 * Co naprawdę się zmienia — pola o wartości identycznej z obecną wypadają.
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

/** `{code: undefined}` nadpisałoby wartość w rozwinięciu obiektu — stąd ten filtr. */
function stripUndefined(input: UpdatePilotInput): Partial<AdminPilotAccount> {
  const out: Partial<AdminPilotAccount> = {};
  if (input.code !== undefined) out.code = input.code;
  if (input.name !== undefined) out.name = input.name;
  if (input.email !== undefined) out.email = input.email;
  if (input.role !== undefined) out.role = input.role;
  return out;
}
