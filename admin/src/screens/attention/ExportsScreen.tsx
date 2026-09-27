/**
 * Ninerdeck - panel 3.2: KARTY DNIA I EKSPORT (`#/do-sprawdzenia/karty?od=&do=&stan=`;
 * `docs/panel-3.2.md` §7; makieta `sprawdzenie-karty`).
 *
 * Wiersz = OPERACJA (tak liczy serwer), ale nazwą wiersza jest KARTA - doba samolotu,
 * bo o kartę pyta skarbnik. Dwie zmiany jednej maszyny w dobie mają więc tę samą nazwę
 * karty w dwóch wierszach - i to jest poprawne: karta jest jednym dokumentem z dwoma
 * blokami, a stan opisuje operację. BRAK KARTY JEST CZERWONY: to jedyny ślad awarii
 * eksportu - nieudany zapis nie zostawia wiersza w żadnej tabeli.
 *
 * Liczby w podtytule są licznikami CAŁEGO zakresu, nie widocznego okna; lista przycięta
 * limitem mówi o tym wprost. Stan jest wnioskiem SERWERA, więc chip zawęża dokładnie do
 * wierszy z daną plakietką; „Rewizje" jest WYMIAREM (karty wysłane więcej niż raz), nie
 * stanem - zawęża się po stronie ekranu, a liczbę niesie `counts.revised`.
 */

