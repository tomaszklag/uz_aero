/**
 * Ninerdeck (serwer) - adapter MODUŁU ORGANIZACJE (`OrganizationsPlatformPort`;
 * wielofirmowość §8.1; issue #100, D3).
 *
 * Jedyny adapter panelu, który NIE dostaje `orgId` parametrem: to on klubami zarządza.
 * Z wnętrza klubu czyta wyłącznie LICZBY (`COUNT`) i administratorów - żadnego wiersza
 * dziennika, floty ani kolejki. Ta wąskość jest treścią §3.3, nie oszczędnością:
 * „nic nie wycieka między klubami" obejmuje także listę klubów.
 *
 * ══ ADMINISTRATORZY IDĄ DRUGIM ZAPYTANIEM, NIE ZŁĄCZENIEM ══
 * Klub ma zwykle jednego administratora, ale może mieć kilku - a złączenie mnożyłoby
 * wiersze klubu i psuło `COUNT`-y w podzapytaniach albo wymagałoby agregatu JSON-owego.
 * Dwa zapytania i sklejenie w pamięci są tu tańsze do przeczytania, a lista klubów ma
 * kilkanaście wierszy, nie kilkanaście tysięcy.
 */

import { CLUB_CAPABILITIES } from '../../../domain/roles.ts';
import type {
  NewOrganization,
  OrganizationAdmin,
  OrganizationDetail,
  OrganizationPatch,
  OrganizationSummary,
  OrganizationsPlatformPort,
} from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';
import { SqlFilter } from '../sqlFilter.ts';
import { normalizeEmail } from '../../../domain/email.ts';
import { DEFAULT_CLUB_ZONE } from '../../../domain/clubTime.ts';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  created_at: string | Date;
  join_code: string | null;
  join_code_since: string | Date | null;
  /** Konfiguracja kalendarza - czyta ją WYŁĄCZNIE `byId` (karta klubu). */
  timezone?: string;
  home_icao?: string | null;
  /** `COUNT(*)` - sterownik oddaje `int8` NAPISEM. */
  members: string | number;
  aircraft: string | number;
}

interface AdminRow {
  org_id: string;
  pilot_id: string;
  code: string;
  name: string;
  email: string | null;
  signed_in: boolean;
  /** Najświeższa ŻYWA sesja w tym klubie; `null` = żadnej (2.1.0, issue #133 C9). */
  last_seen_at: string | Date | null;
  /** Żywe zaproszenie z platformy; oba `null` razem (2.1.0, issue #134 D5). */
  invite_sent_at: string | Date | null;
  invite_expires_at: string | Date | null;
}

/**
 * Liczniki z wnętrza klubu.
 *
 * `members` liczy członkostwa Z LISTY klubu (`active`/`disabled`) - tą samą regułą, co
 * lista pilotów (`pilotsRepo.ts`, stała `LISTED`): zgłoszenie `pending` nie jest jeszcze
 * członkiem, a odrzucone nie będzie. Gdyby liczyło wszystkie wiersze, liczba na liście
 * klubów rosłaby od samych zgłoszeń i nie zgadzałaby się z listą w panelu klubu.
 *
 * `aircraft` liczy CAŁĄ flotę, także jednostki wyłączone ze służby: pytanie brzmi „jak
 * duży jest ten klub", a nie „ile maszyn dziś lata".
 */
const COUNTS = `
  (SELECT COUNT(*) FROM memberships m
    WHERE m.org_id = o.id AND m.status IN ('active', 'disabled')) AS members,
  (SELECT COUNT(*) FROM aircraft a WHERE a.org_id = o.id) AS aircraft`;

const ORG_COLUMNS = `o.id, o.name, o.slug, o.active, o.created_at, o.join_code, o.join_code_since`;

const toSummary = (row: OrgRow, admins: OrganizationAdmin[]): OrganizationSummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  active: row.active,
  createdAt: new Date(row.created_at),
  members: Number(row.members),
  aircraft: Number(row.aircraft),
  admins,
});

