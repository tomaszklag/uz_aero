/**
 * UZ Aero (serwer) - flota panelu (`A07`) i DANE REFERENCYJNE dla filtrów.
 *
 * Ta trasa ma dwóch odbiorców, dokładnie jak lista kont. Pierwszy: ekran floty, który
 * potrzebuje konfiguracji, progu flagi i stanu bieżącego z telefonów. Drugi: filtry
 * innych list panelu - `A02` do 2026-08-01 nie miało czym wypełnić chipów samolotów,
 * mimo że `SessionListFilter.aircraftId` czekał gotowy. Dlatego lista jest kompletna
 * i bez kursora: klub ma kilka jednostek, a lista, którą trzeba stronicować, nie nadaje
 * się na słownik do filtra.
 *
 * ══ DWA ŹRÓDŁA W JEDNYM WIERSZU ══
 * Konfiguracja (`aircraft`) i stan bieżący (claim, ostatni odczyt, ostatni sync) to
 * dwa różne rodzaje wiedzy i ekran ma je rozróżniać. Pierwsza zmienia się wyłącznie
 * w panelu; drugą przynoszą telefony ze zdarzeniami i bywa nieświeża. Serwer podaje
 * OBIE razem z `lastEventAt`, żeby panel miał czym oznaczyć wiek - a nie zgadywał go
 * z czasu odpowiedzi.
 *
 * Zdolność jest ROZSZCZEPIONA i to decyzja produktowa z mockupu A07: listę CZYTA każdy,
 * kto ma wejście do panelu (szef wyszkolenia potrzebuje jej do flag i statystyk),
 * a zmienia wyłącznie `fleet.manage`. Egzekwuje to trasa, nie ta klasa.
 */

import { fuelToleranceL } from '@uzaero/domain';

import { activeClaim, pickHandover } from '../../common/aircraftStateView.ts';
import type {
  AdminReading,
  AircraftReadingsPort,
  Database,
  SessionsProjectionPort,
} from '../../common/ports.ts';
import type {
  AdminAircraftListItem,
  AdminFleetPage,
  AircraftToleranceDto,
} from '../contracts/fleet.ts';
import {
  aircraftListItem,
  fleetCounts,
  type PilotLabel,
} from '../mappers/aircraftListItem.ts';
import type { AdminAircraftJoin, FleetListFilter, FleetAdminPort, PilotsAdminPort } from '../ports.ts';

export class AdminFleetQueries {
  constructor(
    private readonly db: Database,
    private readonly fleet: FleetAdminPort,
    /**
     * Projekcja sesji, a nie własne zapytanie o claim: wybór claimu i przekazania
     * jest REGUŁĄ (`application/common/aircraftStateView.ts`), tą samą, którą liczy
     * `GET /reference` dla telefonu. Drugie wyliczenie w SQL-u panelu skończyłoby się
     * dwiema odpowiedziami na pytanie „kto trzyma ten samolot".
     */
    private readonly sessions: SessionsProjectionPort,
    /** Nazwiska do claimu i odczytu - po `byId`, bo dotyczy najwyżej kilku kont. */
    private readonly pilots: PilotsAdminPort,
    /** Odczyty wpisane ręką administratora (issue #81) - konkurent zdania w przekazaniu. */
    private readonly readings: AircraftReadingsPort,
  ) {}

  async list(filter: FleetListFilter): Promise<AdminFleetPage> {
    // Trzy zapytania, trzy różne pytania - i dlatego nie da się ich skleić: wiersze
    // w bieżącym zawężeniu, liczby o CAŁEJ FLOCIE (kafle) i liczby o WYSZUKIWANIU
    // (chipy). Ta sama konstrukcja, co przy liście kont.
    const [joins, counts, scopes] = await Promise.all([
      this.fleet.list(this.db, filter),
      this.fleet.counts(this.db),
      this.fleet.scopeCounts(
        this.db,
        filter.search === undefined ? {} : { search: filter.search },
      ),
    ]);

    return {
      items: await this.withState(joins),
      counts: fleetCounts(counts),
      scopes: fleetCounts(scopes),
    };
  }

  /**
   * Pojedynczy wiersz listy - odpowiedź MUTACJI.
   *
   * Ponowny odczyt zamiast złożenia wiersza z wejścia komendy: trasa kont robi to
   * drugie i płaci za to `flyingDays: 0` w odpowiedzi (uproszczenie opisane przy
   * `accountToWire`). Tutaj cena byłaby wyższa - wiersz floty niesie próg flagi,
   * liczbę otwartych flag i stan z telefonów, więc zmyślony byłby w połowie.
   * Jedno dodatkowe zapytanie po zapisie jest tańsze niż odpowiedź, której panel
   * nie może pokazać.
   */
  async item(id: string): Promise<AdminAircraftListItem | null> {
    const join = await this.fleet.joinById(this.db, id);
    if (join == null) return null;
    const [item] = await this.withState([join]);
    return item ?? null;
  }

