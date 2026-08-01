/**
 * UZ Aero (serwer) — konfiguracja floty: dodanie jednostki, edycja, wyłączenie ze
 * służby (panel, mockupy `A07-flota.html` i `A07a-samolot.html`).
 *
 * ══ CO TA KOMENDA NAPRAWDĘ ZMIENIA ══
 * Flota jest jedynym miejscem, w którym administrator przestawia WEJŚCIA REGUŁ.
 * Pojemność zbiorników wyznacza tolerancję flagi `FUEL_MISMATCH` (`max(10 L, 5%)`),
 * format motogodzin zmienia sposób wpisywania na preflight, wymóg drugiego pilota
 * bramkuje przejęcie samolotu, a stan służby decyduje, czy jednostkę da się w ogóle
 * wybrać. Dlatego diff w dzienniku audytu niesie tu nie tylko „z czego na co", ale
 * i PRÓG, który z tej zmiany wynikł — bez tego wpis „1257 → 1100" nie odpowiada na
 * pytanie, po co ta zmiana zaszła.
 *
 * ══ CZEGO TA KOMENDA NIE ROBI I NIE BĘDZIE ROBIŁA ══
 *
 *  1. **Nie przepisuje rejestru.** Zdarzenia zapisane wcześniej zostają dokładnie takie,
 *     jakie przyszły z telefonu, a flagi wystawione przed zmianą zachowują STARY próg
 *     w `details`. Nie ma tu i nie może być pętli po `flags` ani po `events`.
 *
 *     **Ale to NIE znaczy „zmiana nie działa wstecz" — i tak było to opisane do
 *     2026-08-01.** Detekcja flag łańcucha nie mieszka w tym pliku: przeliczenie
 *     zachodzi w `application/mobile/commands/ingest.ts`, które po KAŻDEJ przyjętej
 *     paczce `POST /events` woła `chainFlags` na CAŁEJ historii sesji samolotu
 *     (`sessions.listByAircraft`) z pojemnością BIEŻĄCĄ (`aircraft.capacityL`), a
 *     `domain/mhChain.ts` liczy próg raz dla wszystkich par. Skutek: po obniżeniu
 *     pojemności najbliższa synchronizacja tej jednostki potrafi wystawić NOWĄ flagę
 *     na parze dni zamkniętych PRZED zmianą. Asymetrycznie — podniesienie pojemności
 *     niczego nie zdejmuje, bo `ensureOpen` tylko dokłada.
 *
 *     Zmiana momentu powstawania flag jest decyzją produktową wymagającą ścieżki
 *     kalibracyjnej (`CLAUDE.md`: progów nie stroimy „na wyczucie"), więc zachowanie
 *     zostaje, a prostujemy OBIETNICĘ — w `A07a`, w szufladzie panelu i w teście
 *     (`test/adminFleet.test.ts`, „najbliższy POST /events flaguje parę starych dni").
 *  2. **Nie kasuje jednostek.** Wyłączenie ze służby zabiera samolot z listy wyboru
 *     na przyszłość; sesje historyczne, karty arkusza, flagi i łańcuch motogodzin
 *     zostają nietknięte. W tym pliku nie ma `DELETE` na `aircraft`.
 *  3. **Nie dotyka claimu ani odczytów liczników.** To są wielkości wyliczane ze
 *     strumienia zdarzeń — port konfiguracji ich nie zna (`AdminAircraft` jest osobnym
 *     typem od `ReferenceAircraft` właśnie po to).
 *
 * ══ JAK ZMIANA DOCIERA DO TELEFONÓW ══
 * Jedynym kanałem jest `GET /reference`: zapis podbija `aircraft.updated_at`, a z niego
 * powstaje ETag zasobu (`application/mobile/queries/reference.ts`). Aplikacja odpytuje
 * przy starcie dnia, więc samolot z otwartą sesją dokończy dzień na konfiguracji, którą
 * pobrał rano. Adapter MUSI stemplować `updated_at` przy każdym zapisie — inaczej
 * zmiana zostaje w panelu i nikt jej nie zobaczy (pilnuje `test/adminFleet.test.ts`).
 *
 * Konstruktor bez `Database`/`Queryable` — komenda nie ma jak zapisać z pominięciem
 * śladu audytu, bo nie ma uchwytu do bazy (`auditedWrite.ts`, `test/architecture.test.ts`).
 */

import { fuelToleranceL, type MhFormat, type ServiceStatus } from '@uzaero/domain';

import { refuseCapacity, refuseDisable, type FleetRefusal } from '../../../domain/fleetGuards.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor, AdminAircraft, AircraftPatch, FleetAdminPort } from '../ports.ts';
import { uniqueConflictOn } from './uniqueConflict.ts';

export interface CreateAircraftInput {
  reg: string;
  type: string;
  year: number | null;
  capacityL: number;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
}

/** Zmiana konfiguracji. Pola nieustawione zostają bez zmian (`PATCH` opisuje RÓŻNICĘ). */
export type UpdateAircraftInput = AircraftPatch;