export class PgOrganizationsRepo implements OrganizationsPlatformPort {
  async list(
    db: Queryable,
    filter: { search?: string; active?: boolean },
  ): Promise<OrganizationSummary[]> {
    const sql = new SqlFilter();
    if (filter.active !== undefined) sql.add('o.active = ?', filter.active);
    if (filter.search !== undefined && filter.search !== '') {
      // Nazwa ALBO slug: jedno jest napisem dla człowieka, drugie adresem - człowiek
      // szukający klubu ma w pamięci raz to, raz tamto.
      //
      // `position`, nie `LIKE '%q%'` - ta sama reguła, co w `pilotsRepo.ts`: wzorzec
      // `LIKE` wymagałby ucieczki `%` i `_` z tekstu wpisanego ręką, a zapomniana
      // ucieczka daje wyszukiwarkę, w której `%` pokazuje wszystko.
      sql.add(
        `(position(lower(?) in lower(o.name)) > 0 OR position(lower(?) in lower(o.slug)) > 0)`,
        filter.search,
        filter.search,
      );
    }

    const { rows } = await db.query<OrgRow>(
      `SELECT ${ORG_COLUMNS}, ${COUNTS}
         FROM organizations o
         ${sql.where()}
        -- Klub wyłączony jest przygaszony i stoi na KOŃCU, jak konto wyłączone na
        -- liście pilotów (mockup organizacje-lista).
        ORDER BY o.active DESC, o.name ASC`,
      sql.params(),
    );

    const admins = await this.adminsOf(
      db,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toSummary(row, admins.get(row.id) ?? []));
  }

  async byId(db: Queryable, id: string): Promise<OrganizationDetail | null> {
    const { rows } = await db.query<OrgRow>(
      `SELECT ${ORG_COLUMNS}, o.timezone, o.home_icao, ${COUNTS} FROM organizations o WHERE o.id = $1`,
      [id],
    );
    const row = rows[0];
    if (row == null) return null;

    const admins = await this.adminsOf(db, [row.id]);
    return {
      ...toSummary(row, admins.get(row.id) ?? []),
      joinCode: row.join_code,
      joinCodeSince: row.join_code_since == null ? null : new Date(row.join_code_since),
      // Kolumna ma `NOT NULL DEFAULT` (migracja 11), więc `??` broni wyłącznie przed
      // wierszem sprzed niej - nie przed pustą konfiguracją, która tu nie istnieje.
      timezone: row.timezone ?? DEFAULT_CLUB_ZONE,
      homeIcao: row.home_icao ?? null,
    };
  }

