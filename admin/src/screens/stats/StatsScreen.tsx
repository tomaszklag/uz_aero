/**
 * UZ Aero — panel: STATYSTYKI FLOTY I PILOTÓW (`design/admin/A10-statystyki.html`).
 *
 * ══ KONSTYTUCJA EKRANU ══
 * Każda liczba to złożenie projekcji `projectSession` z pojedynczych sesji — panel
 * SUMUJE GOTOWE WYNIKI, nie liczy własnych metryk. Wszystkie sumy, średnie i procenty
 * przychodzą w `GET /admin/api/stats`; moduły czyste obok liczą wyłącznie NAPISY
 * i GEOMETRIĘ wykresów (szerokości pasków, punkty polyline). Dni jeszcze otwarte są
 * celowo poza zakresem — ich sumy zmieniłyby się po zamknięciu — a ekran mówi, ile
 * takich dni pominął.
 *
 * ══ TRZY UJĘCIA, JEDNA ODPOWIEDŹ ══
 * Przełącznik „per samolot / pilot / operacja" wybiera tabelę z TEJ SAMEJ odpowiedzi
 * serwera — sumy muszą się zgadzać między ujęciami i dlatego porównuje się je,
 * przełączając w miejscu (komentarz w mockupie). Ujęcie i zakres żyją w URL-u
 * (`?od=…&do=…&ujecie=…`), żeby raport dało się wkleić w wiadomości.
 *
 * ══ CZEGO TEN EKRAN ŚWIADOMIE NIE POKAZUJE ══
 *  1. **Kolumny „Blok jako Dual"** — backend nie ma jej z czego uczciwie policzyć
 *     (projekcja niesie ostatniego duala dnia); wyjaśnienie pod tabelą pilotów.
 *  2. **Zer w miejscach niewiedzy** — wiersze projekcji sprzed migracji 18 unieważniają
 *     agregaty jej kolumn: kafle mówią „—", a baner kieruje na przebudowę (`A11`).
 */

import { Link, useSearchParams } from 'react-router-dom';

import type { StatsReportDto } from '../../api/dto';
import { useStats } from '../../queries/useStats';
import {
  Banner,
  Button,
  Card,
  Columns,
  DataTable,
  DuoRow,
  FilterBar,
  FilterChip,
  LinkButton,
  MeterRow,
  PageHead,
  Pill,
  RibbonBar,
  ShareBar,
  Tile,
  TileGrid,
  TrendChart,
  type Column,
} from '../../ui/components';
import { aircraftRows, type AircraftRowView } from './statsAircraftRows';
import { duoRows, meterRows } from './statsCompare';
import { statsCsv, statsCsvFilename } from './statsCsv';
import { dropsView, type ClientRowView } from './statsDrops';
import {
  filterFromParams,
  isPresetActive,
  paramsFromFilter,
  statsPresets,
  statsQuery,
  type StatsFilter,
  type StatsView,
} from './statsFilters';
import { operationRows, type OperationRowView } from './statsOperationRows';
import { pilotRows, PILOTS_HINT, type PilotRowView } from './statsPilotRows';
import { statsPageSub, rangeChipLabel, rangeChipTitle } from './statsSummary';
import { statsTiles } from './statsTiles';
import { trendView } from './statsTrend';

