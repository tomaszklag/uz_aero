/**
 * Ninerdeck - panel 2.0: DZIENNIK, poziom 1 - flota albo piloci w zakresie dat (`#/dziennik`).
 *
 * ══ DWIE OSIE, JEDEN EKRAN (3.2.0, `docs/panel-3.2.md` §4.1) ══
 * Ten sam zakres, ten sam zbiór operacji i dwa pytania: „czym latano" (oś maszyn)
 * i „kto latał" (oś pilotów). To jest PRZEŁĄCZNIK OSI, nie drugi moduł - segment stoi
 * przed datami, bo zmienia pytanie, a daty tylko je zawężają. Oś maszyn jest domyślna
 * i nie stoi w adresie; oś pilotów to `?os=piloci`. Obie dzielą zakres dat.
 *
 * Oś maszyn obejmuje CAŁĄ flotę, także maszyny, które w zakresie nie latały: wiersz zer
 * jest odpowiedzią, po którą się przyszło („czy SP-KLM w ogóle ruszył w sierpniu").
 * Oś pilotów pokazuje tych, którzy LATALI (dowódca albo drugi pilot), a członków bez
 * lotów ZWIJA w jeden wiersz pod listą (decyzja właściciela 2026-09-26, §17.1).
 *
 * Bez kafli z licznikami: sumy po całej flocie to dokładnie ten „kafel z przypisem",
 * który panel 2.0 wyrzucił (`docs/panel-2.0.md` §3.1 reguła 7).
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import type { LogRangeDto } from '../../api/dto';
import { useLogFleet, useLogPilots } from '../../queries/useLog';
import {
  Banner,
  DataTable,
  EmptyState,
  Loadable,
  PageHead,
  TableSkeleton,
  type Column,
  type RowFold,
} from '../../ui/components';
import { PeopleIcon, PlaneIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { NONE } from '../common/values';
import { DateRange } from './DateRange';
import type { DayRange } from './dateRanges';
import {
  idleFoldLabels,
  idlePilotRow,
  logbookPilotRow,
  logbookRow,
  type LogbookPilotRow,
  type LogbookRow,
} from './logbookRows';
import { aircraftLogPath, logbookPath, pilotLogPath, type LogAxis } from './logbookPaths';

const FLEET_HEADERS = ['Samolot', 'Dni', 'Starty', 'Silnik', 'W powietrzu', 'Paliwo', 'Motogodziny', ''];
const PILOT_HEADERS = ['Pilot', 'Dni', 'Operacje', 'Loty', 'Blok', 'Lot', 'Drugi pilot', 'Samoloty', ''];

export function LogbookScreen() {
  const [params] = useSearchParams();
  const axis: LogAxis = params.get('os') === 'piloci' ? 'piloci' : 'samoloty';

  return (
    <>
      <PageHead title="Dziennik" />
      {axis === 'piloci' ? <PilotAxis /> : <FleetAxis />}
    </>
  );
}

/**
 * Zakres z adresu, uzupełniony odpowiedzią serwera. Zakres ZAWSZE stoi w adresie -
 * także domyślny. Adres z paska przeglądarki ma być kompletny, bo jego wklejenie
 * w rozmowie jest podstawowym scenariuszem panelu. Kotwicą jest odpowiedź SERWERA,
 * nie zegar przeglądarki.
 */
function useLogRange(axis: LogAxis, reported: LogRangeDto | undefined, at: string | undefined) {
  const [params, setParams] = useSearchParams();
  const from = params.get('od') ?? undefined;
  const to = params.get('do') ?? undefined;

  useEffect(() => {
    if (reported == null || !reported.defaulted) return;
    const next = new URLSearchParams(params);
    next.set('od', reported.from);
    next.set('do', reported.to);
    setParams(next, { replace: true });
  }, [reported]); // eslint-disable-line react-hooks/exhaustive-deps

  const range: DayRange = { from: from ?? reported?.from ?? '', to: to ?? reported?.to ?? '' };
  const now = at == null ? Date.now() : Date.parse(at);
  const setRange = (next: DayRange): void => {
    const query = new URLSearchParams();
    if (axis === 'piloci') query.set('os', 'piloci');
    query.set('od', next.from);
    query.set('do', next.to);
    setParams(query, { replace: true });
  };

  return { from, to, range, now, setRange };
}

/** Segment osi: dokładnie jedna pozycja zawsze włączona; obie niosą bieżący zakres. */
function AxisSwitch({ axis, range }: { axis: LogAxis; range: DayRange }) {
  return (
    <div className="seg" role="group" aria-label="Oś dziennika">
      <Link
        className={axis === 'samoloty' ? 'seg-btn on' : 'seg-btn'}
        aria-current={axis === 'samoloty' ? 'page' : undefined}
        to={logbookPath('samoloty', range)}
      >
        Samoloty
      </Link>
      <Link
        className={axis === 'piloci' ? 'seg-btn on' : 'seg-btn'}
        aria-current={axis === 'piloci' ? 'page' : undefined}
        to={logbookPath('piloci', range)}
      >
        Piloci
      </Link>
    </div>
  );
}

