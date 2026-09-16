/**
 * Ninerdeck (serwer) - MODUŁ ORGANIZACJE: zakładanie klubów i ich wyłączanie
 * (superadministrator, zdolność `platform.manage`; mockupy `organizacje-lista`,
 * `organizacje-klub`; `docs/wielofirmowosc.md` §8.1; issue #100, D3).
 *
 * ══ KLUB NIE MOŻE POWSTAĆ BEZ PIERWSZEGO ADMINISTRATORA ══
 * Dlatego założenie klubu to JEDNO zamówienie: organizacja + kod klubu + osoba
 * z adresem Google + jej członkostwo `admin` `active`. Gdyby dało się założyć klub
 * „na potem", powstałby klub, do którego nikt nie wejdzie: kodem klubu nie miałby kto
 * zatwierdzić zgłoszeń (§3.8), a drugiej drogi nie ma. To ten sam rodzaj niezmiennika,
 * co `membership_active_has_code` w bazie - tylko wyrażony kształtem komendy.
 *
 * ══ TOŻSAMOŚĆ PIERWSZEGO ADMINISTRATORA PODPINA SIĘ SAMA ══
 * Nie zakładamy tu żadnego poświadczenia (haseł w produkcie nie ma): wpisujemy ADRES
 * konta Google, a tożsamość podepnie się przy pierwszym logowaniu tym adresem
 * (`claimByVerifiedEmail`, `docs/logowanie-google.md` §6 - ten sam bootstrap, którym
 * wchodzi superadministrator z `SEED_ADMIN_EMAIL`). Do tej chwili karta klubu pokazuje
 * „nie zalogował się" i to jest jedyny stan, w którym superadministrator ma coś do
 * zrobienia - przypomnieć się.
 *
 * ══ CZEGO TA KOMENDA NIE POTRAFI I DLACZEGO ══
 *  • **skasować klubu** - dziennik jest dokumentem klubu, więc zostaje wyłączenie
 *    (`setActive`), dokładnie jak przy koncie z historią;
 *  • **zmienić sluga** - slug jest adresem kart arkusza, nadawanym raz (§3.1);
 *  • **wejść do danych klubu** - superadministrator nie ma żadnej zdolności klubowej
 *    (§3.3), a ta komenda zwraca z wnętrza klubu wyłącznie LICZBY i administratorów;
 *  • **rotować kodu klubu** - kod powstaje razem z klubem (żeby administrator miał od
 *    pierwszego dnia co podać pilotom), ale nowy generuje już panel KLUBU
 *    (`commands/clubCode.ts`, §8.1).
 *
 * Konstruktor bez `Database`/`Queryable` - komenda nie ma jak zapisać z pominięciem
 * śladu audytu (`auditedWrite.ts`, `test/architecture.test.ts`). Wpis trafia do dziennika
 * z PUSTYM `org_id`: akcja platformowa nie dzieje się w żadnym klubie, tylko go tworzy.
 */

import { CLUB_CODE_LENGTH, clubCodeFrom, formatClubCode } from '../../../domain/clubCode.ts';
import type { Clock } from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import { uniqueConflictOn } from './uniqueConflict.ts';
import type {
  OrganizationDetail,
  OrganizationPatch,
  OrganizationsPlatformPort,
  PlatformActor,
} from '../ports.ts';

/**
 * „To, co wręczył `AuditedWrite`" - ten sam idiom i z tego samego powodu, co
 * `AuditedTx` w `commands/maintenance.ts`: komenda panelu NIE MA prawa importować
 * `Database` ani `Queryable` (`test/architecture.test.ts`), bo brak uchwytu do bazy jest
 * drugą połową mechanizmu audytu. Rozbicie dwóch mutacji na wspólny szkielet wymaga
 * jednak nazwania transakcji, którą brama podała WEWNĄTRZ siebie.
 */
type AuditedTx = Parameters<Parameters<AuditedWrite['run']>[1]>[0];

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  admin: { name: string; email: string; code: string };
}

/** Ile razy losujemy kod klubu przy zderzeniu - patrz `commands/clubCode.ts`. */
const DRAW_ATTEMPTS = 5;

/**
 * Odmowa jest WARIANTEM WYNIKU, nie wyjątkiem na granicy HTTP (wzorzec `PilotOutcome`).
 *
 * `conflict` niesie POLE, bo oba zajęte pola da się poprawić w formularzu i administrator
 * musi wiedzieć które: `slug` jest adresem klubu (jedyny na serwerze), `email` wskazuje
 * osobę, która jest już administratorem tego klubu.
 */
export type OrganizationOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'no_changes' }
  | { ok: false; reason: 'conflict'; field: 'slug' | 'email' };

class OrganizationNotFound extends Error {}

class NoChanges extends Error {}

