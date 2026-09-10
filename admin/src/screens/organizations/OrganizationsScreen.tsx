/**
 * UZ Aero - panel: kluby na serwerze (`#/organizacje`, mockup `organizacje-lista`).
 *
 * Moduł PLATFORMY - jedyny ekran panelu, który widzi więcej niż jeden klub. Widzi przy
 * tym SAME LICZBY i administratorów: „nic nie wycieka między klubami" obejmuje także tę
 * listę (`docs/wielofirmowosc.md` §3.3), więc dziennika, floty ani kolejki zgłoszeń nie
 * ma tu z czego pokazać.
 *
 * Kompozycja jak w pozostałych modułach konfiguracji: nagłówek → zawężenia → tabela →
 * szuflada nad listą. Dwa ekrany konfiguracji czyta się tak samo, więc różnicą są
 * wyłącznie kolumny.
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useOrganizations } from '../../queries/useOrganizations';
import {
  Banner,
  DataTable,
  EmptyState,
  FilterChip,
  LinkButton,
  Loadable,
  PageHead,
  Pill,
  SearchInput,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { BuildingIcon, PlusIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { OrganizationDrawer } from './OrganizationDrawer';
import { NEW_ORGANIZATION } from './organizationForm';
import { organizationRow, type OrganizationRow } from './organizationRows';

const HEADERS = ['Klub', 'Członkowie', 'Samoloty', 'Administrator', 'Założony', 'Status', ''];

export function OrganizationsScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();

  // Filtry mieszkają w adresie, nie w stanie komponentu - link „pokaż mi to samo, co
  // widzisz" jest podstawowym scenariuszem rozmowy o panelu.
  const search = params.get('szukaj') ?? '';
  const onlyActive = params.get('stan') === 'aktywne';

  const setParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(params);
    if (value == null || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const organizations = useOrganizations({
    q: search === '' ? undefined : search,
    active: onlyActive ? 'true' : undefined,
  });

  const rows = (organizations.data?.items ?? []).map(organizationRow);
  const backToList = (): void => {
    void navigate({ pathname: '/organizacje', search: params.toString() });
  };

  const columns: Column<OrganizationRow>[] = [
    {
      key: 'name',
      header: 'Klub',
      // Adres klubu stoi MONO w drugiej linii, bo jest adresem kart arkusza - napisem
      // do przepisania, nie nazwą do przeczytania.
      render: (row) => (
        <>
          <span className="cell-strong">{row.name}</span>
          <span className="cell-sub mono">{row.slug}</span>
        </>
      ),
    },
    { key: 'members', header: 'Członkowie', align: 'num', render: (row) => row.members },
    { key: 'aircraft', header: 'Samoloty', align: 'num', render: (row) => row.aircraft },
    {
      key: 'admin',
      header: 'Administrator',
      render: (row) => (
        <>
          {row.admin}
          {row.adminExtra == null ? null : <span className="cell-sub">{row.adminExtra}</span>}
          {row.adminPending ? <span className="cell-sub warn">nie zalogował się</span> : null}
        </>
      ),
    },
    {
      key: 'created',
      header: 'Założony',
      cellClass: 'cell-sub',
      render: (row) => row.created,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Pill tone={row.statusTone} dot={row.statusTone !== 'dim'}>
          {row.statusLabel}
        </Pill>
      ),
    },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      // Link, nie przycisk: kartę klubu da się wtedy otworzyć w nowej karcie
      // przeglądarki i wkleić komuś jej adres.
      render: (row) => (
        <LinkButton to={`/organizacje/${row.id}`} size="sm" variant="ghost">
          Otwórz
        </LinkButton>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Organizacje"
        sub="Kluby na tym serwerze. Każdy klub widzi wyłącznie swoje dane - ta lista jest jedynym miejscem, z którego widać je wszystkie naraz, i pokazuje same liczby."
        actions={
          <LinkButton to={`/organizacje/${NEW_ORGANIZATION}`} variant="primary">
            <PlusIcon size={13} />
            Załóż klub
          </LinkButton>
        }
      />

      <div className="filters">
        <SearchInput
          value={search}
          placeholder="Szukaj: nazwa, adres, administrator"
          ariaLabel="Szukaj klubu"
          onChange={(value) => setParam('szukaj', value)}
          onSubmit={() => undefined}
        />
        <FilterChip label="Wszystkie" on={!onlyActive} onToggle={() => setParam('stan', null)} />
        <FilterChip
          label="Aktywne"
          on={onlyActive}
          onToggle={() => setParam('stan', onlyActive ? null : 'aktywne')}
        />
      </div>

      {organizations.error == null ? null : (
        <Banner tone="danger">{errorMessage(organizations.error)}</Banner>
      )}

      <Loadable
        pending={organizations.isPending}
        skeleton={<TableSkeleton headers={HEADERS} widths={[190, 78, 70, 140, 90, 96, 54]} rows={4} />}
      >
        {rows.length === 0 ? (
          <EmptyOrganizations search={search} onClear={() => setParam('szukaj', null)} />
        ) : (
          <DataTable
            caption="Organizacje"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowClass={(row) => (row.muted ? 'muted' : undefined)}
            onRowClick={(row) => navigate(`/organizacje/${row.id}`)}
          />
        )}
      </Loadable>

      {id == null ? null : <OrganizationDrawer id={id} onClose={backToList} />}
    </>
  );
}

function EmptyOrganizations({ search, onClear }: { search: string; onClear: () => void }) {
  // Dwa różne stany puste, bo to dwie różne wiadomości: „nic tu nie ma" i „nic nie
  // pasuje do tego, czego szukasz". Jeden komunikat na oba kazałby zgadywać.
  if (search !== '') {
    return (
      <EmptyState
        icon={<BuildingIcon size={20} />}
        title={`Żaden klub nie pasuje do „${search}”`}
        note="Sprawdź pisownię albo wyczyść wyszukiwanie."
        action={
          <button type="button" className="btn sm" onClick={onClear}>
            Wyczyść wyszukiwanie
          </button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<BuildingIcon size={20} />}
      title="Nie ma jeszcze żadnego klubu"
      note="Załóż pierwszy - razem z klubem powstaje kod klubu i konto jego administratora."
      action={
        <LinkButton to={`/organizacje/${NEW_ORGANIZATION}`} variant="primary" size="sm">
          Załóż klub
        </LinkButton>
      }
    />
  );
}