/**
 * Uproszczony CQRS repo: komenda zwraca WYNIK, a odmowa jest jego wariantem, nie
 * wyjątkiem na granicy HTTP (wzorzec `PilotOutcome`, `ResolveFlagOutcome`). Trasa mapuje
 * wariant na status i niczego nie interpretuje.
 */
export type FleetOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'no_changes' }
  | { ok: false; reason: 'conflict'; field: 'reg' }
  | { ok: false; reason: 'refused'; refusal: FleetRefusal };

/**
 * Sygnały przerwania transakcji. Muszą być WYJĄTKAMI, bo tylko wyjątek wycofuje
 * transakcję `AuditedWrite.run` — zwrócenie wartości zostawiłoby wpis audytu
 * o operacji, która się nie zdarzyła. Poza ten plik nie wychodzą.
 */
class AircraftNotFound extends Error {}

class NoChanges extends Error {}

class Conflict extends Error {
  constructor() {
    super('rejestracja jest już zajęta');
  }
}

class Refused extends Error {
  constructor(readonly refusal: FleetRefusal) {
    super(`odmowa: ${refusal}`);
  }
}

/** Jedna zmiana pola w dzienniku audytu: „z czego na co". */
interface FieldDiff {
  from: unknown;
  to: unknown;
}

/** Pola konfiguracji, które w ogóle podlegają zmianie — jedna lista dla diffa i patcha. */
const FIELDS = [
  'reg',
  'type',
  'year',
  'capacityL',
  'mhFormat',
  'dualRequired',
  'serviceStatus',
] as const;

export class AdminFleetCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly fleet: FleetAdminPort,
    /**
     * Identyfikator jednostki jako FUNKCJA w konstruktorze, nie port — nie ma tu
     * adaptera do podmiany (composition root podaje `randomUUID`), a port bez drugiej
     * implementacji to koszt bez zysku (ta sama decyzja, co przy `newId` w komendzie
     * kont i korekt).
     *
     * `id` NIE jest rejestracją i to jest reguła produktu, nie szczegół. Zdarzenia
     * wiążą się z `aircraft_id`, więc gdyby `id = reg`, przemalowanie znaków na
     * kadłubie odrywałoby samolot od całego jego nalotu, flag i kart arkusza — dokładnie
     * ta pułapka, którą przy kontach zamyka rozdział `id` od kodu pilota. Jednostki
     * z seeda mają `id = reg` historycznie i zostają takie, jakie są; migracji tego nie
     * robimy, bo przepisanie klucza obcego w rejestrze append-only jest gorsze od
     * niespójności w nazewnictwie.
     */
    private readonly newId: () => string,
  ) {}

  async create(actor: Actor, input: CreateAircraftInput): Promise<FleetOutcome<AdminAircraft>> {
    const id = this.newId();

    try {
      const aircraft = await this.write.run(actor, async (tx) => {
        const capacity = refuseCapacity(input.capacityL);
        if (capacity != null) throw new Refused(capacity);

        const clash = await this.fleet.conflict(tx, { reg: input.reg, exceptId: null });
        if (clash != null) throw new Conflict();

        const created: AdminAircraft = { id, ...input };
        await this.fleet.insert(tx, created);

        return {
          result: created,
          audit: {
            action: 'aircraft.create',
            targetType: 'aircraft',
            targetId: id,
            details: {
              reg: created.reg,
              type: created.type,
              year: created.year,
              capacityL: created.capacityL,
              mhFormat: created.mhFormat,
              dualRequired: created.dualRequired,
              serviceStatus: created.serviceStatus,
              // Próg WYNIKAJĄCY z pojemności, a nie druga jej kopia: dziennik ma
              // odpowiadać na pytanie „od ilu litrów ta jednostka zaczyna być flagowana",
              // a nikt nie liczy tego w pamięci przy czytaniu wpisu.
              fuelToleranceL: fuelToleranceL(created.capacityL),
            },
          },
        };
      });

      return { ok: true, result: aircraft };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdateAircraftInput,
  ): Promise<FleetOutcome<AdminAircraft>> {
    try {
      const aircraft = await this.write.run(actor, async (tx) => {
        // Blokada PRZED odczytem wiersza i w TEJ SAMEJ transakcji. Bez niej dwie
        // równoległe zmiany tego samego samolotu czytają ten sam stan wyjściowy, więc
        // w dzienniku audytu zostają DWA wpisy o przejściu „1257 → 1100" — mimo że
        // druga transakcja zaczynała już od 1100. Diff, którego „przed" bywa nieprawdą,
        // przestaje być dowodem. Ta sama rola, co `lockAdminPopulation` przy kontach.
        await this.fleet.lockAircraft(tx, id);

        const before = await this.fleet.byId(tx, id);
        if (before == null) throw new AircraftNotFound();

        const changes = diffOf(before, input);
        // Zapis bez zmiany zostawiłby w dzienniku wpis o niczym — a dziennik nadzoru,
        // w którym połowa wierszy to „otwarto i zamknięto formularz", przestaje być
        // czytelny. Panel i tak blokuje przycisk, gdy nic nie ruszono.
        if (Object.keys(changes).length === 0) throw new NoChanges();

        const capacity = refuseCapacity(input.capacityL ?? null);
        if (capacity != null) throw new Refused(capacity);

        if (input.serviceStatus !== undefined && input.serviceStatus !== before.serviceStatus) {
          // Licznik czytany PO wzięciu blokady — tak jak przy populacji administratorów.
          // Czego ta blokada NIE obejmuje, opisuje `FleetAdminPort.lockAircraft`:
          // telefon otwierający dzień blokuje sesję, nie samolot.
          const refusal = refuseDisable({
            nextStatus: input.serviceStatus,
            openSessions: await this.fleet.openSessions(tx, id),
          });
          if (refusal != null) throw new Refused(refusal);
        }

        if (input.reg !== undefined) {
          const clash = await this.fleet.conflict(tx, { reg: input.reg, exceptId: id });
          if (clash != null) throw new Conflict();
        }

        await this.fleet.update(tx, id, input);
        const after: AdminAircraft = { ...before, ...stripUndefined(input) };

        return {
          result: after,
          audit: {
            action: auditAction(before.serviceStatus, after.serviceStatus),
            targetType: 'aircraft',
            targetId: id,
            details: {
              reg: before.reg,
              // Diff, a nie stan po zmianie: stan bieżący widać na liście, a dziennik
              // ma odpowiadać na pytanie „co się zmieniło". Pole niezmienione w ogóle
              // się tu nie pojawia.
              changes,
              // Skutek zmiany pojemności wypisany wprost — dokładnie ta liczba, którą
              // panel pokazał w karcie „Skutki zmiany" przed zapisem. Wpis bez niej
              // kazałby czytającemu liczyć 5% w pamięci.
              ...(input.capacityL === undefined || input.capacityL === before.capacityL
                ? {}
                : {
                    fuelToleranceL: {
                      from: fuelToleranceL(before.capacityL),
                      to: fuelToleranceL(after.capacityL),
                    },
                  }),
            },
          },
        };
      });

      return { ok: true, result: aircraft };
    } catch (err) {
      return this.asOutcome(err);
    }
  }

  /** Wyjątek przerwania transakcji → wariant wyniku. Nieznany błąd leci dalej. */
  private asOutcome<T>(err: unknown): FleetOutcome<T> {
    if (err instanceof AircraftNotFound) return { ok: false, reason: 'not_found' };
    if (err instanceof NoChanges) return { ok: false, reason: 'no_changes' };
    if (err instanceof Conflict) return { ok: false, reason: 'conflict', field: 'reg' };
    if (err instanceof Refused) return { ok: false, reason: 'refused', refusal: err.refusal };

    // Przegrany wyścig o unikalność to TA SAMA odpowiedź, co sprawdzenie przed zapisem
    // — 409 z nazwą pola. Bez tego dwa równoległe `POST /fleet` z tą samą rejestracją
    // kończyłyby się 500, czyli „coś się zepsuło" na zdarzenie, które ma gotowe
    // wyjaśnienie i gotowy formularz do poprawienia.
    if (uniqueConflictOn(err, ['reg'] as const) != null) {
      return { ok: false, reason: 'conflict', field: 'reg' };
    }

    throw err;
  }
}

