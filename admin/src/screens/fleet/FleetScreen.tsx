/**
 * UZ Aero - panel 2.0: lista samolotów (`#/samoloty`).
 *
 * Ekran KONFIGURACJI floty i nic więcej. Czego tu NIE MA wobec panelu 1.0: czterech
 * kafli, liczb przy chipach, trzech kolumn ze stanem przysyłanym przez telefony
 * (kto trzyma maszynę, ostatnie motogodziny, ostatnie paliwo) razem z całym aparatem
 * świeżości danych, progu paliwa jako kolumny, trzech banerów i dwóch kart
 * wyjaśniających. Stan operacyjny należy do ekranów operacyjnych; tutaj ustawia się
 * maszynę raz na sezon.
 *
 * Jeden wyjątek jest świadomy: jednostka WYŁĄCZONA, na której ktoś jeszcze lata.
 * Tego nie widać nigdzie indziej w panelu 2.0, a znaczy, że maszyna zniknęła pilotom
 * z listy w połowie czyjegoś dnia.
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { can } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { useFleet } from '../../queries/useFleet';
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
import { PlaneIcon, PlusIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { AircraftDrawer } from './AircraftDrawer';
import { fleetRow, type FleetRow } from './fleetRows';

const HEADERS = ['Rejestracja', 'Rok', 'Paliwo', 'Licznik', 'Drugi pilot', 'Stan', ''];

export function FleetScreen() {
  const { session } = useSessionState();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();

  const search = params.get('szukaj') ?? '';
  const onlyActive = params.get('stan') === 'w-sluzbie';

  const setParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(params);
    if (value == null || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const fleet = useFleet({
    q: search === '' ? undefined : search,
    status: onlyActive ? 'active' : undefined,
  });

  const manages = can(session?.capabilities, 'fleet.manage');
  const rows = (fleet.data?.items ?? []).map(fleetRow);

  const columns: Column<FleetRow>[] = [
    {
      key: 'reg',
      header: 'Rejestracja',
      render: (row) => (
        <>
          <span className="reg">{row.reg}</span>
          <span className="cell-sub">{row.type}</span>
        </>
      ),
    },
    { key: 'year', header: 'Rok', align: 'num', cellClass: 'cell-sub', render: (row) => row.year },
    { key: 'capacity', header: 'Paliwo', align: 'num', render: (row) => row.capacity },
    {
      key: 'mh',
      header: 'Licznik',
      render: (row) => <Pill tone={row.mhFormatTone}>{row.mhFormatLabel}</Pill>,
    },
    {
      key: 'dual',
      header: 'Drugi pilot',
      render: (row) => (row.dualLabel == null ? '—' : <Pill tone="amber">{row.dualLabel}</Pill>),
    },
    {
      key: 'status',
      header: 'Stan',
      render: (row) => (
        <>
          <Pill tone={row.inService ? 'green' : 'red'} dot>
            {row.statusLabel}
          </Pill>
          {row.warning == null ? null : <span className="cell-sub warn">{row.warning}</span>}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      render: (row) => (
        <LinkButton to={`/samoloty/${row.id}`} size="sm" variant="ghost">
          {manages ? 'Edytuj' : 'Zobacz'}
        </LinkButton>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="SAMOLOTY"
        actions={
          manages ? (
            <LinkButton to="/samoloty/nowy" variant="primary">
              <PlusIcon size={13} />
              Dodaj samolot
            </LinkButton>
          ) : undefined
        }
      />

      <div className="filters">
        <SearchInput
          value={search}
          placeholder="Szukaj: rejestracja, typ"
          ariaLabel="Szukaj samolotu"
          onChange={(value) => setParam('szukaj', value)}
          onSubmit={() => undefined}
        />
        <FilterChip label="Wszystkie" on={!onlyActive} onToggle={() => setParam('stan', null)} />
        <FilterChip
          label="W służbie"
          on={onlyActive}
          onToggle={() => setParam('stan', onlyActive ? null : 'w-sluzbie')}
        />
      </div>

      {fleet.error == null ? null : <Banner tone="danger">{errorMessage(fleet.error)}</Banner>}

      <Loadable
        pending={fleet.isPending}
        skeleton={<TableSkeleton headers={HEADERS} widths={[80, 40, 62, 96, 74, 78, 54]} rows={5} />}
      >
        {rows.length === 0 ? (
          <EmptyFleet search={search} manages={manages} onClear={() => setParam('szukaj', null)} />
        ) : (
          <DataTable
            caption="Samoloty"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowClass={(row) => (row.muted ? 'muted' : undefined)}
            onRowClick={(row) => navigate(`/samoloty/${row.id}`)}
          />
        )}
      </Loadable>

      {id == null ? null : (
        <AircraftDrawer
          id={id}
          fleet={fleet.data?.items ?? null}
          listPending={fleet.isPending}
          manages={manages}
          onClose={() => navigate({ pathname: '/samoloty', search: params.toString() })}
        />
      )}
    </>
  );
}

function EmptyFleet({
  search,
  manages,
  onClear,
}: {
  search: string;
  manages: boolean;
  onClear: () => void;
}) {
  if (search !== '') {
    return (
      <EmptyState
        icon={<PlaneIcon size={20} />}
        title={`Nic nie pasuje do „${search}”`}
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
      icon={<PlaneIcon size={20} />}
      title="Nie ma jeszcze żadnego samolotu"
      note="Bez tego pilot nie ma czego wybrać, zaczynając lot."
      action={
        manages ? (
          <LinkButton to="/samoloty/nowy" variant="primary">
            <PlusIcon size={13} />
            Dodaj samolot
          </LinkButton>
        ) : undefined
      }
    />
  );
}