  /**
   * Klub + pierwszy administrator w JEDNEJ transakcji (wołający daje `tx`).
   *
   * Osoba o tym adresie może już istnieć (lata w innym klubie) - wtedy dopisujemy
   * członkostwo DO NIEJ i oddajemy JEJ identyfikator: `pilots.email` jest jedyny na
   * serwerze, bo osoba jest jedna (§3.6). Nazwiska istniejącej osoby NIE ruszamy -
   * należy do niej, a nie do klubu, który ją właśnie dopisuje (ta sama reguła, co miał
   * `PgAdminPilotsRepo.insert` do epiku D).
   */
  async insert(tx: Queryable, org: NewOrganization): Promise<{ adminPilotId: string }> {
    const at = org.at.toISOString();
    await tx.query(
      `INSERT INTO organizations (id, name, slug, active, join_code, join_code_since, created_at, created_by)
       VALUES ($1, $2, $3, TRUE, $4, $5, $5, $6)`,
      [org.id, org.name, org.slug, org.joinCode, at, org.createdBy],
    );

    // Adres jest loginem (§4.4): jeden napis i do wyszukania osoby, i do zapisu.
    const adminEmail = normalizeEmail(org.admin.email);
    const existing = await tx.query<{ id: string }>('SELECT id FROM pilots WHERE lower(email) = $1', [
      adminEmail,
    ]);
    let pilotId = existing.rows[0]?.id ?? org.admin.pilotId;
    if (existing.rows[0] == null) {
      await tx.query('INSERT INTO pilots (id, name, email, active) VALUES ($1, $2, $3, TRUE)', [
        pilotId,
        org.admin.name,
        adminEmail,
      ]);
    }

    // `joined_via = 'platform'`: pierwszy administrator klubu to jedyny wyjątek od kodu
    // klubu i ma w bazie własną nazwę, żeby było widać, że nikt go nie zatwierdzał.
    await tx.query(
      `INSERT INTO memberships (org_id, pilot_id, code, status, joined_via, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', 'platform', $4, $4)`,
      [org.id, pilotId, org.admin.code, at],
    );

    // KOMPLET ZDOLNOŚCI KLUBOWYCH (epik #197) - to jest cała treść słowa „administrator"
    // po zniknięciu ról. Pierwszy członek klubu MUSI mieć `accounts.manage`, bo inaczej
    // nie miałby kto nadać uprawnień drugiemu: klub powstałby zamknięty.
    for (const capability of CLUB_CAPABILITIES) {
      await tx.query(
        `INSERT INTO membership_capabilities (org_id, pilot_id, capability) VALUES ($1, $2, $3)`,
        [org.id, pilotId, capability],
      );
    }

    return { adminPilotId: pilotId };
  }

  /**
   * Nazwa i konfiguracja kalendarza. Slug jest adresem kart arkusza i po nadaniu się
   * nie zmienia (§3.1), a kod klubu prowadzi panel klubu (`PgClubCodeRepo`).
   *
   * `home_icao` idzie przez CASE, a nie przez COALESCE, bo `null` znaczy tu
   * „wyczyść", a nie „nie ruszaj" - o tym, czy w ogóle piszemy, rozstrzyga OBECNOŚĆ
   * pola w łatce. COALESCE zlałby te dwa stany w jeden i wyczyszczenie lotniska
   * byłoby niewyrażalne.
   */
  async update(tx: Queryable, id: string, patch: OrganizationPatch): Promise<void> {
    await tx.query(
      `UPDATE organizations
          SET name      = COALESCE($2, name),
              timezone  = COALESCE($3, timezone),
              home_icao = CASE WHEN $4 THEN $5 ELSE home_icao END
        WHERE id = $1`,
      [id, patch.name ?? null, patch.timezone ?? null, patch.homeIcao !== undefined, patch.homeIcao ?? null],
    );
  }

  async setActive(tx: Queryable, id: string, active: boolean): Promise<void> {
    await tx.query('UPDATE organizations SET active = $2 WHERE id = $1', [id, active]);
  }