import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { can } from '../../auth/can';
import { EXPORT_LIST_LIMIT, useAttention, useExports } from '../../queries/useAttention';
import { useSession } from '../../queries/useSession';
import {
  Banner,
  Breadcrumbs,
  Button,
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
import { ChecklistIcon, SheetIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { DateRange } from '../logbook/DateRange';
import { defaultRange, type DayRange } from '../logbook/dateRanges';
import { ATTENTION, exportPath, exportsPath, flagPath, type ExportFilter } from './attentionPaths';
import { ExportDrawer } from './ExportDrawer';
import { EXPORT_CHIPS, exportRow, exportsSubtitle, exportStateOfSlug, type ExportRow } from './exportRows';

const HEADERS = ['Karta', 'Operacja', 'Stan', 'Rewizja', 'Wysłano', ''];
const NO_FLAG = { resolved: false, kind: null };

export function ExportsScreen() {
  const navigate = useNavigate();
  const { uuid } = useParams();
  const [params, setParams] = useSearchParams();

  const filter: ExportFilter = {
    range: { from: params.get('od') ?? '', to: params.get('do') ?? '' },
    state: params.get('stan'),
  };
  const setFilter = (next: ExportFilter): void => {
    navigate(uuid == null ? exportsPath(next) : exportPath(uuid, next), { replace: true });
  };

  // Zakres ZAWSZE stoi w adresie, także domyślny - adres z paska ma być kompletny, bo
  // jego wklejenie w rozmowie jest podstawowym scenariuszem panelu.
  const now = Date.now();
  useEffect(() => {
    if (filter.range.from !== '' || filter.range.to !== '') return;
    const range = defaultRange(now);
    const next = new URLSearchParams(params);
    next.set('od', range.from);
    next.set('do', range.to);
    setParams(next, { replace: true });
  }, [filter.range.from, filter.range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const revisedOnly = filter.state === 'rewizje';
  const exports = useExports({
    from: filter.range.from === '' ? undefined : filter.range.from,
    to: filter.range.to === '' ? undefined : filter.range.to,
    state: exportStateOfSlug(filter.state) ?? undefined,
    limit: EXPORT_LIST_LIMIT,
  });
  // Próg „operacja wisi" z zegara SERWERA - ta sama odpowiedź, która liczy plakietkę
  // w kolumnie. Bez niej podpis śpi, zamiast liczyć progiem z przeglądarki.
  const attention = useAttention();
  const windowMs = attention.data?.correctionWindowMs ?? Number.POSITIVE_INFINITY;
  const me = useSession();
  const canRetry = can(me.data?.capabilities, 'fleet.manage');

  const items = exports.data?.items ?? [];
  const rows = items
    .map((item) => exportRow(item, now, windowMs))
    .filter((row) => !revisedOnly || row.revised);
  const truncated = exports.data?.truncated === true;

  const columns: Column<ExportRow>[] = [
    {
      key: 'card',
      header: 'Karta',
      render: (row) => (
        <>
          <span className="reg">{row.tab}</span>
          <span className="cell-sub">{row.cardSub}</span>
        </>
      ),
    },
    {
      key: 'operation',
      header: 'Operacja',
      render: (row) => (
        <>
          <span className="cell-sub mono">{row.operation}</span>
          <span className="cell-sub">{row.pilot}</span>
        </>
      ),
    },
    {
      key: 'state',
      header: 'Stan',
      render: (row) => (
        <>
          <Pill tone={row.stateTone}>{row.stateLabel}</Pill>
          {row.stateNote == null ? null : (
            <span className={row.stateNoteWarn ? 'cell-sub warn' : 'cell-sub'}>{row.stateNote}</span>
          )}
        </>
      ),
    },
    { key: 'revision', header: 'Rewizja', align: 'num', render: (row) => row.revision },
    { key: 'exportedAt', header: 'Wysłano', align: 'num', render: (row) => row.exportedAt },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      render: (row) =>
        row.action === 'flag' && row.blockingFlagId != null ? (
          <LinkButton to={flagPath(row.blockingFlagId, NO_FLAG)} size="sm" variant="ghost">
            Do rozjazdu
          </LinkButton>
        ) : row.action === 'retry' && canRetry && row.state === 'missing' ? (
          // Ponowienie z wiersza wyłącznie przy BRAKU karty - to jedyna sytuacja, w której
          // klik z listy jest oczywisty; kartę w arkuszu ponawia się z szuflady, po
          // obejrzeniu, co w niej leży.
          <Button size="sm" onClick={(event) => { event.stopPropagation(); navigate(exportPath(row.sessionUuid, filter)); }}>
            Ponów
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: 'Do sprawdzenia', to: ATTENTION }, { label: 'Karty dnia' }]} />

      <PageHead title="Karty dnia" sub={exports.data == null ? undefined : exportsSubtitle(exports.data.counts)} />

      <div className="filters">
        <DateRange range={filter.range} now={now} onChange={(range: DayRange) => setFilter({ ...filter, range })} />
        <FilterChip label="Wszystkie" on={filter.state == null} onToggle={() => setFilter({ ...filter, state: null })} />
        {EXPORT_CHIPS.map((chip) => (
          <FilterChip
            key={chip.slug}
            label={chip.label}
            on={filter.state === chip.slug}
            onToggle={() => setFilter({ ...filter, state: filter.state === chip.slug ? null : chip.slug })}
          />
        ))}
      </div>

      {exports.error == null ? null : <Banner tone="danger">{errorMessage(exports.error)}</Banner>}

      <Loadable
        pending={exports.isPending}
        skeleton={<TableSkeleton headers={HEADERS} widths={[150, 170, 110, 40, 80, 60]} rows={6} />}
      >
        {rows.length === 0 ? (
          filter.state === 'bez-karty' ? (
            <EmptyState
              icon={<ChecklistIcon />}
              title="Każda zamknięta doba ma kartę"
              note="W tym zakresie nie brakuje żadnej karty w arkuszu."
            />
          ) : (
            <EmptyState
              icon={<SheetIcon size={20} />}
              title={filter.state == null ? 'Nikt nie latał w tym zakresie' : 'Nic w tym zawężeniu'}
              note={filter.state == null ? 'Zmień zakres dat.' : 'Zdejmij chip stanu albo zmień zakres dat.'}
            />
          )
        ) : (
          <>
            <DataTable
              caption="Karty dnia w zakresie"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.sessionUuid}
              rowClass={(row) =>
                [row.voided ? 'voided' : null, row.sessionUuid === uuid ? 'opened' : null].filter((c) => c != null).join(' ') || undefined
              }
              onRowClick={(row) => navigate(exportPath(row.sessionUuid, filter))}
            />
            {truncated ? (
              <p className="list-foot">
                Pokazano {items.length} z {exports.data?.matched ?? items.length} operacji - zawęź zakres dat, żeby
                zobaczyć resztę. Liczniki w nagłówku obejmują cały zakres.
              </p>
            ) : null}
          </>
        )}
      </Loadable>

      {uuid == null ? null : (
        <ExportDrawer
          sessionUuid={uuid}
          items={exports.data?.items ?? null}
          listPending={exports.isPending}
          canRetry={canRetry}
          onClose={() => navigate(exportsPath(filter))}
        />
      )}
    </>
  );
}
