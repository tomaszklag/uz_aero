/**
 * UZ Aero (serwer) — strona ODCZYTU dni lotnych panelu (`A02`, `A02a`).
 *
 * **Reguła twarda, której pilnuje `test/contract.test.ts`:** listy NIE wołają
 * `projectSession`. Czytają wyłącznie kolumny projekcji `sessions` — bo wczytanie
 * pełnego strumienia dla każdego z 500 wierszy strony to jedyna rzecz, która mogłaby
 * tu być naprawdę wolna, a policzenie liczb „po swojemu" SQL-em to jedyna rzecz, która
 * mogłaby tu naprawdę skłamać (`docs/architektura-panelu-serwer.md` §7.1).
 *
 * Karta jednego dnia woła `projectSession` RAZ, na jednym strumieniu (dziesiątki
 * zdarzeń), i oddaje `SessionState` w całości. Dzięki temu panel formatuje liczby
 * policzone TYM SAMYM kodem, co telefon — i nie może pokazać innego czasu blokowego
 * niż ekran 10.
 */

import { projectSession } from '@uzaero/domain';

import type { Database, EventsStorePort } from '../../common/ports.ts';
import type { AdminSessionDetail, AdminSessionPage } from '../contracts/sessions.ts';
import { eventTimeline } from '../mappers/eventTimeline.ts';
import { flagListItem } from '../mappers/flagListItem.ts';
import type {
  EventsAdminPort,
  FlagsAdminPort,
  SessionListFilter,
  SessionsAdminPort,
} from '../ports.ts';
import { sessionListItem } from '../mappers/sessionListItem.ts';

/**
 * Odmowa jest wariantem wyniku, nie wyjątkiem na granicy HTTP (wzorzec
 * `ResolveFlagOutcome`). Nieczytelny kursor przychodzi z zewnątrz — to 400, nie 500.
 */
export type SessionListOutcome =
  | { ok: true; page: AdminSessionPage }
  | { ok: false; reason: 'bad_cursor' };

/**
 * Ile flag pokazujemy przy jednym dniu. Sesja ma ich realnie 0–3 (nakładka, dziura MH,
 * rozjazd zegara); limit istnieje po to, żeby patologiczne dane nie zamieniły karty dnia
 * w listę tysiąca wierszy, a nie po to, żeby cokolwiek stronicować.
 */
const FLAGS_PER_DAY = 100;

export class AdminSessionQueries {
  constructor(
    private readonly db: Database,
    private readonly sessions: SessionsAdminPort,
    private readonly events: EventsStorePort,
    private readonly flags: FlagsAdminPort,
    /**
     * Metadane rejestru, których `Event` nie niesie. Karta dnia potrzebuje dokładnie
     * jednej: czy korektę dopisał panel, czy telefon pilota — bo tylko po tej pierwszej
     * zostaje wiersz w `admin_audit`, a więc tylko przy niej link „ślad w audycie"
     * ma co pokazać.
     */
    private readonly eventsMeta: EventsAdminPort,
  ) {}

  async list(filter: SessionListFilter): Promise<SessionListOutcome> {
    const result = await this.sessions.list(this.db, filter);
    if (result == null) return { ok: false, reason: 'bad_cursor' };

    return {
      ok: true,
      page: {
        items: result.items.map(sessionListItem),
        nextCursor: result.nextCursor,
        total: result.total,
      },
    };
  }

  /** `null` = nie ma takiej sesji w projekcji (czyli i w rejestrze) → 404. */
  async detail(sessionUuid: string): Promise<AdminSessionDetail | null> {
    const join = await this.sessions.byUuid(this.db, sessionUuid);
    if (join == null) return null;

    const stream = await this.events.sessionEvents(this.db, sessionUuid);
    // Flagi TEJ sesji razem z rozwiązanymi: karta dnia ma pokazywać także decyzje już
    // podjęte, inaczej historia rozstrzygnięć znika dokładnie tam, gdzie jest potrzebna.
    const { items } = await this.flags.list(this.db, { sessionUuid, limit: FLAGS_PER_DAY });
    const byAdmin = await this.eventsMeta.adminCorrectionUuids(this.db, sessionUuid);

    return {
      session: sessionListItem(join),
      // JEDYNE wywołanie `projectSession` na żądanie w całym panelu.
      state: projectSession(stream),
      timeline: eventTimeline(stream, new Set(byAdmin)),
      flags: items.map(flagListItem),
    };
  }
}