  /**
   * Administratorzy podanych klubów, pogrupowani po klubie.
   *
   * `signedIn` czyta obecność wiersza w `external_identities`: tożsamość Google powstaje
   * przy PIERWSZYM logowaniu (§4), więc jej brak znaczy dokładnie „ten człowiek jeszcze
   * nie wszedł". Stempel `last_login_at` odpowiadałby na to samo pytanie, ale tylko dla
   * tożsamości, które już istnieją - a pytanie dotyczy właśnie tych, których nie ma.
   */
  private async adminsOf(
    db: Queryable,
    orgIds: readonly string[],
  ): Promise<Map<string, OrganizationAdmin[]>> {
    const out = new Map<string, OrganizationAdmin[]>();
    if (orgIds.length === 0) return out;

    const { rows } = await db.query<AdminRow>(
      // „WSZEDŁ" TO ODTĄD DWIE DROGI, NIE JEDNA (2.1.0, issue #134 D5). Do 2.1.0 pytanie
      // brzmiało „czy ma tożsamość Google", bo innej drogi nie było. Od chwili, w której
      // pierwszy administrator klubu wchodzi z linku i HASŁEM, sam warunek na
      // `external_identities` opisywałby człowieka pracującego w panelu od miesiąca jako
      // „nie zalogował się" - i kazałby wysyłać mu zaproszenie za zaproszeniem.
      // Wiersz w `login_sessions` (żywy albo wygasły - te się nie kasują) odpowiada na to
      // wprost: ktoś tym kontem wszedł.
      `SELECT m.org_id, m.pilot_id, m.code, p.name, p.email,
              (EXISTS (SELECT 1 FROM external_identities e WHERE e.pilot_id = p.id)
               OR EXISTS (SELECT 1 FROM login_sessions g WHERE g.pilot_id = p.id)) AS signed_in,
              (SELECT MAX(s.last_seen_at) FROM login_sessions s
                WHERE s.pilot_id = p.id AND s.org_id = m.org_id AND s.revoked_at IS NULL)
                AS last_seen_at,
              -- ZAPROSZENIE: najświeższy NIEZUŻYTY link „ustaw hasło" wysłany Z PLATFORMY.
              -- Wyzwalacz 'platform' odróżnia je od listu, który ta osoba wysłała sobie
              -- sama - „zaproszenie wysłano" przy cudzym resecie hasła byłoby zdaniem
              -- o czymś innym.
              --
              -- TERMINU NIE FILTRUJEMY TUTAJ i to nie jest niedopatrzenie: teraźniejszość
              -- zna tu wyłącznie zegar BAZY, a ten stempel postawił zegar APLIKACJI
              -- (pułapka docs/architektura-panelu-serwer.md §7.9 (j)). Zapytanie oddaje
              -- więc termin, a rozstrzyga o nim czytelnik - panel i tak musi go napisać
              -- („ważne 72 h"), więc tam ta liczba już jest.
              (SELECT t.created_at FROM password_reset_tokens t
                WHERE t.pilot_id = p.id AND t.triggered_by = 'platform'
                  AND t.consumed_at IS NULL
                ORDER BY t.created_at DESC LIMIT 1) AS invite_sent_at,
              (SELECT t.expires_at FROM password_reset_tokens t
                WHERE t.pilot_id = p.id AND t.triggered_by = 'platform'
                  AND t.consumed_at IS NULL
                ORDER BY t.created_at DESC LIMIT 1) AS invite_expires_at
         FROM memberships m
         JOIN pilots p ON p.id = m.pilot_id
        -- ADMINISTRATOR KLUBU = KTOŚ ZE ZDOLNOŚCIĄ accounts.manage (epik #197): to ta
        -- jedna zdolność rozstrzyga, czy klub ma kogo prosić o pomoc, i to ona broni
        -- przed zamknięciem klubu. Superadministrator pyta tu wyłącznie „do kogo dzwonić".
        WHERE m.org_id = ANY($1) AND m.status = 'active'
          AND EXISTS (SELECT 1 FROM membership_capabilities mc
                       WHERE mc.org_id = m.org_id AND mc.pilot_id = m.pilot_id
                         AND mc.capability = 'accounts.manage')
        ORDER BY p.name ASC`,
      [orgIds],
    );

    for (const row of rows) {
      const admins = out.get(row.org_id) ?? [];
      admins.push({
        pilotId: row.pilot_id,
        name: row.name,
        email: row.email,
        code: row.code,
        signedIn: row.signed_in,
        lastSeenAt: row.last_seen_at == null ? null : new Date(row.last_seen_at),
        // Para albo nic: zaproszenie bez terminu ważności nie ma o czym powiedzieć
        // karcie klubu, a termin bez chwili wysłania nie mówi, czy to jeszcze to samo.
        invite:
          row.invite_sent_at == null || row.invite_expires_at == null
            ? null
            : {
                sentAt: new Date(row.invite_sent_at),
                expiresAt: new Date(row.invite_expires_at),
              },
      });
      out.set(row.org_id, admins);
    }
    return out;
  }
}
