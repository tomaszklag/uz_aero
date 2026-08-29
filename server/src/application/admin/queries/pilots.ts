/**
 * UZ Aero (serwer) - lista kont pilotów (`A06`) i DANE REFERENCYJNE dla filtrów.
 *
 * Ta trasa ma dwóch odbiorców i to jest w niej najważniejsze. Pierwszy: ekran kont,
 * który potrzebuje statusu, roli i liczników. Drugi: filtry innych list panelu -
 * `A02` nie ma dziś filtra po pilocie wyłącznie dlatego, że nie było skąd wziąć listy
 * nazwisk (`SessionListFilter.pilotId` czeka gotowy w porcie). Dlatego lista jest
 * kompletna i bez kursora: klub ma kilkanaście kont, a lista, którą trzeba stronicować,
 * nie nadaje się na słownik do rozwijanego filtra.
 *
 * Zdolność jest tu ROZSZCZEPIONA i to jest decyzja produktowa z mockupu A06: listę
 * CZYTA każdy, kto ma wejście do panelu (szef wyszkolenia potrzebuje jej do statystyk
 * i flag), a zmienia wyłącznie `accounts.manage`. Egzekwuje to trasa, nie ta klasa.
 */

import type { Clock, Database } from '../../common/ports.ts';
import type { AdminPilotPage } from '../contracts/pilots.ts';
import { pilotCounts, pilotListItem, pilotScopeCounts } from '../mappers/pilotListItem.ts';
import type { PilotListFilter, PilotsAdminPort } from '../ports.ts';

/** Filtr ekranu bez okna dni lotnych - okno dokłada ta klasa (patrz `monthOf`). */
export type PilotQuery = Omit<PilotListFilter, 'fromMs' | 'toMs'> & {
  fromMs?: number;
  toMs?: number;
};

/** `YYYY-MM-DD` z epoch ms UTC - do echa okna w odpowiedzi. */
function dayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Bieżący miesiąc UTC jako domyślne okno „dni lotnych".
 *
 * Mockup pisze w nagłówku kolumny konkretny miesiąc („Dni lotne · LIP 2026"), więc
 * okno MUSI być jawne - liczba bez okna nie znaczy nic, a okno wybrane po cichu
 * kazałoby panelowi zgadywać podpis. Odpowiedź niesie `daysFrom`/`daysTo`, żeby
 * nagłówek kolumny opisywał to, co serwer naprawdę policzył.
 */
export function monthOf(now: Date): { fromMs: number; toMs: number } {
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1;
  return { fromMs: from, toMs: to };
}

export class AdminPilotQueries {
  constructor(
    private readonly db: Database,
    private readonly pilots: PilotsAdminPort,
    private readonly clock: Clock,
  ) {}

  async list(query: PilotQuery): Promise<AdminPilotPage> {
    const month = monthOf(this.clock.now());
    const fromMs = query.fromMs ?? month.fromMs;
    const toMs = query.toMs ?? month.toMs;

    // Trzy zapytania, trzy różne pytania - i dlatego nie da się ich skleić: wiersze
    // w bieżącym zawężeniu, liczby o KLUBIE (kafle) i liczby o WYSZUKIWANIU (chipy).
    // Chip z liczbą jest obietnicą „tyle zobaczysz", więc nie wolno mu nosić liczby
    // kafla; kafel opisuje klub, więc nie wolno mu drgać przy wpisywaniu frazy.
    const [page, counts, scopes] = await Promise.all([
      this.pilots.list(this.db, { ...query, fromMs, toMs }),
      this.pilots.counts(this.db, { fromMs, toMs }),
      this.pilots.scopeCounts(this.db, { ...(query.search === undefined ? {} : { search: query.search }) }),
    ]);

    return {
      items: page.items.map(pilotListItem),
      total: page.total,
      counts: pilotCounts(counts),
      scopes: pilotScopeCounts(scopes),
      daysFrom: dayString(fromMs),
      // `toMs` jest KOŃCEM doby (`2026-07-31T23:59:59.999Z`), a `dayString` czyta
      // z ISO, czyli z UTC - więc wychodzi ten sam dzień, którego granicę opisuje.
      daysTo: dayString(toMs),
    };
  }
}