/**
 * Kod akcji w dzienniku. `aircraft.disable` istnieje w katalogu
 * (`domain/adminActions.ts`), a `aircraft.enable` — NIE, i to jest świadoma treść tego
 * katalogu, a nie luka: przywrócenie do służby jest zwykłą zmianą pola, a odebranie
 * jednostki z listy wyboru jest zdarzeniem, którego szuka się w dzienniku po nazwie.
 * Ta sama zasada, co przy `pilot.deactivate` i braku `pilot.activate`.
 */
function auditAction(before: ServiceStatus, after: ServiceStatus): 'aircraft.update' | 'aircraft.disable' {
  return before !== 'disabled' && after === 'disabled' ? 'aircraft.disable' : 'aircraft.update';
}

/**
 * Co naprawdę się zmienia — pola o wartości identycznej z obecną wypadają.
 *
 * Bez tego „Zapisz zmiany" bez zmiany pola dopisywałby do dziennika wiersz mówiący,
 * że rejestracja zmieniła się z `SP-KLM` na `SP-KLM`. Diff jest jedyną treścią wpisu,
 * więc jego pustka jest sygnałem, że operacji nie ma po co wykonywać (`NoChanges`).
 */
function diffOf(before: AdminAircraft, input: UpdateAircraftInput): Record<string, FieldDiff> {
  const changes: Record<string, FieldDiff> = {};
  for (const key of FIELDS) {
    const next = input[key];
    if (next === undefined) continue;
    if (next === before[key]) continue;
    changes[key] = { from: before[key], to: next };
  }
  return changes;
}

/** `{reg: undefined}` nadpisałoby wartość w rozwinięciu obiektu — stąd ten filtr. */
function stripUndefined(input: UpdateAircraftInput): Partial<AdminAircraft> {
  const out: Record<string, unknown> = {};
  for (const key of FIELDS) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out as Partial<AdminAircraft>;
}
