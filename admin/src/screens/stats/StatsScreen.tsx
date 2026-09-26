/**
 * Ninerdeck - panel 3.2: STATYSTYKI (`#/statystyki?od=&do=`; `docs/panel-3.2.md` §8,
 * §17 pkt 10; makieta `statystyki`).
 *
 * Jedno pytanie ekranu: „ile tego było w tym sezonie". Sumy jako pasek faktów (nie
 * kafle - osiem płytek robiło z sum nagłówek gazety), słupki nalotu dzień po dniu
 * i trzy tabele jednego zbioru operacji z wierszem „Razem". Ta sama podstawa liczenia,
 * co dziennik (§4.5), a różnicę - statystyki liczą wyłącznie operacje zamknięte -
 * NAZYWA podtytuł.
 *
 * Analityki zużycia (pasmo, stawki fazowe) TU NIE MA: jest własnością maszyny i mieszka
 * w jej karcie (`ConsumptionCard` w szufladzie samolotu).
 */

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { StatsRangeDto, StatsReportDto } from '../../api/dto';
import { useStats } from '../../queries/useStats';
import {
  Banner,
  Card,
  DataTable,
  EmptyState,
  Loadable,
  PageHead,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { ChartIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { NONE } from '../common/values';
import { DateRange } from '../logbook/DateRange';
import { dayOf, STATS_QUICK, type DayRange } from '../logbook/dateRanges';
import {
  aircraftFoot,
  aircraftRow,
  operationFoot,
  operationRow,
  pilotFoot,
  pilotRow,
  statsBars,
  statsFacts,
  statsSubtitle,
  type StatsAircraftRow,
  type StatsOperationRow,
  type StatsPilotRow,
} from './statsRows';

const AIRCRAFT_HEADERS = ['Samolot', 'Operacje', 'Dni', 'Loty', 'Blok', 'Lot', 'Paliwo', 'Śr. L/h', 'Δ MH', 'Wykorzystanie'];

export function StatsScreen() {
  const [params, setParams] = useSearchParams();
  const from = params.get('od') ?? undefined;
  const to = params.get('do') ?? undefined;
  const report = useStats({ from, to });
  const { range, now, setRange } = useStatsRange(report.data?.range, report.data?.at);

  return (
    <>
      <PageHead title="Statystyki" sub={report.data == null ? undefined : statsSubtitle(report.data)} />

      <div className="filters">
        <DateRange range={range} now={now} quick={STATS_QUICK} onChange={setRange} />
      </div>

      {report.error == null ? null : <Banner tone="danger">{errorMessage(report.error)}</Banner>}

      <Loadable pending={report.isPending} skeleton={<StatsSkeleton />}>
        {report.data == null ? null : report.data.totals.sessions === 0 ? (
          // Stan pusty mówi o ZAKRESIE, nie o klubie - i wskazuje kontrolkę, która go
          // zmienia. Bez tabel z samymi zerami: tabela sum, w której każda liczba to zero,
          // wygląda jak awaria liczenia.
          <EmptyState
            icon={<ChartIcon size={22} />}
            title="Żadnej zamkniętej operacji w tym zakresie"
            note="Zmień zakres dat. Operacje w toku pojawią się tu po zdaniu samolotu."
          />
        ) : (
          <StatsBody report={report.data} today={dayOf(now)} />
        )}
      </Loadable>
    </>
  );
}

/**
 * Zakres z adresu, uzupełniony odpowiedzią serwera - ten sam wzorzec, co w dzienniku:
 * zakres ZAWSZE stoi w adresie, także domyślny, żeby adres z paska przeglądarki dało się
 * wkleić w komplecie. Kotwicą „dziś" jest zegar SERWERA (`at`), nie przeglądarki.
 */
function useStatsRange(reported: StatsRangeDto | undefined, at: string | undefined) {
  const [params, setParams] = useSearchParams();
  const from = params.get('od') ?? undefined;
  const to = params.get('do') ?? undefined;

  useEffect(() => {
    if (reported == null || !reported.defaulted) return;
    const next = new URLSearchParams(params);
    next.set('od', reported.fromDay);
    next.set('do', reported.toDay);
    setParams(next, { replace: true });
  }, [reported]); // eslint-disable-line react-hooks/exhaustive-deps

  const range: DayRange = { from: from ?? reported?.fromDay ?? '', to: to ?? reported?.toDay ?? '' };
  const now = at == null ? Date.now() : Date.parse(at);
  const setRange = (next: DayRange): void => {
    const query = new URLSearchParams();
    query.set('od', next.from);
    query.set('do', next.to);
    setParams(query, { replace: true });
  };

  return { range, now, setRange };
}

function StatsBody({ report, today }: { report: StatsReportDto; today: string }) {
  const facts = statsFacts(report.totals, report.range.calendarDays);
  const chart = statsBars(report.daily, report.range.fromDay, report.range.toDay, today);

  return (
    <>
      <Card title="Razem">
        <div className="track-facts">
          {facts.map((fact) => (
            <div key={fact.label} className="track-fact">
              <span className="track-fact-k">{fact.label}</span>
              <span className="track-fact-v">
                {fact.value}
                {fact.small == null ? null : <> <small>{fact.small}</small></>}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title={
          <>
            Nalot dzień po dniu <span className="card-count">· blok, UTC</span>
          </>
        }
      >
        {/* Słupki na pełnym kalendarzu zakresu - dzień bez lotów to PRAWDZIWE zero
            (kreska u podstawy), nie dziura. Wysokość względem najwyższego dnia. */}
        <div className="bars" role="img" aria-label={chart.aria}>
          {chart.bars.map((bar) => (
            <div key={bar.key} className={bar.zero ? 'bar zero' : 'bar'} title={bar.title}>
              <i style={bar.zero ? undefined : { height: `${bar.heightPct}%` }} />
              <span className="bar-label">{bar.label ?? ''}</span>
            </div>
          ))}
        </div>
        <div className="bars-axis">
          <span>{chart.axisLeft}</span>
          <span>{chart.axisRight}</span>
        </div>
      </Card>

      <AircraftTable report={report} />
      <PilotTable report={report} />
      <OperationTable report={report} />
    </>
  );
}

function Regs({ regs }: { regs: string[] }) {
  if (regs.length === 0) return <>{NONE}</>;
  return (
    <>
      {regs.map((reg, index) => (
        <span key={reg}>
          {index === 0 ? null : ' '}
          <span className="reg">{reg}</span>
        </span>
      ))}
    </>
  );
}

/* Wiersz na maszynę, która w zakresie LATAŁA - maszyna bez zamkniętej operacji nie ma
   czego wnieść (jej wiersz zer stoi w dzienniku). Kreska = nie wiemy, nigdy zero. */
function AircraftTable({ report }: { report: StatsReportDto }) {
  const rows = report.aircraft.map(aircraftRow);
  const columns: Column<StatsAircraftRow>[] = [
    {
      key: 'reg',
      header: 'Samolot',
      render: (row) => (
        <>
          <span className="reg">{row.reg}</span>
          <span className="cell-sub">{row.aircraftType}</span>
        </>
      ),
    },
    { key: 'operations', header: 'Operacje', align: 'num', render: (row) => row.operations },
    { key: 'days', header: 'Dni', align: 'num', render: (row) => row.days },
    { key: 'flights', header: 'Loty', align: 'num', render: (row) => row.flights },
    { key: 'block', header: 'Blok', align: 'num', render: (row) => row.block },
    { key: 'flight', header: 'Lot', align: 'num', render: (row) => row.flight },
    {
      key: 'fuel',
      header: 'Paliwo',
      align: 'num',
      render: (row) => (
        <>
          {row.fuel}
          {row.fuelNote == null ? null : <span className="cell-sub none">{row.fuelNote}</span>}
        </>
      ),
    },
    { key: 'avg', header: 'Śr. L/h', align: 'num', render: (row) => row.avg },
    { key: 'moto', header: 'Δ MH', align: 'num', render: (row) => row.moto },
    { key: 'utilization', header: 'Wykorzystanie', align: 'num', render: (row) => row.utilization },
  ];

  return (
    <DataTable
      caption="Nalot per samolot"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.aircraftId}
      foot={aircraftFoot(report.totals)}
    />
  );
}

/* Atrybucja po DOWÓDCY - ta sama, co na osi pilotów dziennika (jedna podstawa liczenia).
   Czas w prawym fotelu ma WŁASNĄ kolumnę i własną sumę; kolumn „Blok" i „Drugi pilot" nie
   wolno dodać - tę samą godzinę lotu szkolnego niesie wiersz instruktora i ucznia. */
function PilotTable({ report }: { report: StatsReportDto }) {
  const rows = report.pilots.map(pilotRow);
  const columns: Column<StatsPilotRow>[] = [
    {
      key: 'pilot',
      header: 'Pilot',
      render: (row) => (
        <>
          <span className="cell-strong">{row.name}</span>
          <span className="cell-sub mono">{row.code}</span>
          {row.note == null ? null : <span className="cell-sub">{row.note}</span>}
        </>
      ),
    },
    { key: 'operations', header: 'Operacje', align: 'num', render: (row) => row.operations },
    { key: 'flights', header: 'Loty', align: 'num', render: (row) => row.flights },
    { key: 'block', header: 'Blok', align: 'num', render: (row) => row.block },
    { key: 'flight', header: 'Lot', align: 'num', render: (row) => row.flight },
    { key: 'dual', header: 'Drugi pilot', align: 'num', render: (row) => row.dual },
    { key: 'regs', header: 'Samoloty', render: (row) => <Regs regs={row.regs} /> },
  ];

  return (
    <DataTable
      caption="Nalot per pilot"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.pilotId}
      foot={pilotFoot(report.totals)}
    />
  );
}

/* Udział w nalocie liczy SERWER - panel nie dzieli dwóch sum po swojemu. */
function OperationTable({ report }: { report: StatsReportDto }) {
  const rows = report.operations.map(operationRow);
  const columns: Column<StatsOperationRow>[] = [
    { key: 'label', header: 'Zadanie', render: (row) => <span className="pill dim">{row.label}</span> },
    { key: 'operations', header: 'Operacje', align: 'num', render: (row) => row.operations },
    { key: 'flights', header: 'Loty', align: 'num', render: (row) => row.flights },
    { key: 'block', header: 'Blok', align: 'num', render: (row) => row.block },
    { key: 'flight', header: 'Lot', align: 'num', render: (row) => row.flight },
    { key: 'share', header: 'Udział', align: 'num', render: (row) => row.share },
    { key: 'regs', header: 'Samoloty', render: (row) => <Regs regs={row.regs} /> },
  ];

  return (
    <DataTable
      caption="Nalot per zadanie"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      foot={operationFoot(report.totals)}
    />
  );
}

/* Pasek faktów i tabele znamy z kształtu, więc plamki idą w ich geometrii; słupki
   dostają jedną plamkę o wysokości wykresu, bo nie wiadomo, ile ich będzie widać. */
function StatsSkeleton() {
  return (
    <>
      <div className="card" aria-busy="true">
        <div className="card-title">Razem</div>
        <div className="track-facts">
          {[
            ['Operacje', 28],
            ['Loty', 28],
            ['Blok', 52],
            ['Lot', 52],
          ].map(([label, width]) => (
            <div key={label} className="track-fact">
              <span className="track-fact-k">{label}</span>
              <span className="skeleton cell" style={{ width }} />
            </div>
          ))}
        </div>
      </div>
      <div className="card" aria-busy="true">
        <div className="card-title">Nalot dzień po dniu</div>
        <span className="skeleton" style={{ display: 'block', height: 120 }} />
      </div>
      <TableSkeleton headers={AIRCRAFT_HEADERS} widths={[86, 30, 24, 30, 48, 48, 48, 36, 44, 40]} rows={3} />
    </>
  );
}