/** Kolumny ujęcia „per samolot" — 1:1 z `thead` mockupu. */
const AIRCRAFT_COLUMNS: Column<AircraftRowView>[] = [
  {
    key: 'aircraft',
    header: 'Samolot',
    render: (row) => (
      <>
        <span className={row.total ? 'cell-strong' : 'reg'}>{row.name}</span>
        {row.sub == null ? null : <span className="cell-sub">{row.sub}</span>}
      </>
    ),
  },
  { key: 'days', header: 'Dni', align: 'num', render: (row) => strong(row.days, row.total) },
  {
    key: 'block',
    header: 'Blok',
    align: 'num',
    render: (row) => <span className={joined('cell-strong', row.blockClass)}>{row.block}</span>,
  },
  {
    key: 'flight',
    header: 'Czas lotu',
    align: 'num',
    render: (row) => <span className={row.flightClass}>{row.flight}</span>,
  },
  {
    key: 'tl',
    header: 'Starty / lądowania',
    align: 'num',
    render: (row) => strong(row.takeoffsLandings, row.total),
  },
  {
    key: 'fuel',
    header: 'Paliwo',
    align: 'num',
    render: (row) => <span className={joined(row.total ? 'cell-strong' : undefined, row.fuelClass)}>{row.fuel}</span>,
  },
  { key: 'lph', header: 'Śr. L/h', align: 'num', render: (row) => row.avgLph },
  {
    key: 'mh-range',
    header: 'MH start → koniec',
    align: 'num',
    render: (row) => (
      <>
        {row.mhRange}
        {row.mhRangeSub == null ? null : <span className="cell-sub">{row.mhRangeSub}</span>}
      </>
    ),
  },
  { key: 'mh-delta', header: 'Δ MH', align: 'num', render: (row) => strong(row.mhDelta, row.total) },
  {
    key: 'utilization',
    header: 'Wykorzystanie',
    align: 'num',
    render: (row) => row.utilization,
  },
  {
    // Przejście do analityki zużycia (`A10a`): rozbicie „Śr. L/h" na fazy, przelicznik
    // motogodzin i interwały ze źródłami. Wiersz RAZEM go nie ma — stawki floty nie
    // składają się w jedną liczbę.
    key: 'analytics',
    header: '',
    render: (row) =>
      row.aircraftId == null ? null : (
        <div className="row-actions">
          <Link className="btn sm ghost" to={`/statystyki/analityka/${row.aircraftId}`}>
            Analityka
          </Link>
        </div>
      ),
  },
];

const PILOT_COLUMNS: Column<PilotRowView>[] = [
  {
    key: 'pilot',
    header: 'Pilot',
    render: (row) => <span className="cell-strong">{row.name}</span>,
  },
  { key: 'code', header: 'Kod', cellClass: 'mono', render: (row) => row.code },
  { key: 'days', header: 'Dni', align: 'num', render: (row) => strong(row.days, row.total) },
  {
    key: 'block',
    header: 'Blok jako PIC',
    align: 'num',
    render: (row) => <span className={joined('cell-strong', row.blockClass)}>{row.blockPic}</span>,
  },
  {
    key: 'flight',
    header: 'Czas lotu',
    align: 'num',
    render: (row) => <span className={row.flightClass}>{row.flight}</span>,
  },
  {
    key: 'tl',
    header: 'Starty / lądowania',
    align: 'num',
    render: (row) => strong(row.takeoffsLandings, row.total),
  },
  { key: 'regs', header: 'Samoloty', cellClass: 'mono dim', render: (row) => row.regs },
];

const OPERATION_COLUMNS: Column<OperationRowView>[] = [
  {
    key: 'operation',
    header: 'Operacja',
    render: (row) =>
      row.total ? (
        <span className="cell-strong">RAZEM</span>
      ) : (
        <>
          <Pill tone={row.pill.tone}>{row.pill.label}</Pill>
          {row.sub == null ? null : <span className="cell-sub">{row.sub}</span>}
        </>
      ),
  },
  { key: 'days', header: 'Dni', align: 'num', render: (row) => strong(row.days, row.total) },
  {
    key: 'block',
    header: 'Blok',
    align: 'num',
    render: (row) => <span className={joined('cell-strong', row.blockClass)}>{row.block}</span>,
  },
  {
    key: 'flight',
    header: 'Czas lotu',
    align: 'num',
    render: (row) => <span className={row.flightClass}>{row.flight}</span>,
  },
  {
    key: 'tl',
    header: 'Starty / lądowania',
    align: 'num',
    render: (row) => strong(row.takeoffsLandings, row.total),
  },
  {
    key: 'fuel',
    header: 'Paliwo',
    align: 'num',
    render: (row) => <span className={joined(row.total ? 'cell-strong' : undefined, row.fuelClass)}>{row.fuel}</span>,
  },
  { key: 'lph', header: 'Śr. L/h', align: 'num', render: (row) => row.avgLph },
  {
    key: 'share',
    header: 'Udział w nalocie',
    render: (row) =>
      row.share == null ? (
        row.shareText
      ) : (
        <ShareBar width={row.share.width} blue={row.share.blue} label={row.share.label} />
      ),
  },
];

