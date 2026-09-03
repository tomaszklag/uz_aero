/**
 * UZ Aero (serwer) - ODCZYTY MASZYNY WPISANE RĘKĄ ADMINISTRATORA (issue #81, 2026-09-03:
 * „jako admin przez panel powinienem móc modyfikować odczyty, które będą nadrzędne,
 * czyli motogodziny, ilość paliwa oraz ilość oleju […] powinna to być oddzielna akcja
 * i powinna mieć możliwość dopisania komentarza").
 *
 * ══ OSOBNA AKCJA, NIE PATCH KONFIGURACJI ══
 * `PATCH /fleet/:id` opisuje MASZYNĘ (pojemności, normy, format licznika) - liczby
 * prawdziwe tak długo, jak długo silnik jest ten sam. Odczyt opisuje JEDNĄ CHWILĘ i jest
 * decyzją: „od teraz przyjmujemy, że przyrządy pokazują tyle". Zlanie tych dwóch rzeczy
 * w jeden formularz było już raz pomyłką kategorii (issue #66, §10.1). Stąd własna
 * komenda, własny wpis audytu (`aircraft.reading`) i własna, APPEND-ONLY tabela: każdy
 * wpis zostaje z autorem, chwilą i komentarzem - jak korekta w rejestrze niesie powód.
 *
 * ══ CO ROBI Z ŁAŃCUCHEM ══
 * Wpis wchodzi do wyboru przekazania (`aircraftStateView.pickHandover`) jako konkurent
 * ostatniego zdania: wygrywa ten, kto stoi dalej w łańcuchu MH. Dlatego licznik jest
 * WYMAGANY - bez niego wpis nie ma miejsca w łańcuchu - a kolejne zdanie z wyższym
 * licznikiem wypiera go samo. Olej opcjonalny: bez niego kotwica oleju zostaje przy
 * rejestrze. Telefony dostają skutek przez `GET /reference` (ETag się zmienia).
 *
 * ══ CZEGO NIE DOTYKA ══
 * Rejestru zdarzeń (żadna operacja nie dostaje odczytu, którego nikt nie zmierzył),
 * flag łańcucha (wystawia je ingest na parach sesji) i analityki zużycia (liczy się
 * z interwałów odczyt→odczyt WEWNĄTRZ operacji). Sąsiadów wpisu ręcznego
 * (`readings-chain`) też nie - to świadoma granica pierwszej wersji.
 */

import { refuseInitialState, type FleetRefusal } from '../../../domain/fleetGuards.ts';
import type { AdminReading, AircraftReadingsPort, Clock } from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor, FleetAdminPort } from '../ports.ts';

export interface RecordReadingInput {
  aircraftId: string;
  mh: number;
  fuelL: number;
  oilL: number | null;
  /** Komentarz - WYMAGANY (trasa odrzuca puste): nadpisuje się cudze odczyty. */
  note: string;
}

export type RecordReadingOutcome =
  | { ok: true; result: AdminReading }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'refused'; refusal: FleetRefusal };

class AircraftNotFound extends Error {}

class Refused extends Error {
  constructor(readonly refusal: FleetRefusal) {
    super(`odmowa: ${refusal}`);
  }
}

export class AdminAircraftReadingCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly fleet: FleetAdminPort,
    private readonly readings: AircraftReadingsPort,
    private readonly clock: Clock,
  ) {}

  async record(actor: Actor, input: RecordReadingInput): Promise<RecordReadingOutcome> {
    const at = this.clock.now();

    try {
      const reading = await this.write.run(actor, async (tx) => {
        // Blokada konfiguracji jednostki: sufity liczą się na pojemnościach, które ktoś
        // mógł właśnie zmieniać w drugim oknie (ta sama tarcza, co przy `PATCH`).
        await this.fleet.lockAircraft(tx, input.aircraftId);
        const aircraft = await this.fleet.byId(tx, input.aircraftId);
        if (aircraft == null) throw new AircraftNotFound();

        // TE SAME reguły, co dla stanu początkowego (issue #66): zero jest wartością,
        // minus i nieskończoność - literówką, a paliwo i olej mają sufit w zbiornikach.
        const refusal = refuseInitialState({
          initialMh: input.mh,
          initialFuelL: input.fuelL,
          initialOilL: input.oilL,
          capacityL: aircraft.capacityL,
          oilCapacityL: aircraft.oilCapacityL,
        });
        if (refusal != null) throw new Refused(refusal);

        const recorded: AdminReading = {
          mh: input.mh,
          fuelL: input.fuelL,
          oilL: input.oilL,
          note: input.note,
          byPilotId: actor.pilotId,
          at: at.getTime(),
        };
        await this.readings.insert(tx, input.aircraftId, recorded);

        return {
          result: recorded,
          audit: {
            action: 'aircraft.reading',
            targetType: 'aircraft',
            targetId: input.aircraftId,
            details: {
              reg: aircraft.reg,
              mh: recorded.mh,
              fuelL: recorded.fuelL,
              oilL: recorded.oilL,
              note: recorded.note,
            },
          },
        };
      });
      return { ok: true, result: reading };
    } catch (err) {
      if (err instanceof AircraftNotFound) return { ok: false, reason: 'not_found' };
      if (err instanceof Refused) return { ok: false, reason: 'refused', refusal: err.refusal };
      throw err;
    }
  }
}
