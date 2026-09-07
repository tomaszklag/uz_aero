/**
 * UZ Aero - panel 2.0: lista ZGŁOSZEŃ BŁĘDÓW (`#/zgloszenia`, issue #87).
 *
 * Moduł NA CZAS TESTÓW z pilotami. Odpowiada na jedno pytanie: co jest jeszcze do
 * zrobienia i przy którym ekranie. Stąd domyślny widok - NOWE i W TOKU, a nie wszystko:
 * po tygodniu testów archiwum przykryłoby robotę, a filtr, którego trzeba użyć, żeby
 * zobaczyć robotę, jest filtrem ustawionym źle.
 *
 * Czego tu NIE MA: wyszukiwarki (lista jednej fazy mieści się na ekranie i sortuje się
 * czasem), stronicowania (serwer oddaje do 300 pozycji i mówi o tym wprost w porcie)
 * ani kasowania - zgłoszenie nietrafione zamyka się statusem „Odrzucone" z komentarzem.
 *
 * Panel 2.0 nie ma makiet (`docs/panel-2.0.md` §3.7) - ekran powstaje wprost tutaj;
 * decyzje redakcyjne opisuje `design/ZGLOSZENIA.html`.
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import type { BugStatusDto } from '../../api/dto';
import { useBugReports } from '../../queries/useBugReports';
import {
  Banner,
  DataTable,
  EmptyState,
  FilterChip,
  Loadable,
  PageHead,
  Pill,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { InfoIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { BugDrawer } from './BugDrawer';
import { bugRow, type BugRow } from './bugRows';
import { BUG_STATUS_ORDER, BUG_WORKING_STATUSES, bugStatusLabel } from './bugStatus';

const HEADERS = ['Kiedy', 'Pilot', 'Miejsce', 'Waga', 'Opis', 'Status'];

/**
 * Zawężenie z adresu. `?status=` (pusty) znaczy WSZYSTKIE i jest stanem jawnym -
 * brak parametru to widok domyślny, czyli robota. Dwa różne stany, dwa różne adresy:
 * link do „wszystkich" ma pokazywać wszystkie także jutro.
 */
function statusesFrom(raw: string | null): readonly BugStatusDto[] {
  if (raw == null) return BUG_WORKING_STATUSES;
  const wanted = raw.split(',').filter((s) => s !== '');
  return BUG_STATUS_ORDER.filter((s) => wanted.includes(s));
}

export function BugsScreen() {
  const navigate = useNavigate();
  const { uuid } = useParams();
  const [params, setParams] = useSearchParams();

  const raw = params.get('status');
  const statuses = statusesFrom(raw);
  const bugs = useBugReports({ statuses });

  const setStatus = (value: string | null): void => {
    const next = new URLSearchParams(params);
    if (value == null) next.delete('status');
    else next.set('status', value);
    setParams(next, { replace: true });
  };

  const counts = bugs.data?.counts;
  const rows = (bugs.data?.items ?? []).map(bugRow);
  const showsAll = raw === '';

  const columns: Column<BugRow>[] = [
    { key: 'when', header: 'Kiedy', cellClass: 'cell-sub', render: (row) => row.when },
    {
      key: 'pilot',
      header: 'Pilot',
      render: (row) => (
        <>
          <span className="reg">{row.pilot}</span>
          {row.pilotName == null ? null : <span className="cell-sub">{row.pilotName}</span>}
        </>
      ),
    },
    { key: 'screen', header: 'Miejsce', cellClass: 'cell-sub', render: (row) => row.screen },
    {
      key: 'severity',
      header: 'Waga',
      render: (row) =>
        row.severityLabel == null ? null : <Pill tone={row.severityTone}>{row.severityLabel}</Pill>,
    },
    { key: 'excerpt', header: 'Opis', render: (row) => row.excerpt },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Pill tone={row.statusTone} dot>
          {row.statusLabel}
        </Pill>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="ZGŁOSZENIA"
        sub="Błędy zgłoszone z aplikacji pilota - razem z kontekstem okna, w którym powstały."
      />

      <div className="filters">
        <FilterChip
          label="Do zrobienia"
          on={raw == null}
          onToggle={() => setStatus(null)}
        />
        {BUG_STATUS_ORDER.map((status) => (
          <FilterChip
            key={status}
            /* Liczba w ETYKIECIE, nie w osobnym slocie - patrz `styles/components/bugs.css`. */
            label={
              counts == null ? bugStatusLabel(status) : `${bugStatusLabel(status)} · ${counts[status]}`
            }
            on={raw === status}
            onToggle={() => setStatus(raw === status ? null : status)}
          />
        ))}
        <FilterChip label="Wszystkie" on={showsAll} onToggle={() => setStatus(showsAll ? null : '')} />
      </div>

      {bugs.error == null ? null : <Banner tone="danger">{errorMessage(bugs.error)}</Banner>}

      <Loadable
        pending={bugs.isPending}
        skeleton={<TableSkeleton headers={HEADERS} widths={[74, 84, 150, 68, 260, 88]} rows={5} />}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<InfoIcon size={20} />}
            title={raw == null ? 'Nic nie czeka na obsługę' : 'Nic w tym zawężeniu'}
            note={
              raw == null
                ? 'Wszystkie zgłoszenia są rozwiązane albo odrzucone. Zamknięte zobaczysz filtrem obok.'
                : 'Zmień filtr, żeby zobaczyć pozostałe zgłoszenia.'
            }
          />
        ) : (
          <DataTable
            caption="Zgłoszenia błędów"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.uuid}
            rowClass={(row) => (row.muted ? 'muted' : undefined)}
            onRowClick={(row) => navigate(`/zgloszenia/${row.uuid}`)}
          />
        )}
      </Loadable>

      {uuid == null ? null : (
        <BugDrawer
          uuid={uuid}
          reports={bugs.data?.items ?? null}
          listPending={bugs.isPending}
          onClose={() => navigate({ pathname: '/zgloszenia', search: params.toString() })}
        />
      )}
    </>
  );
}