const CLIENT_COLUMNS: Column<ClientRowView>[] = [
  {
    key: 'client',
    header: 'Klient',
    render: (row) => <span className="cell-strong">{row.client}</span>,
  },
  { key: 'lifts', header: 'Wyniesień', align: 'num', render: (row) => strong(row.lifts, row.total) },
  {
    key: 'jumpers',
    header: 'Skoczków',
    align: 'num',
    render: (row) => <span className={joined('cell-strong', row.jumpersClass)}>{row.jumpers}</span>,
  },
  { key: 'tandem', header: 'Tandem', align: 'num', render: (row) => strong(row.tandem, row.total) },
  { key: 'aff', header: 'AFF', align: 'num', render: (row) => strong(row.aff, row.total) },
  { key: 'solo', header: 'Solo', align: 'num', render: (row) => strong(row.solo, row.total) },
  {
    key: 'alt',
    header: 'Śr. wysokość',
    align: 'num',
    render: (row) => strong(row.avgAltitude, row.total),
  },
  {
    key: 'per-lift',
    header: 'Skoczków / wyniesienie',
    align: 'num',
    render: (row) => strong(row.perLift, row.total),
  },
];

export function StatsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterFromParams(searchParams);
  const report = useStats(statsQuery(filter));
  const data = report.data ?? null;

  const apply = (next: StatsFilter): void => setSearchParams(paramsFromFilter(next));
  const setView = (view: StatsView): void => apply({ ...filter, view });

  const tiles = statsTiles(data);
  const trend = data == null ? null : trendView(data.daily);
  const duos = data == null ? [] : duoRows(data.aircraft);
  const meters = data == null ? [] : meterRows(data.aircraft);
  const aircraft = data == null ? [] : aircraftRows(data.aircraft, data.totals);
  const pilots = data == null ? [] : pilotRows(data.pilots, data.totals);
  const operations = data == null ? [] : operationRows(data.operations, data.totals);
  const drops = data == null ? null : dropsView(data.drops, data.operations);
  const presets = data == null ? [] : statsPresets(data.at);

  const downloadCsv = (): void => {
    if (data == null) return;
    const input = { view: filter.view, range: data.range, aircraft, pilots, operations };
    const blob = new Blob([statsCsv(input)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = statsCsvFilename(input);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead
        title="STATYSTYKI FLOTY I PILOTÓW"
        sub={statsPageSub(data?.totals ?? null)}
        actions={
          <Button
            variant="primary"
            onClick={downloadCsv}
            disabled={data == null}
            reason={data == null ? 'raport się nie pobrał' : undefined}
          >
            Eksport zestawienia do CSV
          </Button>
        }
      />

      {report.isError ? (
        <Banner tone="danger" live>
          <b>Nie udało się pobrać statystyk.</b> Panel działa wyłącznie online. Kafle
          poniżej pokazują <b>„—", a nie zero</b> — „0 startów w lipcu" przy awarii
          pobrania byłoby fałszywym twierdzeniem o świecie.{' '}
          <Button variant="ghost" size="sm" onClick={() => void report.refetch()}>
            Ponów
          </Button>
        </Banner>
      ) : null}

      {data != null && data.totals.staleRows > 0 ? (
        <Banner tone="warn">
          <b>
            {data.totals.staleRows} wierszy projekcji w zakresie pochodzi sprzed migracji 18.
          </b>{' '}
          Sumy startów i lądowań, paliwa, Δ MH oraz cała sekcja zrzutów jadą jako kreski —
          suma po części wierszy podana jako całość byłaby kłamstwem. Przelicz projekcję
          na ekranie Konserwacja.{' '}
          <LinkButton to="/konserwacja" variant="ghost" size="sm">
            Konserwacja
          </LinkButton>
        </Banner>
      ) : null}

      <FilterBar>
        <FilterChip
          label={rangeChipLabel(data?.range ?? null)}
          active
          title={rangeChipTitle(data?.range ?? null)}
          onClick={() => apply({ ...filter, from: null, to: null })}
        />
        {presets.map((preset) => (
          <FilterChip
            key={preset.key}
            label={preset.label}
            active={isPresetActive(filter, preset)}
            onClick={() => apply({ ...filter, from: preset.from, to: preset.to })}
          />
        ))}
        <span className="filters-sep" aria-hidden="true" />
        <FilterChip
          label="Ujęcie: per samolot"
          active={filter.view === 'aircraft'}
          onClick={() => setView('aircraft')}
        />
        <FilterChip
          label="per pilot"
          active={filter.view === 'pilot'}
          onClick={() => setView('pilot')}
        />
        <FilterChip
          label="per operacja"
          active={filter.view === 'operation'}
          onClick={() => setView('operation')}
        />
        <span className="filters-end">
          <Pill tone="blue" dot>
            Wszystkie czasy UTC
          </Pill>
        </span>
      </FilterBar>

      <TileGrid>
        {tiles.map((tile) => (
          <Tile
            key={tile.key}
            label={tile.label}
            value={tile.value}
            note={tile.note}
            {...(tile.unit == null ? {} : { unit: tile.unit })}
            {...(tile.tone == null ? {} : { tone: tile.tone })}
          />
        ))}
      </TileGrid>

      <Card
        title="Nalot blokowy dzień po dniu · cała flota"
        actions={
          trend == null ? null : (
            <>
              {trend.maxLabel == null ? null : <Pill tone="dim">{trend.maxLabel}</Pill>}
              <Pill tone="green">{trend.sumLabel}</Pill>
            </>
          )
        }
      >
        {trend == null ? (
          <span className="hint">Brak danych — raport się nie pobrał.</span>
        ) : (
          <>
            <TrendChart
              points={trend.points}
              zeroDots={trend.zeroDots}
              lastDot={trend.lastDot}
              axis={trend.axis}
              label={`Nalot blokowy dzień po dniu, ${rangeChipLabel(data?.range ?? null)}`}
            />
            {trend.zeroNote == null ? null : <span className="hint">{trend.zeroNote}</span>}
          </>
        )}
      </Card>

      <Columns even>
        <Card
          title="Nalot: blok vs czas lotu"
          actions={
            <>
              <Pill tone="green">blok</Pill>
              <Pill tone="blue">lot</Pill>
            </>
          }
        >
          {duos.length === 0 ? (
            <span className="hint">Zakres bez zamkniętych dni — nie ma czego porównywać.</span>
          ) : (
            duos.map((row) => (
              <DuoRow
                key={row.key}
                name={row.name}
                blockWidth={row.blockWidth}
                blockLabel={row.blockLabel}
                flightWidth={row.flightWidth}
                flightLabel={row.flightLabel}
              />
            ))
          )}
          <span className="hint">
            Różnica między słupkami to czas z pracującym silnikiem poza lotem — kołowanie,
            załadunek skoczków, oczekiwanie. Przy operacji skokowej bywa duża i to jest
            normalna charakterystyka operacji, nie błąd danych.
          </span>
        </Card>

        <Card
          title="Wykorzystanie floty"
          actions={
            <Pill tone="dim">{`dni lotne / ${data?.range.calendarDays ?? '—'}`}</Pill>
          }
        >
          {meters.length === 0 ? (
            <span className="hint">Zakres bez zamkniętych dni — nie ma czego mierzyć.</span>
          ) : (
            meters.map((row) => (
              <MeterRow
                key={row.key}
                name={row.name}
                width={row.width}
                amber={row.amber}
                label={row.label}
              />
            ))
          )}
          <span className="hint">
            Wykorzystanie liczymy jako liczbę dni z co najmniej jedną zamkniętą sesją, nie
            jako godziny na dobę — samolot stojący cały dzień z jednym lotem jest
            wykorzystany, choć nalot ma mały. Do godzin służy wykres obok.
          </span>
        </Card>
      </Columns>

      {filter.view === 'aircraft' ? (
        <div>
          <DataTable
            columns={AIRCRAFT_COLUMNS}
            rows={aircraft}
            rowKey={(row) => row.key}
            rowClass={(row) => (row.total ? 'row-total' : undefined)}
            caption="Statystyki zakresu w ujęciu per samolot, razem z wierszem RAZEM"
          />
          <span className="hint table-hint">
            Kolumna „Śr. L/h" nie sumuje się do wiersza RAZEM — średnia ze średnich nie
            jest średnią. Dla całej floty wyszłaby liczba, która wygląda na sensowną,
            a nie znaczy nic, bo jednostki palą w innych skalach. Dlatego panel stawia
            tam kreskę.
          </span>
        </div>
      ) : null}

      {filter.view === 'pilot' ? (
        <div>
          <DataTable
            columns={PILOT_COLUMNS}
            rows={pilots}
            rowKey={(row) => row.key}
            rowClass={(row) => (row.total ? 'row-total' : undefined)}
            caption="Statystyki zakresu w ujęciu per pilot, razem z wierszem RAZEM"
          />
          <span className="hint table-hint">{PILOTS_HINT}</span>
        </div>
      ) : null}

      {filter.view === 'operation' ? (
        <div>
          <DataTable
            columns={OPERATION_COLUMNS}
            rows={operations}
            rowKey={(row) => row.key}
            rowClass={(row) => (row.total ? 'row-total' : undefined)}
            caption="Statystyki zakresu w ujęciu per operacja, razem z wierszem RAZEM"
          />
          <span className="hint table-hint">
            Podpisy wierszy niosą rejestracje i liczbę klientów z projekcji — list lotnisk
            projekcja nie ma i panel ich nie zmyśla.
          </span>
        </div>
      ) : null}

      {drops == null ? null : (
        <Card
          title={<span className="cell-blue">Strona przychodowa · zrzuty</span>}
          actions={
            <>
              {drops.pills.map((pill) => (
                <Pill key={pill.key} tone={pill.tone}>
                  {pill.label}
                </Pill>
              ))}
            </>
          }
        >
          <TileGrid>
            {drops.tiles.map((tile) => (
              <Tile
                key={tile.key}
                label={tile.label}
                value={tile.value}
                note={tile.note}
                {...(tile.unit == null ? {} : { unit: tile.unit })}
                {...(tile.tone == null ? {} : { tone: tile.tone })}
              />
            ))}
          </TileGrid>

          {drops.note == null ? null : (
            <Banner tone={drops.state === 'stale' ? 'warn' : 'status'}>{drops.note}</Banner>
          )}

          {drops.ribbon.length === 0 ? null : (
            <>
              <span className="label">Rozbicie na typy skoków</span>
              <RibbonBar
                segments={drops.ribbon}
                label="Rozbicie skoczków na typy: tandem, AFF i solo"
              />
              <span className="hint">
                Rozbicie bierze się wprost z payloadu `drop.jumpers` — panel nie dokłada tu
                cennika, bo cennik nie jest danymi lotniczymi i nie ma go w rejestrze.
              </span>
            </>
          )}

          {drops.clients.length === 0 ? null : (
            <DataTable
              columns={CLIENT_COLUMNS}
              rows={drops.clients}
              rowKey={(row) => row.key}
              rowClass={(row) => (row.total ? 'row-total' : undefined)}
              caption="Rozliczenie zrzutów per klient, razem z wierszem RAZEM"
            />
          )}
        </Card>
      )}
    </>
  );
}

/** Wiersz RAZEM pogrubia komórki — zwykły zostaje przy wadze tabeli. */
function strong(value: string, total: boolean) {
  return total ? <span className="cell-strong">{value}</span> : value;
}

/** Sklejenie LISTY klas (nie nazwy klasy) — wzorzec dozwolony przez architekturę. */
function joined(...classes: (string | undefined)[]): string | undefined {
  const joined = classes.filter((c) => c != null).join(' ');
  return joined === '' ? undefined : joined;
}
