/**
 * UZ Aero (serwer) - LISTA KLUBÓW i karta klubu dla superadministratora (moduł
 * Organizacje, `platform.manage`; mockupy `organizacje-lista`, `organizacje-klub`;
 * `docs/wielofirmowosc.md` §8.1; issue #100, D3).
 *
 * ══ JEDYNE ZAPYTANIE PANELU, KTÓRE PATRZY NA WSZYSTKIE KLUBY NARAZ ══
 * I dlatego jest tak wąskie: z wnętrza klubu oddaje LICZBY (członkowie, maszyny)
 * i administratorów - „do kogo dzwonić". Dziennika, floty, kolejki zgłoszeń ani kodu
 * pilota innego niż administratora tu nie ma i nie ma ich dlatego, że §3.3 mówi
 * „superadministrator nie wchodzi do danych klubu", a lista klubów nie jest wyjątkiem
 * wpisanym w rolę.
 *
 * Liczniki chipów („Wszystkie", „Aktywne") liczą się po WSZYSTKICH klubach, nie po
 * filtrze - ta sama reguła, co przy kaflach listy pilotów: kafel opisuje zbiór,
 * a chip z liczbą jest obietnicą „tyle wierszy zobaczysz po kliknięciu".
 */

import type { Database } from '../../common/ports.ts';
import type {
  AdminOrganizationDetail,
  AdminOrganizationPage,
} from '../contracts/organizations.ts';
import { organizationDetail, organizationListItem } from '../mappers/organizationListItem.ts';
import type { OrganizationsPlatformPort } from '../ports.ts';

export interface OrganizationQuery {
  search?: string;
  active?: boolean;
}

export class PlatformOrganizationQueries {
  constructor(
    private readonly db: Database,
    private readonly organizations: OrganizationsPlatformPort,
  ) {}

  async list(query: OrganizationQuery): Promise<AdminOrganizationPage> {
    const items = await this.organizations.list(this.db, query);
    // DRUGI odczyt tylko przy włączonym filtrze: liczniki opisują CAŁY serwer, więc
    // policzone z zawężonej listy kłamałyby dokładnie wtedy, gdy ktoś na nie patrzy.
    // Bez filtra lista JEST całym serwerem i drugie pytanie nie ma po co padać.
    const narrowed = query.search !== undefined || query.active !== undefined;
    const all = narrowed ? await this.organizations.list(this.db, {}) : items;

    return {
      items: items.map(organizationListItem),
      counts: { total: all.length, active: all.filter((org) => org.active).length },
    };
  }

  /** `null` = nie ma takiego klubu; trasa odpowiada 404. */
  async byId(id: string): Promise<AdminOrganizationDetail | null> {
    const org = await this.organizations.byId(this.db, id);
    return org == null ? null : organizationDetail(org);
  }
}