function FleetAxis() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const report = useLogFleet({ from: params.get('od') ?? undefined, to: params.get('do') ?? undefined });
  const { range, now, setRange } = useLogRange('samoloty', report.data?.range, report.data?.at);

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
      render: () => (
        <span className="cell-go" aria-hidden="true">
          →
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="filters">
        <AxisSwitch axis="samoloty" range={range} />
        <DateRange range={range} now={now} onChange={setRange} />
      </div>

      {report.error == null ? null : <Banner tone="danger">{errorMessage(report.error)}</Banner>}

      <Loadable
        pending={report.isPending}
        skeleton={
          <TableSkeleton headers={FLEET_HEADERS} widths={[86, 30, 34, 48, 48, 56, 60, 20]} rows={5} />
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
            onRowClick={(row) => navigate(aircraftLogPath(row.reg, range))}
          />
        )}
      </Loadable>
    </>
  );
}

function PilotAxis() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Rozwinięcie zwiniętych jest częścią pytania do serwera (`idle=1`): lista nazwisk
  // dojeżdża dopiero na żądanie, bo zwykle nikt jej nie rozwija.
  const [expanded, setExpanded] = useState(false);
  const report = useLogPilots({
    from: params.get('od') ?? undefined,
    to: params.get('do') ?? undefined,
    idle: expanded,
  });
  const { range, now, setRange } = useLogRange('piloci', report.data?.range, report.data?.at);

  const rows = (report.data?.pilots ?? []).map(logbookPilotRow);
  const idleCount = report.data?.idle.count ?? 0;
  const labels = idleFoldLabels(idleCount);
  // Wiersz zwinięcia istnieje WYŁĄCZNIE z liczbą: „+0 członków" byłoby zdaniem o niczym.
  const fold: RowFold<LogbookPilotRow> | undefined =
    idleCount === 0
      ? undefined
      : {
          label: labels.closed,
          openLabel: labels.open,
          expanded,
          onToggle: () => setExpanded((open) => !open),
          rows: (report.data?.idle.members ?? []).map(idlePilotRow),
        };

  const columns: Column<LogbookPilotRow>[] = [
    {
      key: 'pilot',
      header: 'Pilot',
      render: (row) => (
        <>
          <span className="cell-strong">{row.name}</span>
          <span className="cell-sub mono">{row.code}</span>
          {row.now == null ? null : <span className="cell-sub warn">{row.now}</span>}
          {row.note == null ? null : <span className="cell-sub">{row.note}</span>}
        </>
      ),
    },
    { key: 'days', header: 'Dni', align: 'num', render: (row) => row.days },
    { key: 'operations', header: 'Operacje', align: 'num', render: (row) => row.operations },
    { key: 'flights', header: 'Loty', align: 'num', render: (row) => row.flights },
    { key: 'block', header: 'Blok', align: 'num', render: (row) => row.block },
    { key: 'flight', header: 'Lot', align: 'num', render: (row) => row.flight },
    {
      key: 'dual',
      header: 'Drugi pilot',
      align: 'num',
      render: (row) =>
        row.dual == null ? (
          NONE
        ) : (
          <>
            {row.dual.block}
            <span className="cell-sub">{row.dual.note}</span>
          </>
        ),
    },
    {
      key: 'regs',
      header: 'Samoloty',
      render: (row) =>
        row.regs.length === 0
          ? NONE
          : row.regs.map((reg, index) => (
              <span key={reg}>
                {index === 0 ? null : ' '}
                <span className="reg">{reg}</span>
              </span>
            )),
    },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      render: () => (
        <span className="cell-go" aria-hidden="true">
          →
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="filters">
        <AxisSwitch axis="piloci" range={range} />
        <DateRange range={range} now={now} onChange={setRange} />
      </div>

      {report.error == null ? null : <Banner tone="danger">{errorMessage(report.error)}</Banner>}

      <Loadable
        pending={report.isPending}
        skeleton={
          <TableSkeleton headers={PILOT_HEADERS} widths={[120, 24, 40, 30, 44, 44, 44, 110, 20]} rows={5} />
        }
      >
        {rows.length === 0 && idleCount === 0 ? (
          <EmptyState
            icon={<PeopleIcon size={20} />}
            title="Nie ma jeszcze żadnego członka klubu"
            note="Podaj pilotom kod klubu, żeby mogli dołączyć."
          />
        ) : (
          <DataTable
            caption="Piloci w wybranym zakresie dat"
            columns={columns}
            rows={rows}
            fold={fold}
            rowKey={(row) => row.pilotId}
            onRowClick={(row) => navigate(pilotLogPath(row.code, range))}
          />
        )}
      </Loadable>
    </>
  );
}
