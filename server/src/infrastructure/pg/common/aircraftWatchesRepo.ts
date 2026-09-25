/**
 * Ninerdeck (serwer) - adapter tabeli `aircraft_watches` (obserwowanie samolotu,
 * 3.2.0, issue #205; migracja 15, `docs/obserwowanie-samolotu.md` §2.1, §4.1).
 *
 * W `common/`, choć lista zadań epiku O-B mówiła o `mobile/`: od decyzji 12 (lista
 * obserwowanych w `#/konto`) ustawienie zapisuje także panel, a druga kopia tego
 * SQL-a po tamtej stronie byłaby pierwszym miejscem, w którym telefon i panel
 * pokazałyby różne listy tej samej osoby.
 *
 * ══ PRAWO SPRAWDZA SIĘ PRZY WYSYŁCE, W SQL-u ══
 * `watchersOf` złącza wiersze obserwowania z żywym klubem: członkostwo `active`, osoba
 * aktywna, klub aktywny i zdolność `fleet.watch` w zbiorze - dokładnie to, o co brama
 * telefonu pyta przy każdym żądaniu (`authorizeMember`). Odebranie zdolności albo
 * wyłączenie członkostwa wycisza od razu; wiersz zostaje, więc przywrócenie zdolności
 * przywraca powiadomienia bez proszenia człowieka o drugie włączenie.
 *
 * ══ KLUB W KAŻDYM PREDYKACIE ══
 * `org_id` jest argumentem każdej metody i stoi jako PIERWSZY warunek (epik C).
 * `set` dodatkowo NIE zakłada wiersza dla maszyny spoza klubu (`INSERT … SELECT …
 * WHERE EXISTS`): klucz obcy do `memberships` pilnuje osoby w klubie, a ten warunek -
 * maszyny w klubie; bez niego token klubu B mógłby obserwować maszynę klubu A pod
 * własnym `org_id`.
 */

import type { AircraftWatchesPort, Queryable } from '../../../application/common/ports.ts';

export class PgAircraftWatchesRepo implements AircraftWatchesPort {
  async set(
    db: Queryable,
    orgId: string,
    aircraftId: string,
    pilotId: string,
    at: Date,
  ): Promise<boolean> {
    // Istnienie maszyny W KLUBIE sprawdza się osobno od wstawienia: `ON CONFLICT DO
    // NOTHING` oddaje zero wierszy także przy POWTÓRZONYM włączeniu, więc sam wynik
    // `INSERT` nie odróżniałby „już obserwujesz" od „nie ma takiej maszyny".
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM aircraft WHERE org_id = $1 AND id = $2',
      [orgId, aircraftId],
    );
    if (rows.length === 0) return false;

    await db.query(
      `INSERT INTO aircraft_watches (org_id, aircraft_id, pilot_id, created_at)
       SELECT $1, $2, $3, $4
        WHERE EXISTS (SELECT 1 FROM aircraft a WHERE a.org_id = $1 AND a.id = $2)
       ON CONFLICT (aircraft_id, pilot_id) DO NOTHING`,
      [orgId, aircraftId, pilotId, at],
    );
    return true;
  }

  async unset(db: Queryable, orgId: string, aircraftId: string, pilotId: string): Promise<void> {
    await db.query(
      'DELETE FROM aircraft_watches WHERE org_id = $1 AND aircraft_id = $2 AND pilot_id = $3',
      [orgId, aircraftId, pilotId],
    );
  }

  async isWatching(
    db: Queryable,
    orgId: string,
    aircraftId: string,
    pilotId: string,
  ): Promise<boolean> {
    const { rows } = await db.query(
      'SELECT 1 FROM aircraft_watches WHERE org_id = $1 AND aircraft_id = $2 AND pilot_id = $3',
      [orgId, aircraftId, pilotId],
    );
    return rows.length > 0;
  }

  async watchedBy(db: Queryable, orgId: string, pilotId: string): Promise<Set<string>> {
    const { rows } = await db.query<{ aircraft_id: string }>(
      'SELECT aircraft_id FROM aircraft_watches WHERE org_id = $1 AND pilot_id = $2',
      [orgId, pilotId],
    );
    return new Set(rows.map((r) => r.aircraft_id));
  }

  async watchersOf(db: Queryable, orgId: string, aircraftId: string): Promise<string[]> {
    const { rows } = await db.query<{ pilot_id: string }>(
      `SELECT w.pilot_id
         FROM aircraft_watches w
         JOIN memberships m
           ON m.org_id = w.org_id AND m.pilot_id = w.pilot_id AND m.status = 'active'
         JOIN membership_capabilities c
           ON c.org_id = w.org_id AND c.pilot_id = w.pilot_id AND c.capability = 'fleet.watch'
         JOIN pilots p ON p.id = w.pilot_id AND p.active
         JOIN organizations o ON o.id = w.org_id AND o.active
        WHERE w.org_id = $1 AND w.aircraft_id = $2
        ORDER BY w.pilot_id`,
      [orgId, aircraftId],
    );
    return rows.map((r) => r.pilot_id);
  }
}