export class PlatformOrganizationCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly organizations: OrganizationsPlatformPort,
    /**
     * Identyfikatory klubu i nowej osoby - `randomUUID` z composition rootu, jak
     * w `commands/pilots.ts`. Slug jest adresem publicznym, `id` kluczem: zmiana nazwy
     * klubu nie ma prawa oderwać go od jego dziennika.
     */
    private readonly newId: () => string,
    /** Losowe bajty kodu klubu - patrz `commands/clubCode.ts`. */
    private readonly randomBytes: (count: number) => Uint8Array,
    private readonly clock: Clock,
  ) {}

  async create(
    actor: PlatformActor,
    input: CreateOrganizationInput,
  ): Promise<OrganizationOutcome<OrganizationDetail>> {
    for (let attempt = 1; attempt <= DRAW_ATTEMPTS; attempt += 1) {
      const id = this.newId();
      const adminPilotId = this.newId();
      const joinCode = clubCodeFrom(this.randomBytes(CLUB_CODE_LENGTH));

      try {
        const created = await this.write.run(actor, async (tx) => {
          const { adminPilotId: personId } = await this.organizations.insert(tx, {
            id,
            name: input.name,
            slug: input.slug,
            joinCode,
            createdBy: actor.pilotId,
            at: this.clock.now(),
            admin: { pilotId: adminPilotId, ...input.admin },
          });

          // Odczyt TĄ SAMĄ transakcją, żeby odpowiedź była dokładnie tym, co pokaże
          // lista: liczby i administratorzy liczą się ze złączeń, a nie z zamówienia.
          const detail = await this.organizations.byId(tx, id);
          // Wiersz wstawiony i nieczytelny w tej samej transakcji to awaria adaptera,
          // nie stan do obsłużenia odmową - lepiej głośno (500) niż „nie znaleziono".
          if (detail == null) throw new Error(`klub ${id} zniknął w transakcji założenia`);

          return {
            result: detail,
            audit: {
              action: 'organization.create' as const,
              targetType: 'organization',
              targetId: id,
              details: {
                name: input.name,
                slug: input.slug,
                joinCode: formatClubCode(joinCode),
                // KOMPLET tożsamości pierwszego administratora: to jedyny wiersz
                // w systemie, z którego widać, komu oddano klub w chwili powstania.
                admin: { ...input.admin, pilotId: personId },
                // Czy klub dostał administratora, który JUŻ był na serwerze (lata
                // w innym klubie), czy nową osobę - dziennik ma odróżniać te fakty.
                existingPerson: personId !== adminPilotId,
              },
            },
          };
        });

        return { ok: true, result: created };
      } catch (err) {
        // Kod klubu jest jedyny na SERWERZE: zderzenie = losuj ponownie, nową
        // transakcją (po błędzie unikalności transakcja Postgresa jest odrzucona).
        if (uniqueConflictOn(err, ['join_code'] as const) != null && attempt < DRAW_ATTEMPTS) {
          continue;
        }
        const field = uniqueConflictOn(err, ['slug', 'email'] as const);
        if (field != null) return { ok: false, reason: 'conflict', field };
        throw err;
      }
    }

    throw new Error(`nie udało się wylosować wolnego kodu klubu w ${DRAW_ATTEMPTS} próbach`);
  }

  /** Zmiana nazwy klubu. Slug zostaje - jest adresem, nie napisem. */
  async update(
    actor: PlatformActor,
    id: string,
    patch: OrganizationPatch,
  ): Promise<OrganizationOutcome<OrganizationDetail>> {
    return this.change(actor, id, 'organization.update', async (tx, before) => {
      if (patch.name === undefined || patch.name === before.name) throw new NoChanges();
      await this.organizations.update(tx, id, patch);
      return { name: { from: before.name, to: patch.name } };
    });
  }

  /**
   * Wyłączenie klubu albo włączenie go z powrotem.
   *
   * Jedna komenda, bo to jedna decyzja w dwie strony - i ta sama asymetria, co przy
   * członkostwie (`commands/pilots.ts`): odebranie dostępu ma WŁASNY kod w dzienniku
   * (`organization.disable`), przywrócenie jest zwykłą zmianą stanu
   * (`organization.update`). Sesji nie unieważniamy stemplem, bo nie trzeba: brama czyta
   * `organizations.active` przy każdym żądaniu (epik C), więc wyłączenie działa natychmiast.
   */
  async setActive(
    actor: PlatformActor,
    id: string,
    active: boolean,
  ): Promise<OrganizationOutcome<OrganizationDetail>> {
    const action = active ? ('organization.update' as const) : ('organization.disable' as const);
    return this.change(actor, id, action, async (tx, before) => {
      if (before.active === active) throw new NoChanges();
      await this.organizations.setActive(tx, id, active);
      return { active: { from: before.active, to: active } };
    });
  }

  /**
   * Wspólny szkielet zmiany istniejącego klubu: odczyt → mutacja → ponowny odczyt → ślad.
   *
   * Dwa odczyty tego samego wiersza są tu CELOWE: pierwszy daje diff do dziennika (wpis
   * ma mówić „z czego na co", a nie „jak jest teraz"), drugi - odpowiedź w kształcie
   * wiersza listy, razem z licznikami ze złączeń.
   */
  private async change(
    actor: PlatformActor,
    id: string,
    action: 'organization.update' | 'organization.disable',
    mutate: (tx: AuditedTx, before: OrganizationDetail) => Promise<Record<string, unknown>>,
  ): Promise<OrganizationOutcome<OrganizationDetail>> {
    try {
      const detail = await this.write.run(actor, async (tx) => {
        const before = await this.organizations.byId(tx, id);
        if (before == null) throw new OrganizationNotFound();

        const changes = await mutate(tx, before);

        const after = await this.organizations.byId(tx, id);
        if (after == null) throw new Error(`klub ${id} zniknął w transakcji zmiany`);

        return {
          result: after,
          audit: {
            action,
            targetType: 'organization',
            targetId: id,
            details: { slug: before.slug, changes },
          },
        };
      });

      return { ok: true, result: detail };
    } catch (err) {
      if (err instanceof OrganizationNotFound) return { ok: false, reason: 'not_found' };
      if (err instanceof NoChanges) return { ok: false, reason: 'no_changes' };
      throw err;
    }
  }
}
