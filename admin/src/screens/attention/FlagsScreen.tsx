/**
 * Ninerdeck - panel 3.2: SKRZYNKA ROZJAZDÓW (`#/do-sprawdzenia/rozjazdy`;
 * `docs/panel-3.2.md` §6; makieta `sprawdzenie-rozjazdy`).
 *
 * Sześć rodzajów flag, których do 3.2.0 nie widział nikt: serwer je wystawiał przy
 * przyjmowaniu zapisów, aplikacja pilota przestała je pokazywać (issue #82: „rozstrzyga
 * je panel"), a panel skrzynki nie miał. Porządek listy jest własnością SERWERA:
 * trzymające kartę pierwsze, potem najstarsze - w tej kolejności warto je zamykać.
 *
 * Chipy stanu i rodzaju BEZ liczb (liczby w podtytule); oba w adresie po polsku, żeby
 * adres dał się wkleić w rozmowie. Sprawa otwiera się w szufladzie pod własnym adresem.
 */

import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useDirectory } from '../../queries/useDirectory';
import { FLAG_LIST_LIMIT, useAttention, useFlags } from '../../queries/useAttention';
import {
  Banner,
  Breadcrumbs,
  DataTable,
  EmptyState,
  FilterChip,
  LinkButton,
  Loadable,
  PageHead,
  Pill,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { ChecklistIcon } from '../../ui/components/icons';
import { personLookup } from '../calendar/directoryLookups';
import { errorMessage } from '../common/apiMessage';
import { NONE } from '../common/values';
import { ATTENTION, flagPath, flagsPath, type FlagFilter } from './attentionPaths';
import { flagsSubtitle } from './exportRows';
import { FlagDrawer } from './FlagDrawer';
import { flagLabel, flagSlug, flagTypeOfSlug, FLAG_TYPES_ORDER } from './flagLabels';
import { flagRow, type FlagRow } from './flagRows';

const OPEN_HEADERS = ['Rozjazd', 'Samolot', 'Operacje', 'Skutek', 'Od kiedy', ''];
const RESOLVED_HEADERS = ['Rozjazd', 'Samolot', 'Operacje', 'Rozstrzygnął', 'Notatka'];

export function FlagsScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();

  const filter: FlagFilter = {
    resolved: params.get('stan') === 'rozstrzygniete',
    kind: params.get('rodzaj'),
  };
  const type = flagTypeOfSlug(filter.kind);

  const setFilter = (next: FlagFilter): void => {
    const query = new URLSearchParams();
    if (next.resolved) query.set('stan', 'rozstrzygniete');
    if (next.kind != null) query.set('rodzaj', next.kind);
    setParams(query, { replace: true });
  };

  const flags = useFlags({
    status: filter.resolved ? 'resolved' : 'open',
    type: type ?? undefined,
    limit: FLAG_LIST_LIMIT,
  });
  // Próg „za długo" i „teraz" z zegara SERWERA - ta sama odpowiedź, która liczy plakietkę
  // w kolumnie; zwykle już w cache. Bez niej wiek liczy zegar przeglądarki, a próg śpi.
  const attention = useAttention();
  const now = attention.data == null ? Date.now() : Date.parse(attention.data.at);
  const windowMs = attention.data?.correctionWindowMs ?? Number.POSITIVE_INFINITY;
  const directory = useDirectory();
  const person = personLookup(directory.data);

  const items = flags.data?.items ?? [];
  const rows = items.map((flag) => flagRow(flag, now, windowMs, person));
  const blocking = items.filter((flag) => flag.blocksExport).length;

  const operations = (row: FlagRow) =>
    row.sessions.length === 0 ? (
      <span className="cell-sub">{NONE}</span>
    ) : (
      row.sessions.map((session) => (
        <span key={session.uuid} className="cell-sub mono">
          <Link className="cell-link" to={session.to}>
            {session.name}
          </Link>
          {session.active ? <span className="cell-sub"> w toku</span> : null}
        </span>
      ))
    );

  const columns: Column<FlagRow>[] = filter.resolved
    ? [
        {
          key: 'flag',
          header: 'Rozjazd',
          render: (row) => (
            <>
              <Pill tone="green">{row.label}</Pill>
              <span className="cell-sub">{row.subtitle}</span>
            </>
          ),
        },
        { key: 'reg', header: 'Samolot', render: (row) => <span className="reg">{row.reg}</span> },
        { key: 'sessions', header: 'Operacje', render: operations },
        {
          key: 'by',
          header: 'Rozstrzygnął',
          render: (row) => (
            <>
              {row.resolvedBy ?? NONE}
              {row.resolvedAt == null ? null : <span className="cell-sub">{row.resolvedAt}</span>}
            </>
          ),
        },
        { key: 'note', header: 'Notatka', cellClass: 'cell-sub', render: (row) => (row.note == null ? NONE : `„${row.note}"`) },
      ]
    : [
        {
          key: 'flag',
          header: 'Rozjazd',
          render: (row) => (
            <>
              <Pill tone="amber">{row.label}</Pill>
              <span className="cell-sub">{row.subtitle}</span>
            </>
          ),
        },
        { key: 'reg', header: 'Samolot', render: (row) => <span className="reg">{row.reg}</span> },
        { key: 'sessions', header: 'Operacje', render: operations },
        {
          key: 'effect',
          header: 'Skutek',
          render: (row) => (row.blocksExport ? <Pill tone="red">Trzyma kartę</Pill> : <span className="cell-sub">{NONE}</span>),
        },
        {
          key: 'age',
          header: 'Od kiedy',
          align: 'num',
          render: (row) => <span className={row.old ? 'cell-age old' : 'cell-age'}>{row.age}</span>,
        },
        {
          key: 'actions',
          header: '',
          cellClass: 'row-actions',
          render: (row) => (
            <LinkButton to={flagPath(row.id, filter)} size="sm" variant="ghost">
              Rozstrzygnij
            </LinkButton>
          ),
        },
      ];

  return (
    <>
      <Breadcrumbs items={[{ label: 'Do sprawdzenia', to: ATTENTION }, { label: 'Rozjazdy' }]} />

      <PageHead
        title="Rozjazdy"
        sub={flags.data == null ? undefined : flagsSubtitle(flags.data.total, blocking, filter.resolved)}
      />

      <div className="filters">
        <FilterChip label="Otwarte" on={!filter.resolved} onToggle={() => setFilter({ ...filter, resolved: false })} />
        <FilterChip label="Rozstrzygnięte" on={filter.resolved} onToggle={() => setFilter({ ...filter, resolved: true })} />
        <span className="daterange-sep" aria-hidden="true">
          ·
        </span>
        {FLAG_TYPES_ORDER.map((kind) => (
          <FilterChip
            key={kind}
            label={flagLabel(kind)}
            on={type === kind}
            onToggle={() => setFilter({ ...filter, kind: type === kind ? null : flagSlug(kind) })}
          />
        ))}
      </div>

      {flags.error == null ? null : <Banner tone="danger">{errorMessage(flags.error)}</Banner>}

      <Loadable
        pending={flags.isPending}
        skeleton={<TableSkeleton headers={filter.resolved ? RESOLVED_HEADERS : OPEN_HEADERS} widths={[150, 64, 180, 90, 60, 80]} rows={4} />}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<ChecklistIcon />}
            title={
              type != null
                ? 'Nic w tym zawężeniu'
                : filter.resolved
                  ? 'Żadnej rozstrzygniętej sprawy'
                  : 'Żadnego otwartego rozjazdu'
            }
            note={
              type != null
                ? 'Zdejmij chip rodzaju, żeby zobaczyć pozostałe sprawy.'
                : filter.resolved
                  ? 'Zamknięte sprawy pojawią się tu razem z notatką rozstrzygnięcia.'
                  : 'Rozstrzygnięte sprawy są pod chipem „Rozstrzygnięte".'
            }
          />
        ) : (
          <DataTable
            caption={filter.resolved ? 'Rozstrzygnięte rozjazdy' : 'Otwarte rozjazdy'}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowClass={(row) => (String(row.id) === id ? 'opened' : undefined)}
            onRowClick={(row) => navigate(flagPath(row.id, filter))}
          />
        )}
      </Loadable>

      {id == null ? null : (
        <FlagDrawer
          id={Number(id)}
          flags={flags.data?.items ?? null}
          listPending={flags.isPending}
          person={person}
          onClose={() => navigate(flagsPath(filter))}
        />
      )}
    </>
  );
}