  /**
   * Tolerancja `FUEL_MISMATCH` dla pojemności, która NIE MUSI być w bazie.
   *
   * Dwa wejścia, jedna odpowiedź: `capacityL` (formularz `A07a` - „co się stanie,
   * jeśli wpiszę 1100") albo `aircraftId` (`A02a`/`A02b` - „jaki próg obowiązuje ten
   * dzień", gdzie panel zna samolot, a nie jego pojemność). `null` = nie ma takiego
   * samolotu; to 404, a nie tolerancja z podłogi.
   */
  async tolerance(input: {
    capacityL?: number;
    aircraftId?: string;
  }): Promise<AircraftToleranceDto | null> {
    if (input.aircraftId !== undefined) {
      const aircraft = await this.fleet.byId(this.db, input.aircraftId);
      if (aircraft == null) return null;
      return {
        capacityL: aircraft.capacityL,
        fuelToleranceL: fuelToleranceL(aircraft.capacityL),
      };
    }

    const capacityL = input.capacityL ?? null;
    return { capacityL, fuelToleranceL: fuelToleranceL(capacityL) };
  }

  /**
   * Dokłada do wierszy stan z telefonów. Sesje czytamy per samolot jednym przebiegiem
   * (tak samo jak `ReferenceQueries`), a nazwiska - po `byId` dla kont, które faktycznie
   * się pojawiły. Przy kilku jednostkach i dwóch kontach na jednostkę to kilkanaście
   * zapytań punktowych; złączenie w SQL-u wymagałoby przeniesienia tam reguły wyboru
   * przekazania, czyli dokładnie tego, czego ten plik unika.
   */
  private async withState(joins: readonly AdminAircraftJoin[]): Promise<AdminAircraftListItem[]> {
    const states = new Map<string, ReturnType<typeof stateOf>>();
    const pilotIds = new Set<string>();
    // Odczyty wpisane ręką administratora (issue #81) - całej floty jednym zapytaniem,
    // jak w `ReferenceQueries`: panel i telefon mają dostać TEN SAM wybór przekazania.
    const overrides = await this.readings.latestAll(this.db);

    for (const join of joins) {
      const rows = await this.sessions.listByAircraft(this.db, join.aircraft.id);
      const state = stateOf(rows, join, overrides.get(join.aircraft.id) ?? null);
      states.set(join.aircraft.id, state);
      if (state.claim != null) pilotIds.add(state.claim.picId);
      // `byPilotId === null` znaczy „stan początkowy z panelu" (issue #66) albo odczyt
      // administratora (issue #81) - podpisem tego drugiego jest konto, które go wpisało.
      if (state.handover?.byPilotId != null) pilotIds.add(state.handover.byPilotId);
      if (state.enteredBy != null) pilotIds.add(state.enteredBy);
    }

    const labels = new Map<string, PilotLabel>();
    for (const id of pilotIds) {
      const account = await this.pilots.byId(this.db, id);
      // Konto skasowane albo przepisane zostawia claim z samym identyfikatorem -
      // wiersz floty ma zostać widoczny, a nie zniknąć razem z nazwiskiem.
      if (account != null) labels.set(id, { code: account.code, name: account.name });
    }

    return joins.map((join) => {
      const state = states.get(join.aircraft.id);
      return aircraftListItem(join, {
        claim: state?.claim ?? null,
        handover: state?.handover ?? null,
        readingSource: state?.source ?? null,
        enteredBy: state?.enteredBy ?? null,
        note: state?.note ?? null,
        labels,
      });
    });
  }
}

/**
 * Claim + przekazanie + jego pochodzenie z jednego przebiegu po sesjach samolotu.
 *
 * Stan początkowy (issue #66) bierze się z WIERSZA KONFIGURACJI, który lista i tak
 * ma w ręku - dzięki temu panel i telefon odpowiadają na „jaki jest ostatni znany
 * odczyt" tą samą funkcją, także dla maszyny, która jeszcze nie latała. Odczyt
 * administratora (issue #81) wchodzi tą samą funkcją, jako konkurent zdania.
 */
function stateOf(
  rows: Awaited<ReturnType<SessionsProjectionPort['listByAircraft']>>,
  join: AdminAircraftJoin,
  override: AdminReading | null,
) {
  const claim = activeClaim(rows);
  const pick = pickHandover(
    rows,
    {
      mh: join.aircraft.initialMh,
      fuelL: join.aircraft.initialFuelL,
      oilL: join.aircraft.initialOilL,
      enteredAt: join.updatedAt.getTime(),
    },
    override,
  );
  return {
    claim,
    handover: pick?.handover ?? null,
    source: pick?.source ?? null,
    enteredBy: pick?.enteredBy ?? null,
    note: pick?.note ?? null,
  };
}
