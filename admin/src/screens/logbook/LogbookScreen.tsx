/**
 * UZ Aero - panel 2.0: DZIENNIK, poziom 1 - flota w zakresie dat (`#/dziennik`).
 *
 * Lista obejmuje CAŁĄ flotę, także maszyny, które w zakresie nie latały: wiersz zer
 * jest odpowiedzią, po którą się przyszło („czy SP-KLM w ogóle ruszył w sierpniu").
 * Dzięki temu nie istnieje stan „nic nie latało" - jest tabela, która przy okazji
 * mówi, jakie maszyny klub ma.
 *
 * Bez kafli z licznikami: sumy po całej flocie to dokładnie ten „kafel z przypisem",
 * który panel 2.0 wyrzucił (`docs/panel-2.0.md` §3.1 reguła 7).
 */

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useLogFleet } from '../../queries/useLog';
import {
  Banner,
  DataTable,
  EmptyState,
  Loadable,
  PageHead,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { PlaneIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { DateRange } from './DateRange';
import { logbookRow, type LogbookRow } from './logbookRows';
import type { DayRange } from './dateRanges';

const HEADERS = ['Samolot', 'Dni', 'Starty', 'Silnik', 'W powietrzu', 'Paliwo', 'Motogodziny', ''];

export function LogbookScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const from = params.get('od') ?? undefined;
  const to = params.get('do') ?? undefined;
  const report = useLogFleet({ from, to });

  // Zakres ZAWSZE stoi w adresie - także domyślny. Adres z paska przeglądarki ma być
  // kompletny, bo jego wklejenie w rozmowie jest podstawowym scenariuszem panelu.
  // Kotwicą jest odpowiedź SERWERA, nie zegar przeglądarki.
  useEffect(() => {
    if (report.data == null || !report.data.range.defaulted) return;
    const next = new URLSearchParams(params);
    next.set('od', report.data.range.from);
    next.set('do', report.data.range.to);
    setParams(next, { replace: true });
  }, [report.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const range: DayRange = {
    from: from ?? report.data?.range.from ?? '',
    to: to ?? report.data?.range.to ?? '',
  };
  const now = report.data == null ? Date.now() : Date.parse(report.data.at);

  const setRange = (next: DayRange): void => {
    const params = new URLSearchParams({ od: next.from, do: next.to });
    setParams(params, { replace: true });
  };

  const rows = (report.data?.aircraft ?? []).map(logbookRow);

  const columns: Column<LogbookRow>[] = [
    {
      key: 'reg',
      header: 'Samolot',
      render: (row) => (
        <>
          <span className="reg">{row.reg}</span>
          <span className="cell-sub">{row.aircraftType}</span>
          {row.flyingNow == null ? null : <span className="cell-sub warn">{row.flyingNow}</span>}
        </>
      ),
    },
    { key: 'days', header: 'Dni', align: 'num', render: (row) => row.days },
    { key: 'takeoffs', header: 'Starty', align: 'num', render: (row) => row.takeoffs },
    { key: 'engine', header: 'Silnik', align: 'num', render: (row) => row.engine },
    { key: 'airborne', header: 'W powietrzu', align: 'num', render: (row) => row.airborne },
    { key: 'fuel', header: 'Paliwo', align: 'num', render: (row) => row.fuel },
    { key: 'moto', header: 'Motogodziny', align: 'num', render: (row) => row.moto },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      render: (row) => (
        <span className="cell-go" aria-hidden="true">
          →
        </span>
      ),
    },
  ];

  const openAircraft = (row: LogbookRow): void => {
    navigate({ pathname: `/dziennik/${row.reg}`, search: `?od=${range.from}&do=${range.to}` });
  };

  return (
    <>
      <PageHead title="DZIENNIK" />

      <div className="filters">
        <DateRange range={range} now={now} onChange={setRange} />
      </div>

      {report.error == null ? null : <Banner tone="danger">{errorMessage(report.error)}</Banner>}

      <Loadable
        pending={report.isPending}
        skeleton={
          <TableSkeleton headers={HEADERS} widths={[86, 30, 34, 48, 48, 56, 60, 20]} rows={5} />
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<PlaneIcon size={20} />}
            title="Nie ma jeszcze żadnego samolotu"
            note="Załóż flotę, żeby piloci mieli na czym latać."
          />
        ) : (
          <DataTable
            caption="Flota w wybranym zakresie dat"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.aircraftId}
            rowClass={(row) => (row.idle ? 'muted' : undefined)}
            onRowClick={openAircraft}
          />
        )}
      </Loadable>
    </>
  );
}
